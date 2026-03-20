from __future__ import annotations

"""LLM preset, provider, and generation API routes."""

import json
import uuid

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

class AssistSession:
    """In-memory session for an AI Assist conversation."""

    __slots__ = ("messages", "pending_tool_call")

    def __init__(self) -> None:
        self.messages: list[dict] = []
        self.pending_tool_call: dict | None = None


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
    return fn_args


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


@router.post("/api/llm/assist-chat")
async def assist_chat(request: Request):
    """AI Assist Agent — send a message and get a streamed response.

    This endpoint implements the Agent Loop:
    1. Assemble messages (system prompt + history + user message + tools)
    2. Call LLM API with streaming
    3. If AI returns tool_calls:
       a. Read-only tools → auto-execute → append result → call LLM again (loop)
       b. Write tools → send tool_call_pending event → pause and return
    4. If AI returns pure text → stream it → done

    The loop (step 3a) runs within this single request — multiple LLM round-
    trips can happen transparently.  Write operations break the loop and wait
    for the confirm-tool endpoint.
    """
    from game.ai_assist import (
        ASSIST_TOOLS,
        TOOL_SAFETY,
        build_assist_messages,
        collect_assist_context,
        execute_tool,
    )
    from game.llm_engine import call_llm_streaming

    data = await request.json()
    session_id = data.get("sessionId", "")
    user_message = data.get("message", "")

    if not session_id or not user_message:
        return _resp(False, "AI_ASSIST_SESSION_ERROR")

    # Resolve preset & provider
    preset, api_config, error = _resolve_assist_preset()
    if error:
        return _resp(False, error)

    session = _get_or_create_session(session_id)

    # Collect context and build messages (no entity type — AI decides from conversation)
    context_text = collect_assist_context(_h.game_state)
    messages = build_assist_messages(preset, context_text, session.messages, user_message)

    # Append user message to session history
    session.messages.append({"role": "user", "content": user_message})

    async def agent_stream():
        """The Agent Loop — streams events to the frontend."""
        nonlocal messages

        max_loops = 10  # Safety limit to prevent infinite tool-call loops

        for _ in range(max_loops):
            full_text = ""
            tool_calls = None

            async for event_type, event_data in call_llm_streaming(api_config, messages, tools=ASSIST_TOOLS):
                if event_type == "llm_chunk":
                    full_text += event_data.get("text", "")
                    yield _format_sse("llm_chunk", event_data)
                elif event_type == "tool_calls":
                    tool_calls = event_data  # list of tool call dicts
                elif event_type == "llm_error":
                    yield _format_sse("llm_error", event_data)
                    return
                elif event_type == "llm_done":
                    pass  # We handle done after the loop check

            # Build the assistant message for history
            assistant_msg: dict = {"role": "assistant", "content": full_text}
            if tool_calls:
                assistant_msg["tool_calls"] = tool_calls
            session.messages.append(assistant_msg)
            messages.append(assistant_msg)

            # No tool calls → we're done
            if not tool_calls:
                yield _format_sse("llm_done", {"fullText": full_text})
                return

            # Process tool calls: execute all read-only first, then handle first write
            parsed = [_parse_tool_call(tc) for tc in tool_calls]
            write_idx = None
            for i, (_, fn_name, _, _) in enumerate(parsed):
                if TOOL_SAFETY.get(fn_name, "write") == "write":
                    write_idx = i
                    break

            # Execute all read-only tools (all if no write, or up to write_idx)
            read_end = len(parsed) if write_idx is None else write_idx
            for i in range(read_end):
                call_id, fn_name, _, fn_args = parsed[i]
                result = execute_tool(_h.game_state, fn_name, fn_args)
                yield _format_sse(
                    "tool_call_result",
                    {"callId": call_id, "name": fn_name, "arguments": fn_args, "result": result, "auto": True},
                )
                tool_msg = {"role": "tool", "tool_call_id": call_id, "content": result}
                session.messages.append(tool_msg)
                messages.append(tool_msg)

            if write_idx is not None:
                # Send llm_done first so frontend can finalize the assistant message
                yield _format_sse("llm_done", {"fullText": full_text})

                # Handle the write tool — pause for user confirmation
                call_id, fn_name, _, fn_args = parsed[write_idx]
                # Enrich update_entity args with current entity name for frontend display
                enriched_args = _enrich_tool_args(_h.game_state, fn_name, fn_args)
                session.pending_tool_call = {"callId": call_id, "name": fn_name, "arguments": fn_args}
                yield _format_sse(
                    "tool_call_pending",
                    {"callId": call_id, "name": fn_name, "arguments": enriched_args},
                )

                # For any remaining tool_calls after the write one, add skip results
                # so the message history stays valid (every tool_use needs a tool_result)
                for i in range(write_idx + 1, len(parsed)):
                    skip_id = parsed[i][0]
                    skip_msg = {"role": "tool", "tool_call_id": skip_id, "content": '{"skipped": true}'}
                    session.messages.append(skip_msg)
                    messages.append(skip_msg)
                return

            # All tools were read-only — loop back to call LLM again with results

        # max_loops exhausted
        yield _format_sse(
            "llm_error",
            {
                "error": "AI_ASSIST_SESSION_ERROR",
                "detail": "Too many tool call rounds",
            },
        )

    return _make_sse_response(agent_stream())


@router.post("/api/llm/assist-confirm-tool")
async def assist_confirm_tool(request: Request):
    """Confirm or reject a pending write tool call.

    After the user confirms/rejects, this endpoint:
    1. Executes the tool (if confirmed) or records rejection
    2. Appends the result to session history
    3. Returns the result — does NOT auto-continue the Agent Loop

    The user decides the next step by sending a new chat message.
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

    # Execute or reject (frontend may override arguments if user edited JSON)
    override_args = data.get("overrideArgs")
    tool_args = override_args if override_args else pending["arguments"]
    if approved:
        result = execute_tool(_h.game_state, pending["name"], tool_args)
        # Broadcast dirty state to frontend
        if _h.game_state.dirty:
            await _h.manager.broadcast("dirty_update", {"dirty": True})
    else:
        result = json.dumps({"rejected": True, "reason": "User rejected this operation"})

    # Append tool result to session history (AI will see it in the next chat message)
    tool_msg = {"role": "tool", "tool_call_id": call_id, "content": result}
    session.messages.append(tool_msg)

    return _resp(True, "", result=result)


@router.delete("/api/llm/assist-session/{session_id}")
async def delete_assist_session(session_id: str):
    """Delete an AI Assist session (called when drawer closes)."""
    if session_id in _assist_sessions:
        del _assist_sessions[session_id]
    return _resp(True, "")
