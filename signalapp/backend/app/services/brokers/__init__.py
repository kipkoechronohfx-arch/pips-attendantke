# backend/app/services/brokers/__init__.py
"""Broker services package.

Exports the :class:`BrokerManager` which selects an appropriate MetaApi
server (demo or live) for a given broker and caches successful connections.
"""

from .broker_manager import BrokerManager, BrokerConnectionError

__all__ = ["BrokerManager", "BrokerConnectionError"]
