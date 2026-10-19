"""
MetaApi Cloud REST Client
Handles: Account provisioning, trade execution, position management, equity sync
Docs: https://metaapi.cloud/docs/client/restApi/
"""

import asyncio
import logging
from typing import Optional
import httpx

logger = logging.getLogger("metaapi")

PROVISIONING_API = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai"
TRADING_API      = "https://mt-client-api-v1.agiliumtrade.agiliumtrade.ai"
CLIENT_TIMEOUT   = 20.0


class MetaApiError(Exception):
    """Raised when MetaApi returns an error response"""
    def __init__(self, status: int, detail: str):
        self.status = status
        self.detail = detail
        super().__init__(f"MetaApi HTTP {status}: {detail}")


class MetaApiClient:
    """
    Async REST client for MetaApi.cloud.
    All methods raise MetaApiError on failure.
    """

    def __init__(self, token: str):
        self.token = token
        self._headers = {
            "auth-token": token,
            "Content-Type": "application/json",
        }

    # ─── Account Provisioning ───────────────────────────────────────────────

    async def provision_account(
        self,
        login: str,
        password: str,
        server: str,
        name: str,
        magic: int = 889911,
    ) -> dict:
        """
        Create or retrieve a MetaApi provisioned MT5 account.
        Returns the MetaApi account object with `id` and `state`.
        """
        payload = {
            "login": login,
            "password": password,
            "server": server,
            "platform": "mt5",
            "name": name,
            "magic": magic,
            "riskManagementApiEnabled": False,
            "copyFactoryResourceSlots": 0,
            "quoteStreamingIntervalInSeconds": 2.5,
            "reliability": "high",
        }
        async with httpx.AsyncClient(timeout=CLIENT_TIMEOUT) as c:
            r = await c.post(
                f"{PROVISIONING_API}/users/current/accounts",
                headers=self._headers,
                json=payload,
            )
        if r.status_code in (200, 201):
            return r.json()
        # 409 = already exists — fetch by login+server instead
        if r.status_code == 409:
            return await self._find_account(login, server)
        raise MetaApiError(r.status_code, r.text[:300])

    async def _find_account(self, login: str, server: str) -> dict:
        """Fetch existing provisioned account by login + server"""
        async with httpx.AsyncClient(timeout=CLIENT_TIMEOUT) as c:
            r = await c.get(
                f"{PROVISIONING_API}/users/current/accounts",
                headers=self._headers,
            )
        if r.status_code == 200:
            accounts = r.json()
            for acc in accounts:
                if str(acc.get("login")) == str(login) and acc.get("server") == server:
                    return acc
        raise MetaApiError(r.status_code, f"Account not found: {login}@{server}")

    async def get_account_info(self, metaapi_account_id: str) -> dict:
        """Get account state: equity, balance, margin, etc."""
        region = await self._get_region(metaapi_account_id)
        async with httpx.AsyncClient(timeout=CLIENT_TIMEOUT) as c:
            r = await c.get(
                f"https://mt-client-api-v1.{region}.agiliumtrade.ai/users/current/accounts/{metaapi_account_id}/account-information",
                headers=self._headers,
            )
        if r.status_code == 200:
            return r.json()
        raise MetaApiError(r.status_code, r.text[:300])

    async def deploy_account(self, metaapi_account_id: str) -> None:
        """Deploy (connect) a provisioned account to start live data"""
        async with httpx.AsyncClient(timeout=CLIENT_TIMEOUT) as c:
            r = await c.post(
                f"{PROVISIONING_API}/users/current/accounts/{metaapi_account_id}/deploy",
                headers=self._headers,
            )
        if r.status_code not in (200, 201, 204):
            raise MetaApiError(r.status_code, r.text[:300])

    async def undeploy_account(self, metaapi_account_id: str) -> None:
        """Undeploy (disconnect) an account to save resources"""
        async with httpx.AsyncClient(timeout=CLIENT_TIMEOUT) as c:
            r = await c.post(
                f"{PROVISIONING_API}/users/current/accounts/{metaapi_account_id}/undeploy",
                headers=self._headers,
            )
        if r.status_code not in (200, 201, 204):
            raise MetaApiError(r.status_code, r.text[:300])

    async def delete_account(self, metaapi_account_id: str) -> None:
        """Permanently remove a provisioned account"""
        async with httpx.AsyncClient(timeout=CLIENT_TIMEOUT) as c:
            r = await c.delete(
                f"{PROVISIONING_API}/users/current/accounts/{metaapi_account_id}",
                headers=self._headers,
            )
        if r.status_code not in (200, 204):
            raise MetaApiError(r.status_code, r.text[:300])

    # ─── Trade Execution ─────────────────────────────────────────────────────

    async def place_order(
        self,
        metaapi_account_id: str,
        symbol: str,
        direction: str,          # "BUY" | "SELL"
        volume: float,            # lot size
        entry_price: float,       # limit price (0 = market)
        stop_loss: float,
        take_profit: float,
        magic: int = 889911,
        comment: str = "FSP-Auto",
    ) -> dict:
        """
        Place a pending limit order or market order.
        Returns the MetaApi order result with `orderId`.
        """
        region = await self._get_region(metaapi_account_id)
        action_type = "ORDER_TYPE_BUY_LIMIT" if direction.upper() == "BUY" else "ORDER_TYPE_SELL_LIMIT"

        payload = {
            "symbol": symbol,
            "actionType": action_type,
            "volume": round(volume, 2),
            "openPrice": entry_price,
            "stopLoss": stop_loss,
            "takeProfit": take_profit,
            "magic": magic,
            "comment": comment[:31],  # MT5 max comment length = 31 chars
        }
        async with httpx.AsyncClient(timeout=CLIENT_TIMEOUT) as c:
            r = await c.post(
                f"https://mt-client-api-v1.{region}.agiliumtrade.ai/users/current/accounts/{metaapi_account_id}/trade",
                headers=self._headers,
                json=payload,
            )
        if r.status_code in (200, 201):
            return r.json()
        raise MetaApiError(r.status_code, r.text[:300])

    async def modify_position(
        self,
        metaapi_account_id: str,
        position_id: str,
        stop_loss: Optional[float] = None,
        take_profit: Optional[float] = None,
    ) -> dict:
        """Modify stop loss / take profit of an open position"""
        region = await self._get_region(metaapi_account_id)
        payload: dict = {"actionType": "POSITION_MODIFY", "positionId": position_id}
        if stop_loss is not None:
            payload["stopLoss"] = stop_loss
        if take_profit is not None:
            payload["takeProfit"] = take_profit

        async with httpx.AsyncClient(timeout=CLIENT_TIMEOUT) as c:
            r = await c.post(
                f"https://mt-client-api-v1.{region}.agiliumtrade.ai/users/current/accounts/{metaapi_account_id}/trade",
                headers=self._headers,
                json=payload,
            )
        if r.status_code in (200, 201):
            return r.json()
        raise MetaApiError(r.status_code, r.text[:300])

    async def close_position(
        self,
        metaapi_account_id: str,
        position_id: str,
    ) -> dict:
        """Close an open position at market"""
        region = await self._get_region(metaapi_account_id)
        payload = {"actionType": "POSITION_CLOSE_ID", "positionId": position_id}
        async with httpx.AsyncClient(timeout=CLIENT_TIMEOUT) as c:
            r = await c.post(
                f"https://mt-client-api-v1.{region}.agiliumtrade.ai/users/current/accounts/{metaapi_account_id}/trade",
                headers=self._headers,
                json=payload,
            )
        if r.status_code in (200, 201):
            return r.json()
        raise MetaApiError(r.status_code, r.text[:300])

    async def get_positions(self, metaapi_account_id: str) -> list:
        """Get all open positions for the account"""
        region = await self._get_region(metaapi_account_id)
        async with httpx.AsyncClient(timeout=CLIENT_TIMEOUT) as c:
            r = await c.get(
                f"https://mt-client-api-v1.{region}.agiliumtrade.ai/users/current/accounts/{metaapi_account_id}/positions",
                headers=self._headers,
            )
        if r.status_code == 200:
            return r.json()
        raise MetaApiError(r.status_code, r.text[:300])

    async def get_orders(self, metaapi_account_id: str) -> list:
        """Get all pending orders for the account"""
        region = await self._get_region(metaapi_account_id)
        async with httpx.AsyncClient(timeout=CLIENT_TIMEOUT) as c:
            r = await c.get(
                f"https://mt-client-api-v1.{region}.agiliumtrade.ai/users/current/accounts/{metaapi_account_id}/orders",
                headers=self._headers,
            )
        if r.status_code == 200:
            return r.json()
        raise MetaApiError(r.status_code, r.text[:300])

    # ─── Lot Size Calculator ─────────────────────────────────────────────────

    @staticmethod
    def calculate_lot_size(
        account_balance: float,
        risk_percent: float,
        entry_price: float,
        stop_loss: float,
        symbol: str,
    ) -> float:
        """
        Calculate lot size based on account risk percentage.
        Uses pip-value approximation for major pairs and XAU.
        """
        risk_amount = account_balance * (risk_percent / 100.0)
        sl_distance = abs(entry_price - stop_loss)

        if sl_distance == 0:
            return 0.01

        sym = symbol.upper().replace("/", "").replace("-", "")

        # Pip value per lot approximations
        if "JPY" in sym:
            pip_value_per_lot = 1000.0   # 1 pip = 0.01, $1000/lot for JPY pairs
            pip_size = 0.01
        elif "XAU" in sym or "GOLD" in sym:
            pip_value_per_lot = 100.0    # $1 per 0.01 = $100/lot for gold
            pip_size = 0.01
        elif "XAG" in sym or "SILVER" in sym:
            pip_value_per_lot = 50.0
            pip_size = 0.001
        else:
            pip_value_per_lot = 10.0     # standard forex: $10/pip/lot
            pip_size = 0.0001

        sl_pips = sl_distance / pip_size
        if sl_pips == 0:
            return 0.01

        lot_size = risk_amount / (sl_pips * pip_value_per_lot)

        # Clamp to sane range: 0.01 – 100 lots
        lot_size = max(0.01, min(100.0, round(lot_size, 2)))
        return lot_size

    # ─── Region Helper ───────────────────────────────────────────────────────

    async def _get_region(self, metaapi_account_id: str) -> str:
        """
        Get the deployment region for a provisioned account.
        Falls back to 'new-york' if not found.
        """
        async with httpx.AsyncClient(timeout=CLIENT_TIMEOUT) as c:
            r = await c.get(
                f"{PROVISIONING_API}/users/current/accounts/{metaapi_account_id}",
                headers=self._headers,
            )
        if r.status_code == 200:
            data = r.json()
            region = data.get("region", "new-york")
            return region
        return "new-york"
