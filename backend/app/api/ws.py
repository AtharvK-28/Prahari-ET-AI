"""PRAHARI — WebSocket fan-out to the Decision Console."""
from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import WebSocket

log = logging.getLogger("prahari.ws")


class ConnectionManager:
    def __init__(self) -> None:
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket) -> None:
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, payload: dict[str, Any]) -> None:
        msg = json.dumps(payload, default=str)
        for ws in list(self.active):
            try:
                await ws.send_text(msg)
            except Exception:
                self.disconnect(ws)


MANAGER = ConnectionManager()
