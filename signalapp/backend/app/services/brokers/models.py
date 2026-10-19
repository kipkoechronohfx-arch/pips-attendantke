# backend/app/services/brokers/models.py
"""Typed data structures representing MetaApi servers for each broker.

These dataclasses are deliberately simple – they are just containers for a
human‑readable name, the base URL and a flag indicating whether the server
is a demo (sandbox) endpoint.
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import List


@dataclass(frozen=True)
class ServerInfo:
    """Represent a single MetaApi server endpoint."""

    name: str          # e.g. "icmarkets-demo-eu"
    url: str           # Base URL (no trailing slash)
    is_demo: bool      # True → sandbox, False → live


@dataclass(frozen=True)
class BrokerInfo:
    """All servers that are available for a particular broker."""

    broker_name: str
    servers: List[ServerInfo]
