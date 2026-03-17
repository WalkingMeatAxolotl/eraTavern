from __future__ import annotations

"""LLM engine — variable collection, prompt assembly, and API call."""

import json
import re
from typing import Any, Optional

import httpx

from game.llm_preset import load_preset


# ---------------------------------------------------------------------------
# Variable collection
# ---------------------------------------------------------------------------

def _get_player_char(game_state: Any) -> Optional[dict]:
    """Get the player's runtime character dict."""
    pid = game_state.player_character
    return game_state.characters.get(pid) if pid else None


def _format_resources(char: dict) -> str:
    parts = []
    for key, r in char.get("resources", {}).items():
        parts.append(f"{r['label']}: {r['value']}/{r['max']}")
    return ", ".join(parts) if parts else ""


def _format_traits(char: dict) -> str:
    parts = []
    for t in char.get("traits", []):
        if t.get("values"):
            parts.append(f"{t['label']}: {', '.join(t['values'])}")
    return "; ".join(parts) if parts else ""


def _format_abilities(char: dict) -> str:
    parts = []
    for a in char.get("abilities", []):
        parts.append(f"{a['label']}:{a['grade']}({a['exp']})")
    return ", ".join(parts) if parts else ""


def _format_inventory(char: dict) -> str:
    items = char.get("inventory", [])
    if not items:
        return ""
    parts = []
    for it in items:
        s = it["name"]
        if it.get("amount", 1) > 1:
            s += f" x{it['amount']}"
        parts.append(s)
    return ", ".join(parts)


def _format_favorability(char: dict) -> str:
    favs = char.get("favorability", [])
    if not favs:
        return ""
    return ", ".join(f"{f['name']}: {f['value']}" for f in favs)


def _format_char_info(char: dict) -> str:
    """Build a human-readable summary of a character."""
    sections = []
    res = _format_resources(char)
    if res:
        sections.append(f"资源: {res}")
    traits = _format_traits(char)
    if traits:
        sections.append(f"特征: {traits}")
    abilities = _format_abilities(char)
    if abilities:
        sections.append(f"能力: {abilities}")
    inv = _format_inventory(char)
    if inv:
        sections.append(f"物品: {inv}")
    fav = _format_favorability(char)
    if fav:
        sections.append(f"好感度: {fav}")
    return "\n".join(sections)


def _format_clothing(char: dict) -> str:
    """Build a summary of worn clothing."""
    slots = char.get("clothing", [])
    worn = [s for s in slots if s.get("itemName") and s.get("state") in ("worn", "halfWorn")]
    if not worn:
        return "无"
    parts = []
    for s in worn:
        state_str = ""
        if s["state"] == "halfWorn":
            state_str = "(半脱)"
        occ = "(遮挡)" if s.get("occluded") else ""
        parts.append(f"{s['slotLabel']}: {s['itemName']}{state_str}{occ}")
    return "\n".join(parts)


def _get_cell_name(game_state: Any, map_id: str, cell_id: int) -> str:
    """Get the display name of a map cell."""
    m = game_state.maps.get(map_id, {})
    for cell in m.get("cells", []):
        if cell.get("id") == cell_id:
            return cell.get("name", str(cell_id))
    return str(cell_id)


def _get_map_name(game_state: Any, map_id: str) -> str:
    return game_state.maps.get(map_id, {}).get("name", map_id)


def collect_variables(
    game_state: Any,
    raw_output: str,
    target_id: Optional[str] = None,
) -> dict[str, str]:
    """Collect all template variables for prompt interpolation."""
    variables: dict[str, str] = {"rawOutput": raw_output}

    player = _get_player_char(game_state)
    if player:
        pos = player.get("position", {})
        variables["playerName"] = player.get("basicInfo", {}).get("name", {}).get("value", "")
        variables["playerInfo"] = _format_char_info(player)
        variables["clothingState"] = _format_clothing(player)
        variables["location"] = _get_cell_name(game_state, pos.get("mapId", ""), pos.get("cellId", -1))
        variables["mapName"] = _get_map_name(game_state, pos.get("mapId", ""))
    else:
        variables["playerName"] = ""
        variables["playerInfo"] = ""
        variables["clothingState"] = ""
        variables["location"] = ""
        variables["mapName"] = ""

    # Time & weather
    td = game_state.time.to_dict()
    variables["time"] = td.get("displayText", "")
    weather = td.get("weatherName", "")
    icon = td.get("weatherIcon", "")
    variables["weather"] = f"{icon} {weather}" if icon else weather

    # Target character (if any)
    if target_id and target_id in game_state.characters:
        target = game_state.characters[target_id]
        variables["targetName"] = target.get("basicInfo", {}).get("name", {}).get("value", "")
        variables["targetInfo"] = _format_char_info(target)
    else:
        variables["targetName"] = ""
        variables["targetInfo"] = ""

    return variables


# ---------------------------------------------------------------------------
# Prompt assembly
# ---------------------------------------------------------------------------

def _interpolate(content: str, variables: dict[str, str]) -> str:
    """Replace {{varName}} placeholders with actual values."""
    def replacer(m: re.Match) -> str:
        key = m.group(1)
        return variables.get(key, m.group(0))  # keep original if unknown
    return re.sub(r"\{\{(\w+)\}\}", replacer, content)


