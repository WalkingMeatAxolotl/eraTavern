from __future__ import annotations

"""LLM preset, provider, and generation API routes."""

import json
import logging
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse

import routes._helpers as _h
from game.llm_preset import (
    delete_preset,
    list_presets,
    load_preset,
    save_preset,
)
from game.llm_provider import (
    delete_provider,
    list_providers,
    load_provider,
    save_provider,
)
from routes._helpers import _ensure_ns, _format_sse, _resp

router = APIRouter()


# --- LLM Preset API ---


@router.get("/api/llm/presets")
async def get_llm_presets():
    """List all LLM presets."""
    return {"presets": list_presets()}


@router.get("/api/llm/presets/{preset_id:path}")
async def get_llm_preset(preset_id: str):
    """Get full preset data."""
    data = load_preset(preset_id)
    if data is None:
        return _resp(False, "LLM_PRESET_NOT_FOUND")
    return _resp(True, "", preset=data)


@router.put("/api/llm/presets/{preset_id:path}")
async def put_llm_preset(preset_id: str, request: Request):
    """Create or update a preset."""
    data = await request.json()
    save_preset(preset_id, data)
    return _resp(True, "")


@router.delete("/api/llm/presets/{preset_id:path}")
async def delete_llm_preset(preset_id: str):
    """Delete a preset."""
    if not delete_preset(preset_id):
        return _resp(False, "LLM_PRESET_NOT_FOUND")
    return _resp(True, "")


# --- LLM Provider API ---


@router.get("/api/llm/providers")
async def get_llm_providers():
    """List all LLM providers."""
    return {"providers": list_providers()}


@router.get("/api/llm/providers/{provider_id:path}")
async def get_llm_provider(provider_id: str):
    """Get full provider data."""
    data = load_provider(provider_id)
    if data is None:
        return _resp(False, "LLM_PROVIDER_NOT_FOUND")
    return _resp(True, "", provider=data)


@router.put("/api/llm/providers/{provider_id:path}")
async def put_llm_provider(provider_id: str, request: Request):
    """Create or update a provider."""
    data = await request.json()
    save_provider(provider_id, data)
    return _resp(True, "")


@router.delete("/api/llm/providers/{provider_id:path}")
async def delete_llm_provider(provider_id: str):
    """Delete a provider."""
    if not delete_provider(provider_id):
        return _resp(False, "LLM_PROVIDER_NOT_FOUND")
    return _resp(True, "")


@router.get("/api/llm/models")
async def get_llm_models(base_url: str = Query(...), api_key: str = Query("")):
    """Proxy request to get available models from an OpenAI-compatible API."""
    import httpx

    url = base_url.rstrip("/") + "/models"
    headers = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url, headers=headers)
        if resp.status_code != 200:
            return _resp(
                False,
                "LLM_MODELS_FETCH_FAILED",
                {
                    "status": resp.status_code,
                    "detail": resp.text[:500],
                },
            )
        body = resp.json()
        models = [m.get("id", "") for m in body.get("data", [])]
        return _resp(True, "", models=models)
    except httpx.ConnectError:
        return _resp(False, "LLM_CONNECTION_FAILED")
    except httpx.TimeoutException:
        return _resp(False, "LLM_CONNECTION_TIMEOUT")
    except Exception as e:
        return _resp(False, "LLM_CONNECTION_FAILED", {"detail": str(e)})


