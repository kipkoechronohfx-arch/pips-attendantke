"""
Forex Signal Pro — Local Python MT5 Trade Copier Bridge
Runs on Windows alongside your MetaTrader 5 Terminal.
Auto-executes trades directly into your MT5 account with dynamic position sizing.
"""

import sys
import time
import requests

try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False

# Configuration
SERVER_URL = "https://forex-signal-pro-backend-production.up.railway.app"
API_KEY = "fsp-secret-copier-key-998811"
POLL_INTERVAL_SECONDS = 2
RISK_PERCENT = 1.0  # Risk 1.0% of equity per trade
MAGIC_NUMBER = 889911
SLIPPAGE_POINTS = 30

executed_signal_ids = set()

def initialize_mt5():
    if not MT5_AVAILABLE:
        print("❌ 'MetaTrader5' Python package not installed.")
        print("   To install, run in your Windows terminal: pip install MetaTrader5")
        return False

    if not mt5.initialize():
        print(f"❌ Failed to initialize MT5 terminal, error code: {mt5.last_error()}")
        return False

    account_info = mt5.account_info()
    if account_info:
        print("======================================================")
        print("🚀 Forex Signal Pro MT5 Python Copier Active")
        print(f"   Account Login: {account_info.login}")
        print(f"   Broker Server: {account_info.server}")
        print(f"   Account Balance: ${account_info.balance:,.2f}")
        print(f"   Account Equity:  ${account_info.equity:,.2f}")
        print(f"   Leverage: 1:{account_info.leverage}")
        print(f"   Connected Cloud: {SERVER_URL}")
        print("======================================================")
        return True
    return False

def resolve_broker_symbol(raw_sym: str) -> str:
    clean = raw_sym.replace("/", "").replace("-", "").strip()
    if mt5.symbol_info(clean):
        return clean
    for suffix in ["m", ".pro", ".r", ".c", ".ecn", "_i", "micro"]:
        candidate = clean + suffix
        if mt5.symbol_info(candidate):
            return candidate
    return clean

def calculate_lots(symbol: str, sl_price: float, is_buy: bool) -> float:
    account = mt5.account_info()
    if not account:
        return 0.01

    equity = account.equity
    risk_dollars = equity * (RISK_PERCENT / 100.0)

    sym_info = mt5.symbol_info(symbol)
    if not sym_info:
        return 0.01

    entry_price = sym_info.ask if is_buy else sym_info.bid
    sl_dist = abs(entry_price - sl_price)

    if sl_dist <= 0 or sym_info.trade_tick_size == 0 or sym_info.trade_tick_value == 0:
        return 0.01

    loss_per_lot = (sl_dist / sym_info.trade_tick_size) * sym_info.trade_tick_value
    if loss_per_lot <= 0:
        return 0.01

    raw_lots = risk_dollars / loss_per_lot
    step = sym_info.volume_step or 0.01
    lots = round(raw_lots / step) * step
    lots = max(sym_info.volume_min, min(sym_info.volume_max, lots))
    return round(lots, 2)

def execute_signal(sig: dict):
    sig_id = sig["id"]
    if sig_id in executed_signal_ids:
        return

    raw_sym = sig["symbol"]
    broker_sym = resolve_broker_symbol(raw_sym)
    mt5.symbol_select(broker_sym, True)

    sym_info = mt5.symbol_info(broker_sym)
    if not sym_info:
        print(f"⚠️ Symbol {broker_sym} not found on broker.")
        return

    is_buy = sig["direction"] == "BUY"
    order_type = mt5.ORDER_TYPE_BUY if is_buy else mt5.ORDER_TYPE_SELL
    price = sym_info.ask if is_buy else sym_info.bid
    sl = sig["stop_loss"]
    tp = sig.get("take_profit_2") or sig["take_profit_1"]
    digits = sym_info.digits

    lots = calculate_lots(broker_sym, sl, is_buy)
    comment = f"FSP#{sig_id}"

    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": broker_sym,
        "volume": lots,
        "type": order_type,
        "price": price,
        "sl": round(sl, digits),
        "tp": round(tp, digits),
        "deviation": SLIPPAGE_POINTS,
        "magic": MAGIC_NUMBER,
        "comment": comment,
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": mt5.ORDER_FILLING_IOC,
    }

    result = mt5.order_send(request)
    if result and result.retcode == mt5.TRADE_RETCODE_DONE:
        executed_signal_ids.add(sig_id)
        print(f"✅ AUTO-EXECUTED: Signal #{sig_id} | {broker_sym} {sig['direction']} {lots} Lots @ Ticket #{result.order}")

        # Send confirmation report to backend
        try:
            requests.post(
                f"{SERVER_URL}/api/v1/copier/report",
                headers={"X-Copier-Key": API_KEY},
                json={
                    "signal_id": sig_id,
                    "mt5_ticket": result.order,
                    "symbol": broker_sym,
                    "action": sig["direction"],
                    "lot_size": lots,
                    "fill_price": result.price,
                    "status": "EXECUTED"
                },
                timeout=4.0
            )
        except Exception:
            pass
    else:
        err_desc = result.comment if result else mt5.last_error()
        print(f"❌ Execution failed for Signal #{sig_id}: {err_desc}")

def check_trailing_breakeven():
    try:
        res = requests.get(
            f"{SERVER_URL}/api/v1/copier/management-actions",
            headers={"X-Copier-Key": API_KEY},
            timeout=4.0
        )
        if res.status_code != 200:
            return
        actions = res.json()
        for act in actions:
            if act.get("action") == "TRAIL_BREAKEVEN":
                tag = f"FSP#{act['signal_id']}"
                entry = act["entry_price"]
                positions = mt5.positions_get(magic=MAGIC_NUMBER)
                if not positions:
                    continue
                for pos in positions:
                    if tag in pos.comment:
                        digits = mt5.symbol_info(pos.symbol).digits
                        be_price = round(entry, digits)
                        if (pos.type == mt5.POSITION_TYPE_BUY and pos.sl < be_price) or \
                           (pos.type == mt5.POSITION_TYPE_SELL and (pos.sl > be_price or pos.sl == 0)):
                            modify_req = {
                                "action": mt5.TRADE_ACTION_SLTP,
                                "position": pos.ticket,
                                "sl": be_price,
                                "tp": pos.tp
                            }
                            mod_res = mt5.order_send(modify_req)
                            if mod_res and mod_res.retcode == mt5.TRADE_RETCODE_DONE:
                                print(f"🛡️ BREAKEVEN ACTIVATED: Ticket #{pos.ticket} SL moved to entry {be_price}")
    except Exception:
        pass

def main():
    if not initialize_mt5():
        sys.exit(1)

    print(f"Listening for signals from {SERVER_URL} every {POLL_INTERVAL_SECONDS}s...")
    while True:
        try:
            res = requests.get(
                f"{SERVER_URL}/api/v1/copier/pending-signals",
                headers={"X-Copier-Key": API_KEY},
                timeout=4.0
            )
            if res.status_code == 200:
                signals = res.json()
                for sig in signals:
                    execute_signal(sig)
            check_trailing_breakeven()
        except Exception as e:
            pass

        time.sleep(POLL_INTERVAL_SECONDS)

if __name__ == "__main__":
    main()
