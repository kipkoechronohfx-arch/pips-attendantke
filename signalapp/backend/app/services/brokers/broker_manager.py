# backend/app/services/brokers/broker_manager.py
"""BrokerManager selects an appropriate MetaApi server (demo or live)
for a given broker and caches successful connections.

Usage example::

    manager = BrokerManager()
    client = await manager.get_client('icmarkets', require_demo=False)
    # ``client`` is a MetaApiClient already pointing at a working server.
"""

import os
import itertools
from typing import Dict, List

from .models import BrokerInfo, ServerInfo, BrokerConnectionError
from ..metaapi.client import MetaApiClient

# ----------------------------------------------------------------------
# Catalog of known broker servers. Extend this dict when you add a new broker.
# ----------------------------------------------------------------------
_BROKER_CATALOG: Dict[str, BrokerInfo] = {
    "icmarkets": BrokerInfo(
        broker_name="icmarkets",
        servers=[
            ServerInfo(
                name="icmarkets-demo-eu",
                url="https://demo-icmarkets-1.metaapi.cloud",
                is_demo=True,
            ),
            ServerInfo(
                name="icmarkets-live-us",
                url="https://us-icmarkets-1.metaapi.cloud",
                is_demo=False,
            ),
            ServerInfo(
                name="icmarkets-live-eu",
                url="https://eu-icmarkets-1.metaapi.cloud",
                is_demo=False,
            ),
        ],
    ),
    "oanda": BrokerInfo(
        broker_name="oanda",
        servers=[
            ServerInfo(
                name="oanda-demo-us",
                url="https://demo-oanda-1.metaapi.cloud",
                is_demo=True,
            ),
            ServerInfo(
                name="oanda-live-us",
                url="https://us-oanda-1.metaapi.cloud",
                is_demo=False,
            ),
        ],
    ),
    "default": BrokerInfo(
        broker_name="default",
        servers=[
            ServerInfo(
                name="metaapi-default-demo",
                url="https://demo.metaapi.cloud",
                is_demo=True,
            ),
            ServerInfo(
                name="metaapi-default-live",
                url="https://api.metaapi.cloud",
                is_demo=False,
            ),
        ],
    ),
}


class BrokerConnectionError(RuntimeError):
    """Raised when *all* servers for a broker are unreachable."""


class BrokerManager:
    """Selects a live MetaApi endpoint for a broker.

    The manager keeps an in‑memory cache of the last successful server per
    broker so subsequent calls are cheap.
    """

    def __init__(self, token: str | None = None):
        self.token: str = token or os.getenv("METAAPI_TOKEN")
        if not self.token:
            raise ValueError("METAAPI_TOKEN must be set in the environment")
        self._cache: Dict[str, ServerInfo] = {}

    async def get_client(
        self,
        broker_name: str,
        require_demo: bool = False,
        *,
        prefer_live: bool = False,
    ) -> MetaApiClient:
        """Return a MetaApiClient pointing at a reachable server.

        Parameters
        ----------
        broker_name: str
            Key from ``_BROKER_CATALOG`` (e.g. ``"icmarkets"``).
        require_demo: bool, default ``False``
            If ``True`` only demo (sandbox) servers are considered.
        prefer_live: bool, default ``False``
            When ``require_demo`` is ``False`` try live servers first.
        """
        broker_name = broker_name.lower()
        broker = _BROKER_CATALOG.get(broker_name, _BROKER_CATALOG["default"])

        # 1️⃣ Check cached server first
        cached = self._cache.get(broker_name)
        if cached and (not require_demo or cached.is_demo) and await self._probe(cached):
            return MetaApiClient(self.token, base_url=cached.url)

        # 2️⃣ Build ordered list respecting flags
        demo_servers = [s for s in broker.servers if s.is_demo]
        live_servers = [s for s in broker.servers if not s.is_demo]
        if require_demo:
            ordered = demo_servers
        elif prefer_live:
            ordered = list(itertools.chain(live_servers, demo_servers))
        else:
            ordered = list(itertools.chain(demo_servers, live_servers))

        # 3️⃣ Try each server until one answers
        for server in ordered:
            if await self._probe(server):
                self._cache[broker_name] = server
                return MetaApiClient(self.token, base_url=server.url)

        raise BrokerConnectionError(
            f"All MetaApi servers for broker '{broker_name}' are unreachable."
        )

    # ------------------------------------------------------------------
    async def _probe(self, server: ServerInfo) -> bool:
        """Lightweight health‑check – GET ``/users/current``.

        Returns ``True`` if the request succeeds with HTTP 200.
        """
        try:
            client = MetaApiClient(self.token, base_url=server.url)
            await client.ping()
            return True
        except Exception:
            return False
