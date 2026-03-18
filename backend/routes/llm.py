from __future__ import annotations

"""LLM preset, provider, and generation API routes."""

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