@router.post("/api/llm/test")
async def test_llm_connection(request: Request):
    """Test LLM API connection by sending a minimal chat completion request."""
    import httpx

    data = await request.json()
    api = data.get("api", {})
    base_url = api.get("baseUrl", "").rstrip("/")
    api_key = api.get("apiKey", "")
    model = api.get("model", "")

    if not base_url:
        return _resp(False, "LLM_BASE_URL_EMPTY")
    if not model:
        return _resp(False, "LLM_MODEL_EMPTY")

    url = base_url + "/chat/completions"
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    payload = {
        "model": model,
        "messages": [{"role": "user", "content": "Hi"}],
        "max_tokens": 1,
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(url, json=payload, headers=headers)
        if resp.status_code == 200:
            return _resp(True, "")
        return _resp(
            False,
            "LLM_TEST_FAILED",
            {
                "status": resp.status_code,
                "detail": resp.text[:500],
            },
        )
    except httpx.ConnectError:
        return _resp(False, "LLM_CONNECTION_FAILED")
    except httpx.TimeoutException:
        return _resp(False, "LLM_CONNECTION_TIMEOUT")
    except Exception as e:
        return _resp(False, "LLM_CONNECTION_FAILED", {"detail": str(e)})


@router.post("/api/llm/generate")
async def llm_generate(request: Request):
    """Trigger LLM generation. Returns SSE stream with llm_chunk/llm_done/llm_error events."""
    from game.llm_engine import (
        assemble_messages,
        call_llm_streaming,
        collect_variables,
        resolve_preset_id,
    )

    data = await request.json()

    # Accept either a preset id to load, or explicit raw_output + preset_id
    raw_output = data.get("rawOutput", "")
    target_id = data.get("targetId")
    preset_id = data.get("presetId") or resolve_preset_id(_h.game_state)

    if not preset_id:
        return _resp(False, "LLM_NO_PRESET")
    preset = load_preset(preset_id)
    if preset is None:
        return _resp(False, "LLM_PRESET_NOT_FOUND")

    # Load provider (API config)
    provider_id = preset.get("providerId", "")
    if not provider_id:
        # Migration: old preset with embedded api block
        api_config = preset.get("api", {})
    else:
        provider = load_provider(provider_id)
        if provider is None:
            return _resp(False, "LLM_PROVIDER_NOT_FOUND")
        api_config = provider

    if not api_config.get("baseUrl"):
        return _resp(False, "LLM_BASE_URL_EMPTY")
    if not api_config.get("model"):
        return _resp(False, "LLM_MODEL_EMPTY")

    # Merge preset-level parameters into api_config for the call
    preset_params = preset.get("parameters")
    if preset_params:
        api_config = {**api_config, "parameters": preset_params}

    # Collect variables and assemble messages
    if target_id:
        target_id = _ensure_ns(target_id)
    action_id = data.get("actionId")
    action_def = _h.game_state.action_defs.get(action_id) if action_id else None
    variables = collect_variables(_h.game_state, raw_output, target_id=target_id, action_def=action_def)
    context = {"previousNarratives": data.get("previousNarratives", [])}
    messages = assemble_messages(preset, variables, _h.game_state, context)

    # Scan preset entries for referenced variable names
    import re as _re

    _var_pattern = _re.compile(r"\{\{([\w.]+(?::[\w.=]+)*)\}\}")
    referenced_vars: set[str] = set()
    for entry in preset.get("promptEntries", []):
        if entry.get("enabled", True):
            for m in _var_pattern.finditer(entry.get("content", "")):
                raw = m.group(1)
                name = raw.split(":")[0]  # strip params
                referenced_vars.add(name)
    used_variables = {k: variables.get(k, "") for k in referenced_vars}

    async def event_stream():
        # Send debug info before generation starts
        debug_info = {
            "presetId": preset_id,
            "presetName": preset.get("name", preset_id),
            "model": api_config.get("model", ""),
            "baseUrl": api_config.get("baseUrl", ""),
            "parameters": api_config.get("parameters", {}),
            "messages": messages,
            "variables": used_variables,
        }
        yield _format_sse("llm_debug", debug_info)

        async for event_type, event_data in call_llm_streaming(api_config, messages):
            yield _format_sse(event_type, event_data)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# AI Assist Agent — session management & endpoints
# ---------------------------------------------------------------------------


_ASSIST_LOG_DIR = Path(__file__).resolve().parent.parent.parent / "user" / "logs" / "ai_assist"
_logger = logging.getLogger(__name__)


def _get_log_mode() -> str:
    """Read aiAssistLogMode from config. Returns 'off' or 'always'."""
    try:
        from routes._helpers import load_config

        config = load_config()
        return config.get("aiAssistLogMode", "off")
    except Exception:
        return "off"


class AssistSession:
    """In-memory session for an AI Assist conversation."""

    __slots__ = (
        "messages",
        "pending_tool_call",
        "queued_tool_calls",
        "mode",
        "read_cache",
        "log_path",
        "_logged_count",
        "_log_enabled",
        "target_addon",
        "plan",
        "plan_mode",
    )

    def __init__(self) -> None:
        self.messages: list[dict] = []
        self.pending_tool_call: dict | None = None
        self.queued_tool_calls: list[dict] = []  # write tools waiting after current pending
        self.mode: str = "chat"  # "chat" | "awaiting_plan" | "executing"
        self.read_cache: dict[str, str] = {}  # session-level read tool cache
        self.log_path: Optional[Path] = None
        self._logged_count: int = 0  # how many messages already flushed
        self._log_enabled: bool = _get_log_mode() == "always"
        self.target_addon: str = ""  # user-chosen target addon for entity creation
        self.plan: dict | None = None  # structured plan from submit_plan tool
        self.plan_mode: bool = False  # user-chosen: True = plan first, False = direct create

    def _ensure_log_file(self) -> Optional[Path]:
        """Ensure log file exists and return its path. Returns None if logging disabled."""
        if not self._log_enabled:
            return None
        if self.log_path is None:
            _ASSIST_LOG_DIR.mkdir(parents=True, exist_ok=True)
            ts = datetime.now().strftime("%Y-%m-%d_%H%M%S")
            self.log_path = _ASSIST_LOG_DIR / f"{ts}.jsonl"
        return self.log_path

    def flush_log(self) -> None:
        """Append new messages to the log file (JSON Lines format)."""
        if not self._log_enabled or not self.messages:
            return
        try:
            self._ensure_log_file()
            new_msgs = self.messages[self._logged_count :]
            if not new_msgs:
                return
            with open(self.log_path, "a", encoding="utf-8") as f:
                for msg in new_msgs:
                    f.write(json.dumps(msg, ensure_ascii=False) + "\n")
            self._logged_count = len(self.messages)
        except Exception:
            _logger.exception("Failed to flush assist session log")

    def log_llm_request(self, loop_index: int, messages: list[dict]) -> None:
        """Log the full assembled messages sent to LLM for a given loop iteration."""
        if not self._log_enabled:
            return
        try:
            self._ensure_log_file()
            entry = {
                "_type": "llm_request",
                "_loop": loop_index,
                "_timestamp": datetime.now().isoformat(),
                "_message_count": len(messages),
                "messages": messages,
            }
            with open(self.log_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        except Exception:
            _logger.exception("Failed to log LLM request")

    def log_llm_usage(self, loop_index: int, usage: dict) -> None:
        """Log token usage for a given loop iteration."""
        if not self._log_enabled:
            return
        try:
            self._ensure_log_file()
            entry = {
                "_type": "llm_usage",
                "_loop": loop_index,
                "_timestamp": datetime.now().isoformat(),
                **usage,
            }
            with open(self.log_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        except Exception:
            _logger.exception("Failed to log LLM usage")


# Module-level session store (not persisted). Cleaned up only on explicit delete.
_assist_sessions: dict[str, AssistSession] = {}


def _get_or_create_session(session_id: str) -> AssistSession:
    """Get existing session or create a new one."""
    if session_id not in _assist_sessions:
        _assist_sessions[session_id] = AssistSession()
    return _assist_sessions[session_id]


def _resolve_assist_preset():
    """Load the AI assist preset and its provider. Returns (preset, api_config) or raises."""
    from routes._helpers import load_config

    config = load_config()
    preset_id = config.get("aiAssistPresetId", "")
    if not preset_id:
        return None, None, "AI_ASSIST_NO_PRESET"

    preset = load_preset(preset_id)
    if preset is None:
        return None, None, "AI_ASSIST_PRESET_INVALID"

    provider_id = preset.get("providerId", "")
    if not provider_id:
        return None, None, "AI_ASSIST_PRESET_INVALID"

    provider = load_provider(provider_id)
    if provider is None:
        return None, None, "AI_ASSIST_PRESET_INVALID"

    api_config = {**provider}
    preset_params = preset.get("parameters")
    if preset_params:
        api_config["parameters"] = preset_params

    return preset, api_config, None


def _make_sse_response(generator):
    """Wrap an async generator in a StreamingResponse with SSE headers."""
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _enrich_tool_args(game_state, fn_name: str, fn_args: dict) -> dict:
    """Enrich tool call arguments with display info (e.g. entity name for updates)."""
    if fn_name == "update_entity":
        from game.ai_assist import _get_defs

        entity_id = fn_args.get("entityId", "")
        entity_type = fn_args.get("entityType", "")
        defs = _get_defs(game_state, entity_type)
        existing = defs.get(entity_id)
        if existing and existing.get("name"):
            return {**fn_args, "_displayName": existing["name"]}
    elif fn_name == "batch_update":
        from game.ai_assist import _get_defs

        entity_type = fn_args.get("entityType", "")
        defs = _get_defs(game_state, entity_type)
        updates = fn_args.get("updates", [])
        enriched = []
        for item in updates:
            eid = item.get("entityId", "")
            existing = defs.get(eid)
            if existing and existing.get("name"):
                enriched.append({**item, "_displayName": existing["name"]})
            else:
                enriched.append(item)
        return {**fn_args, "updates": enriched}
    elif fn_name == "create_entity" and fn_args.get("mode") == "clone":
        from game.ai_assist import _compile_clone

        entity_type = fn_args.get("entityType", "")
        payload = fn_args.get("payload", {})
        cloned, _warns, diffs = _compile_clone(game_state, entity_type, payload)
        if not cloned.get("_compile_error"):
            return {**fn_args, "payload": cloned, "_cloneDiffs": diffs}
    return fn_args


def _extract_cached_schema_types(read_cache: dict[str, str]) -> list[str]:
    """Extract entity types for which get_schema results are cached."""
    types: list[str] = []
    for key in read_cache:
        if key.startswith("get_schema:"):
            try:
                args = json.loads(key[len("get_schema:") :])
                etype = args.get("entityType", "")
                if etype:
                    types.append(etype)
            except (json.JSONDecodeError, TypeError):
                pass
    return sorted(set(types))


def _parse_tool_call(tc: dict) -> tuple[str, str, str, dict]:
    """Parse a tool call dict into (call_id, fn_name, fn_args_str, fn_args)."""
    fn_name = tc.get("function", {}).get("name", "")
    fn_args_str = tc.get("function", {}).get("arguments", "{}")
    call_id = tc.get("id", str(uuid.uuid4()))
    try:
        fn_args = json.loads(fn_args_str)
    except json.JSONDecodeError:
        fn_args = {}
    return call_id, fn_name, fn_args_str, fn_args


def _pre_validate_write(game_state, fn_name: str, fn_args: dict) -> tuple[bool, str]:
    """Pre-validate a write tool call before entering pending state.

    Returns (ok, error_result).  When ok is False, error_result is a JSON
    string that should be returned to the LLM as an auto-execute tool result.
    """
    from game.ai_assist_handlers import _validate_field_values

    entity_type = fn_args.get("entityType", "")

    if fn_name in ("create_entity", "update_entity"):
        data = fn_args.get("payload", {}) if fn_name == "create_entity" else fn_args.get("fields", {})
        if data and entity_type:
            err = _validate_field_values(game_state, entity_type, data)
            if err:
                return False, json.dumps({"error": "VALIDATION_FAILED", "detail": err}, ensure_ascii=False)
            # Action/event structural validation (error-level only)
            # Skip for template/ir/clone modes — validation runs after compilation
            mode = fn_args.get("mode", "simple")
            if entity_type in ("action", "event") and fn_name == "create_entity" and mode == "simple":
                verr = _validate_action_event(game_state, entity_type, data)
                if verr:
                    return False, json.dumps(verr, ensure_ascii=False)
    elif fn_name == "batch_create":
        entities = fn_args.get("payload", [])
        for i, ent in enumerate(entities):
            err = _validate_field_values(game_state, entity_type, ent)
            if err:
                eid = ent.get("id", f"#{i}")
                return False, json.dumps(
                    {"error": "VALIDATION_FAILED", "entity": eid, "detail": err},
                    ensure_ascii=False,
                )

    return True, ""


def _validate_action_event(game_state, entity_type: str, data: dict) -> Optional[dict]:
    """Run action/event validator, return error dict if any error-level issues."""
    from game.action.validator import validate_action, validate_event

    validator = validate_action if entity_type == "action" else validate_event
    msgs = validator(data, game_state)
    errors = [m for m in msgs if m.level == "error"]
    if errors:
        detail = "; ".join(f"{e.field}: {e.message}" for e in errors)
        hints = [e.hint for e in errors if e.hint]
        result: dict = {"error": "VALIDATION_FAILED", "detail": detail}
        if hints:
            result["hints"] = hints
        return result
    return None


async def _run_agent_loop(
    session: AssistSession,
    api_config: dict,
    preset: dict,
    game_state,
    max_loops: int = 10,
):
    """Core Agent Loop generator — shared by assist_chat and assist_confirm_tool.

    Yields SSE events.  Pauses (returns) when a write tool needs confirmation
    or when the LLM finishes with pure text.
    """
    from game.ai_assist import (
        ASSIST_TOOLS,
        TOOL_SAFETY,
        build_assist_messages,
        collect_assist_context,
        execute_tool,
    )
    from game.llm_engine import call_llm_streaming

    repair_counts: dict[str, int] = {}

    # Always send the full tools array — stable prefix for LLM API prompt cache.
    # Tool availability is controlled by prompt hints, not by filtering.
    tools = ASSIST_TOOLS

    for loop_i in range(max_loops):
        # Rebuild messages each iteration (history may have grown)
        context_text = collect_assist_context(game_state)
        # Extract cached schema types from read_cache keys
        cached_schemas = _extract_cached_schema_types(session.read_cache)
        messages = build_assist_messages(
            preset,
            context_text,
            session.messages,
            "",
            cached_schemas=cached_schemas,
            plan_mode=session.plan_mode,
        )

        full_text = ""
        tool_calls = None

        session.log_llm_request(loop_i, messages)

        usage_data = None
        async for event_type, event_data in call_llm_streaming(api_config, messages, tools=tools):
            if event_type == "llm_chunk":
                full_text += event_data.get("text", "")
                yield _format_sse("llm_chunk", event_data)
            elif event_type == "tool_calls":
                tool_calls = event_data
            elif event_type == "llm_error":
                yield _format_sse("llm_error", event_data)
                return
            elif event_type == "llm_done":
                if event_data.get("usage"):
                    usage_data = event_data["usage"]
                    session.log_llm_usage(loop_i, usage_data)

        # Build assistant message
        assistant_msg: dict = {"role": "assistant", "content": full_text or None}
        if tool_calls:
            assistant_msg["tool_calls"] = tool_calls
        session.messages.append(assistant_msg)

        # Complete debug entry: request + response + usage in one event
        yield _format_sse(
            "llm_debug",
            {
                "source": "ai_assist",
                "loop": loop_i,
                "model": api_config.get("model", ""),
                "baseUrl": api_config.get("baseUrl", ""),
                "parameters": api_config.get("parameters", {}),
                "messageCount": len(messages),
                "messages": messages,
                "responseText": full_text or "",
                "responseToolCalls": tool_calls,
                "usage": usage_data,
            },
        )

        # No tool calls → done
        if not tool_calls:
            yield _format_sse("llm_done", {"fullText": full_text})
            if session.mode != "chat":
                session.mode = "chat"
                yield _format_sse("mode_change", {"mode": "chat"})
            session.flush_log()
            return

        # Parse and classify tool calls
        parsed = [_parse_tool_call(tc) for tc in tool_calls]

        # Check for submit_plan tool (special handling — not read, not write)
        plan_idx = None
        for i, (_, fn_name, _, _) in enumerate(parsed):
            if fn_name == "submit_plan":
                plan_idx = i
                break

        if plan_idx is not None:
            call_id, _, _, fn_args = parsed[plan_idx]
            # Execute any read tools before the plan
            for i in range(plan_idx):
                rc_id, rc_name, _, rc_args = parsed[i]
                cache_key = f"{rc_name}:{json.dumps(rc_args, sort_keys=True)}"
                if cache_key in session.read_cache:
                    result = session.read_cache[cache_key]
                else:
                    if session.target_addon:
                        rc_args["_targetAddon"] = session.target_addon
                    result = execute_tool(game_state, rc_name, rc_args)
                    session.read_cache[cache_key] = result
                yield _format_sse(
                    "tool_call_result",
                    {"callId": rc_id, "name": rc_name, "arguments": rc_args, "result": result, "auto": True},
                )
                tool_msg = {"role": "tool", "tool_call_id": rc_id, "content": result}
                session.messages.append(tool_msg)

            # Store plan and switch to awaiting_plan
            session.plan = fn_args
            session.pending_tool_call = {"callId": call_id, "name": "submit_plan", "arguments": fn_args}
            session.mode = "awaiting_plan"
            yield _format_sse("llm_done", {"fullText": full_text})
            yield _format_sse("mode_change", {"mode": "awaiting_plan"})
            yield _format_sse("plan_pending", {**fn_args, "callId": call_id})

            # Skip remaining tools after plan
            for i in range(plan_idx + 1, len(parsed)):
                skip_id = parsed[i][0]
                skip_msg = {"role": "tool", "tool_call_id": skip_id, "content": '{"skipped": true}'}
                session.messages.append(skip_msg)
            session.flush_log()
            return

        write_idx = None
        for i, (_, fn_name, _, _) in enumerate(parsed):
            if TOOL_SAFETY.get(fn_name, "write") == "write":
                write_idx = i
                break

        # Execute read-only tools
        read_end = len(parsed) if write_idx is None else write_idx
        for i in range(read_end):
            call_id, fn_name, _, fn_args = parsed[i]
            cache_key = f"{fn_name}:{json.dumps(fn_args, sort_keys=True)}"
            if cache_key in session.read_cache:
                result = session.read_cache[cache_key]
            else:
                if session.target_addon:
                    fn_args["_targetAddon"] = session.target_addon
                result = execute_tool(game_state, fn_name, fn_args)
                session.read_cache[cache_key] = result
            yield _format_sse(
                "tool_call_result",
                {"callId": call_id, "name": fn_name, "arguments": fn_args, "result": result, "auto": True},
            )
            tool_msg = {"role": "tool", "tool_call_id": call_id, "content": result}
            session.messages.append(tool_msg)

        if write_idx is not None:
            call_id, fn_name, _, fn_args = parsed[write_idx]

            # Pre-validate before entering pending
            ok, err_result = _pre_validate_write(game_state, fn_name, fn_args)
            if not ok:
                payload = fn_args.get("payload", {})
                payload_id = payload.get("id", "") if isinstance(payload, dict) else ""
                repair_key = f"{fn_name}:{fn_args.get('entityType', '')}:{payload_id}"
                repair_counts[repair_key] = repair_counts.get(repair_key, 0) + 1
                if repair_counts[repair_key] > 1:
                    # 2nd failure — stop, show error to user
                    yield _format_sse("llm_done", {"fullText": full_text})
                    yield _format_sse(
                        "llm_error",
                        {
                            "error": "VALIDATION_FAILED_TWICE",
                            "detail": err_result,
                        },
                    )
                    if session.mode == "executing":
                        session.mode = "chat"
                        yield _format_sse("mode_change", {"mode": "chat"})
                    session.flush_log()
                    return

                # 1st failure — return error to LLM as auto-execute result
                yield _format_sse(
                    "tool_call_result",
                    {"callId": call_id, "name": fn_name, "arguments": fn_args, "result": err_result, "auto": True},
                )
                tool_msg = {"role": "tool", "tool_call_id": call_id, "content": err_result}
                session.messages.append(tool_msg)
                # Skip remaining tools after the failed write
                for i in range(write_idx + 1, len(parsed)):
                    skip_id = parsed[i][0]
                    skip_msg = {"role": "tool", "tool_call_id": skip_id, "content": '{"skipped": true}'}
                    session.messages.append(skip_msg)
                continue  # Loop back for LLM to fix

            # First write tool → switch to executing mode
            if session.mode == "chat":
                session.mode = "executing"
                yield _format_sse("mode_change", {"mode": "executing"})

            # Validation passed — enter pending
            yield _format_sse("llm_done", {"fullText": full_text})
            enriched_args = _enrich_tool_args(game_state, fn_name, fn_args)
            session.pending_tool_call = {"callId": call_id, "name": fn_name, "arguments": fn_args}
            yield _format_sse(
                "tool_call_pending",
                {"callId": call_id, "name": fn_name, "arguments": enriched_args},
            )

            # Queue remaining write tool_calls (instead of skipping)
            session.queued_tool_calls = []
            for i in range(write_idx + 1, len(parsed)):
                qc_id, qc_name, qc_is_write, qc_args = parsed[i]
                if qc_is_write:
                    session.queued_tool_calls.append({"callId": qc_id, "name": qc_name, "arguments": qc_args})
                else:
                    # Execute read tools immediately
                    if session.target_addon:
                        qc_args["_targetAddon"] = session.target_addon
                    qc_result = execute_tool(game_state, qc_name, qc_args)
                    tool_msg = {"role": "tool", "tool_call_id": qc_id, "content": qc_result}
                    session.messages.append(tool_msg)
            session.flush_log()
            return

        # All tools were read-only — loop back

    # max_loops exhausted
    session.flush_log()
    yield _format_sse(
        "llm_error",
        {
            "error": "AI_ASSIST_SESSION_ERROR",
            "detail": "Too many tool call rounds",
        },
    )


@router.post("/api/llm/assist-chat")
async def assist_chat(request: Request):
    """AI Assist Agent — send a message and get a streamed response.

    This endpoint starts/continues the Agent Loop via _run_agent_loop.
    """
    data = await request.json()
    session_id = data.get("sessionId", "")
    user_message = data.get("message", "")

    if not session_id or not user_message:
        return _resp(False, "AI_ASSIST_SESSION_ERROR")

    preset, api_config, error = _resolve_assist_preset()
    if error:
        return _resp(False, error)

    session = _get_or_create_session(session_id)
    # Update target addon if provided (user can change mid-session)
    target_addon = data.get("targetAddon", "")
    if target_addon:
        session.target_addon = target_addon
    # Update plan mode from request (user can toggle per-message)
    session.plan_mode = bool(data.get("planMode", False))
    session.messages.append({"role": "user", "content": user_message})
    session.flush_log()

    return _make_sse_response(_run_agent_loop(session, api_config, preset, _h.game_state))


@router.post("/api/llm/assist-confirm-tool")
async def assist_confirm_tool(request: Request):
    """Confirm or reject a pending write tool call.

    Standard agent loop: after approval, this endpoint returns an SSE stream
    that auto-continues the agent loop.  The LLM decides whether to make more
    tool calls or output a summary and stop.
    On rejection, returns JSON and switches mode back to chat.
    """
    from game.ai_assist import execute_tool

    data = await request.json()
    session_id = data.get("sessionId", "")
    call_id = data.get("callId", "")
    approved = data.get("approved", False)

    if not session_id or session_id not in _assist_sessions:
        return _resp(False, "AI_ASSIST_SESSION_ERROR")

    session = _assist_sessions[session_id]
    pending = session.pending_tool_call
    if not pending or pending.get("callId") != call_id:
        return _resp(False, "AI_ASSIST_SESSION_ERROR")

    session.pending_tool_call = None

    # --- Plan confirmation (submit_plan) ---
    if pending["name"] == "submit_plan":
        if approved:
            entity_count = len(pending["arguments"].get("entities", []))
            result = json.dumps(
                {"approved": True, "message": f"用户已确认方案（{entity_count} 个实体），请按依赖顺序开始创建。"},
                ensure_ascii=False,
            )
            session.mode = "executing"
        else:
            override = data.get("overrideArgs") or {}
            feedback = override.get("feedback", "") if isinstance(override, dict) else ""
            reason = f"用户要求修改方案。{feedback}" if feedback else "用户拒绝了方案，请根据用户反馈调整。"
            result = json.dumps({"rejected": True, "reason": reason}, ensure_ascii=False)
            session.plan = None
            session.mode = "chat"

        tool_msg = {"role": "tool", "tool_call_id": call_id, "content": result}
        session.messages.append(tool_msg)
        session.flush_log()

        preset, api_config, error = _resolve_assist_preset()
        if error:
            return _resp(False, error)

        if approved:

            async def plan_execute_stream():
                yield _format_sse("mode_change", {"mode": "executing"})
                yield _format_sse(
                    "tool_confirm_result",
                    {"callId": call_id, "result": result, "approved": True},
                )
                async for event in _run_agent_loop(session, api_config, preset, _h.game_state):
                    yield event

            return _make_sse_response(plan_execute_stream())

        # Rejected plan — continue agent loop so LLM can adjust

        async def plan_reject_stream():
            yield _format_sse("mode_change", {"mode": "chat"})
            yield _format_sse(
                "tool_confirm_result",
                {"callId": call_id, "result": result, "approved": False},
            )
            async for event in _run_agent_loop(session, api_config, preset, _h.game_state):
                yield event

        return _make_sse_response(plan_reject_stream())

    # --- Standard write tool confirmation ---
    override_args = data.get("overrideArgs")
    tool_args = override_args if override_args else pending["arguments"]
    _excluded_ids: list[str] = []
    if approved:
        if session.target_addon:
            tool_args["_targetAddon"] = session.target_addon
        # Track if user modified the payload (partial selection in batch_create)
        user_modified = override_args is not None and override_args != pending["arguments"]
        result = execute_tool(_h.game_state, pending["name"], tool_args)
        # Track excluded items for user feedback message
        if user_modified and pending["name"] == "batch_create":
            try:
                orig_payload = pending["arguments"].get("payload", [])
                used_payload = tool_args.get("payload", [])
                orig_ids = {e.get("id", "") for e in orig_payload if isinstance(e, dict)}
                used_ids = {e.get("id", "") for e in used_payload if isinstance(e, dict)}
                _excluded_ids = sorted(orig_ids - used_ids)
            except (TypeError, AttributeError):
                pass
        # Clear read cache — write may have changed game state
        session.read_cache.clear()
        if _h.game_state.dirty:
            await _h.manager.broadcast(
                "dirty_update",
                {"dirty": True, "stagedCount": _h.game_state.staging.staged_count()},
            )
    else:
        result = json.dumps({"rejected": True, "reason": "User rejected this operation"})
        # Rejection breaks execution mode
        if session.mode in ("executing", "awaiting_plan"):
            session.mode = "chat"

    tool_msg = {"role": "tool", "tool_call_id": call_id, "content": result}
    session.messages.append(tool_msg)

    # Append explicit user feedback for partial batch selection
    if approved and _excluded_ids:
        feedback = (
            f"[系统提示] 用户从批量创建中排除了 {len(_excluded_ids)} 个实体: "
            f"{', '.join(_excluded_ids)}。这是用户的主动选择，不要重试或重新创建这些实体。"
        )
        session.messages.append({"role": "user", "content": feedback})

    session.flush_log()

    # After approved confirm, check for queued write tools before continuing agent loop
    if approved:
        # Process next queued write tool if any
        if session.queued_tool_calls:
            next_tc = session.queued_tool_calls.pop(0)
            nc_id, nc_name, nc_args = next_tc["callId"], next_tc["name"], next_tc["arguments"]

            # Pre-validate the queued tool
            ok, err_result = _pre_validate_write(_h.game_state, nc_name, nc_args)
            if not ok:
                # Validation failed — add error result, skip to next or continue loop
                tool_msg = {"role": "tool", "tool_call_id": nc_id, "content": err_result}
                session.messages.append(tool_msg)
                session.flush_log()
                # Fall through to continue_stream below
            else:
                enriched = _enrich_tool_args(_h.game_state, nc_name, nc_args)
                session.pending_tool_call = {"callId": nc_id, "name": nc_name, "arguments": nc_args}

                async def next_pending_stream():
                    yield _format_sse(
                        "tool_confirm_result",
                        {"callId": call_id, "result": result, "approved": True},
                    )
                    yield _format_sse(
                        "tool_call_pending",
                        {"callId": nc_id, "name": nc_name, "arguments": enriched},
                    )

                return _make_sse_response(next_pending_stream())

        preset, api_config, error = _resolve_assist_preset()
        if error:
            return _resp(False, error)

        async def continue_stream():
            yield _format_sse(
                "tool_confirm_result",
                {"callId": call_id, "result": result, "approved": True},
            )
            async for event in _run_agent_loop(session, api_config, preset, _h.game_state):
                yield event

        return _make_sse_response(continue_stream())

    # Rejected — clear queued tools too
    session.queued_tool_calls.clear()
    return _resp(True, "", result=result)


@router.delete("/api/llm/assist-session/{session_id}")
async def delete_assist_session(session_id: str):
    """Delete an AI Assist session (called when drawer closes)."""
    if session_id in _assist_sessions:
        del _assist_sessions[session_id]
    return _resp(True, "")
