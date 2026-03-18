from __future__ import annotations

"""SSE (Server-Sent Events) endpoint."""

import asyncio

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

import routes._helpers as _h
from routes._helpers import _format_sse

router = APIRouter()


@router.get("/api/events")
async def sse_events(request: Request):
    """SSE endpoint for real-time server→client push."""

    async def event_stream():
        queue: asyncio.Queue = asyncio.Queue()
        _h.manager.add(queue)
        try:
            # Send initial state
            state = _h.game_state.get_full_state()
            yield _format_sse("state_update", state)
            # Keep streaming events
            while True:
                if await request.is_disconnected():
                    break
                try:
                    msg = await asyncio.wait_for(queue.get(), timeout=30)
                    yield _format_sse(msg["type"], msg["data"])
                except asyncio.TimeoutError:
                    # Send keepalive comment to prevent connection timeout
                    yield ": keepalive\n\n"
        finally:
            _h.manager.remove(queue)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
