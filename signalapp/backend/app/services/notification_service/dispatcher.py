import logging
import httpx
from typing import Optional
from app.core.config import settings
from app.models.signal import TradingSignal

logger = logging.getLogger("notification_dispatcher")

class NotificationDispatcher:
    """Dispatches real-time signal and milestone events to Telegram channels & Discord webhooks"""

    def __init__(self):
        self.telegram_token = settings.TELEGRAM_BOT_TOKEN
        self.telegram_chat_id = settings.TELEGRAM_CHAT_ID
        self.discord_webhook = settings.DISCORD_WEBHOOK_URL

    async def _send_telegram(self, message: str) -> bool:
        if not self.telegram_token or not self.telegram_chat_id:
            return False
        url = f"https://api.telegram.org/bot{self.telegram_token}/sendMessage"
        payload = {
            "chat_id": self.telegram_chat_id,
            "text": message,
            "parse_mode": "HTML",
            "disable_web_page_preview": True
        }
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.post(url, json=payload)
                return res.status_code == 200
        except Exception as e:
            logger.warning(f"Telegram dispatch failed: {e}")
            return False

    async def _send_discord(self, content: str) -> bool:
        if not self.discord_webhook:
            return False
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.post(self.discord_webhook, json={"content": content})
                return res.status_code in [200, 204]
        except Exception as e:
            logger.warning(f"Discord dispatch failed: {e}")
            return False

    async def broadcast_new_signal(self, sig: TradingSignal):
        dir_emoji = "🟢 BUY (LONG)" if sig.direction == "BUY" else "🔴 SELL (SHORT)"
        msg = (
            f"⚡ <b>NEW FOREX SIGNAL PRO ALERT</b> ⚡\n\n"
            f"<b>Pair:</b> {sig.symbol}\n"
            f"<b>Direction:</b> {dir_emoji}\n"
            f"<b>Timeframe:</b> {sig.timeframe}\n"
            f"<b>Entry Price:</b> <code>{sig.entry_price}</code>\n"
            f"<b>Stop Loss:</b> <code>{sig.stop_loss}</code>\n"
            f"<b>Take Profit 1:</b> <code>{sig.take_profit_1}</code>\n"
        )
        if sig.take_profit_2:
            msg += f"<b>Take Profit 2:</b> <code>{sig.take_profit_2}</code>\n"
        if sig.take_profit_3:
            msg += f"<b>Take Profit 3 (Max):</b> <code>{sig.take_profit_3}</code>\n"

        msg += (
            f"\n<b>R:R Ratio:</b> 1 : {sig.risk_reward_ratio}\n"
            f"<b>Confidence:</b> {sig.confidence}%\n"
            f"<b>Thesis:</b> <i>{sig.technical_justification or 'Institutional confluence confirmed.'}</i>\n"
        )

        await self._send_telegram(msg)
        await self._send_discord(msg.replace("<b>", "**").replace("</b>", "**").replace("<code>", "`").replace("</code>", "`").replace("<i>", "*").replace("</i>", "*"))

    async def broadcast_target_milestone(self, sig: TradingSignal, milestone: str, pips: float):
        msg = (
            f"🚀 <b>TARGET MILESTONE REACHED</b> 🎯\n\n"
            f"<b>Pair:</b> {sig.symbol} ({sig.direction})\n"
            f"<b>Milestone:</b> <b>{milestone} HIT!</b>\n"
            f"<b>Profit Secured:</b> <code>+{pips} Pips</code>\n\n"
            f"💡 <i>Recommended Action: Secure partial profits and trail Stop Loss to Entry/Breakeven.</i>"
        )
        await self._send_telegram(msg)
        await self._send_discord(f"🚀 **{sig.symbol} TARGET HIT**: {milestone} reached! **+{pips} Pips** secured.")

    async def broadcast_stop_loss(self, sig: TradingSignal, pips: float):
        msg = (
            f"🛑 <b>STOP LOSS TRIGGERED</b>\n\n"
            f"<b>Pair:</b> {sig.symbol}\n"
            f"<b>Result:</b> <code>{pips} Pips</code>\n"
            f"🔒 <i>Capital preservation rules applied per risk model.</i>"
        )
        await self._send_telegram(msg)
        await self._send_discord(f"🛑 **{sig.symbol} STOPPED OUT**: {pips} pips.")

notification_dispatcher = NotificationDispatcher()