def assemble_messages(
    preset: dict,
    variables: dict[str, str],
) -> list[dict[str, str]]:
    """Build the chat messages list from preset prompt entries + variables."""
    entries = preset.get("promptEntries", [])
    # Filter enabled, sort by position
    enabled = [e for e in entries if e.get("enabled", True)]
    enabled.sort(key=lambda e: e.get("position", 0))

    messages: list[dict[str, str]] = []
    for entry in enabled:
        role = entry.get("role", "user")
        content = _interpolate(entry.get("content", ""), variables)
        if not content and role == "assistant":
            # Skip empty assistant prefill
            continue
        messages.append({"role": role, "content": content})

    # Post-processing
    post = preset.get("api", {}).get("postProcessing", "mergeConsecutiveSameRole")
    if post == "mergeConsecutiveSameRole":
        messages = _merge_consecutive(messages)

    return messages


def _merge_consecutive(messages: list[dict[str, str]]) -> list[dict[str, str]]:
    """Merge adjacent messages with the same role."""
    if not messages:
        return messages
    merged: list[dict[str, str]] = [messages[0].copy()]
    for msg in messages[1:]:
        if msg["role"] == merged[-1]["role"]:
            merged[-1]["content"] += "\n\n" + msg["content"]
        else:
            merged.append(msg.copy())
    return merged


# ---------------------------------------------------------------------------
# Preset resolution
# ---------------------------------------------------------------------------

def resolve_preset_id(
    game_state: Any,
    action_def: Optional[dict] = None,
) -> Optional[str]:
    """Resolve which preset to use: action → world → global. Returns None if none set."""
    # 1. Action-level
    if action_def and action_def.get("llmPreset"):
        return action_def["llmPreset"]
    # 2. World-level (stored in world.json, loaded into game_state)
    world_preset = getattr(game_state, "llm_preset", None)
    if world_preset:
        return world_preset
    # 3. Global (from config.json)
    try:
        from pathlib import Path
        cfg_path = Path(__file__).resolve().parent.parent.parent / "config.json"
        with open(cfg_path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
        gp = cfg.get("defaultLlmPreset", "")
        if gp:
            return gp
    except (OSError, json.JSONDecodeError):
        pass
    return None


# ---------------------------------------------------------------------------
# Raw output assembly
# ---------------------------------------------------------------------------

def build_raw_output(action_result: dict) -> str:
    """Build the {{rawOutput}} string from an action execution result."""
    parts: list[str] = []

    # Main action message
    msg = action_result.get("message", "")
    if msg:
        parts.append(msg)

    # Effects summary
    effects = action_result.get("effectsSummary", [])
    if effects:
        parts.append("\n".join(effects))

    # Visible NPC log
    npc_log = action_result.get("npcLog", [])
    if npc_log:
        parts.append("\n".join(npc_log))

    return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# LLM API call
# ---------------------------------------------------------------------------

async def call_llm_streaming(
    api_config: dict,
    messages: list[dict[str, str]],
):
    """Call LLM API with streaming. Yields (event_type, data_dict) tuples.

    Events:
      ("llm_chunk", {"text": "..."})
      ("llm_done",  {"fullText": "..."})
      ("llm_error", {"error": "...", "detail": "..."})
    """
    base_url = api_config.get("baseUrl", "").rstrip("/")
    api_key = api_config.get("apiKey", "")
    model = api_config.get("model", "")
    params = api_config.get("parameters", {})
    streaming = api_config.get("streaming", True)

    url = base_url + "/chat/completions"
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    payload = {
        "model": model,
        "messages": messages,
        "stream": streaming,
    }
    # Add generation parameters
    if params.get("temperature") is not None:
        payload["temperature"] = params["temperature"]
    if params.get("maxTokens"):
        payload["max_tokens"] = params["maxTokens"]
    if params.get("topP") is not None:
        payload["top_p"] = params["topP"]
    if params.get("frequencyPenalty"):
        payload["frequency_penalty"] = params["frequencyPenalty"]
    if params.get("presencePenalty"):
        payload["presence_penalty"] = params["presencePenalty"]

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            if streaming:
                full_text = ""
                async with client.stream("POST", url, json=payload, headers=headers) as resp:
                    if resp.status_code != 200:
                        body = await resp.aread()
                        yield ("llm_error", {
                            "error": "LLM_API_ERROR",
                            "detail": f"HTTP {resp.status_code}: {body.decode('utf-8', errors='replace')[:500]}",
                        })
                        return
                    async for line in resp.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        data_str = line[6:]
                        if data_str.strip() == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue
                        delta = (
                            chunk.get("choices", [{}])[0]
                            .get("delta", {})
                            .get("content", "")
                        )
                        if delta:
                            full_text += delta
                            yield ("llm_chunk", {"text": delta})
                yield ("llm_done", {"fullText": full_text})
            else:
                # Non-streaming
                resp = await client.post(url, json=payload, headers=headers)
                if resp.status_code != 200:
                    yield ("llm_error", {
                        "error": "LLM_API_ERROR",
                        "detail": f"HTTP {resp.status_code}: {resp.text[:500]}",
                    })
                    return
                body = resp.json()
                text = (
                    body.get("choices", [{}])[0]
                    .get("message", {})
                    .get("content", "")
                )
                yield ("llm_done", {"fullText": text})
    except httpx.ConnectError:
        yield ("llm_error", {"error": "LLM_CONNECTION_FAILED", "detail": ""})
    except httpx.TimeoutException:
        yield ("llm_error", {"error": "LLM_CONNECTION_TIMEOUT", "detail": ""})
    except Exception as e:
        yield ("llm_error", {"error": "LLM_CONNECTION_FAILED", "detail": str(e)})
