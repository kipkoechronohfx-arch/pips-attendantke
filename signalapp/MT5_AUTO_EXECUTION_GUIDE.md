# MetaTrader 5 (MT5) Auto-Execution Guide

**Forex Signal Pro** supports automated trade execution directly into your **MetaTrader 5** account with dynamic risk position sizing and automated breakeven trailing.

You have two simple ways to run auto-execution:
1. **Method A (Easiest)**: Using the **MQL5 Expert Advisor** directly inside MT5.
2. **Method B (For Python users)**: Using the **Python MT5 Copier Bridge** on Windows.

---

## Method A: MetaTrader 5 Expert Advisor (`.mq5`)

### 1. Copy the EA into MT5
1. Open your **MetaTrader 5** terminal.
2. Click **File > Open Data Folder**.
3. Navigate to `MQL5` > `Experts`.
4. Copy the file [mt5/ForexSignalPro_Copier.mq5](file:///c:/Users/Administrator/Desktop/signal%20app/mt5/ForexSignalPro_Copier.mq5) into this `Experts` folder.

### 2. Allow WebRequest in MT5
Because the EA pulls signals from your cloud backend, you must permit MT5 to communicate with your backend URL:
1. In MT5, go to the top menu: **Tools > Options** (or press `Ctrl + O`).
2. Click the **Expert Advisors** tab.
3. Check the box: **Allow WebRequest for listed URL**.
4. Click the green `+` (Add new URL) and enter your backend URL:
   ```
   https://www.pipsattendant.com
   ```
5. Click **OK**.

### 3. Compile & Attach to Chart
1. In MT5, press `F4` to open the **MetaEditor**.
2. In the Navigator on the left, double-click `ForexSignalPro_Copier.mq5` under `Experts`.
3. Click the **Compile** button at the top (or press `F7`). You will see `0 errors, 0 warnings`.
4. Close MetaEditor.
5. In MT5, open any chart (e.g. `EURUSD`).
6. From the Navigator (`Ctrl + N`), drag **ForexSignalPro_Copier** onto the chart.
7. In the EA Settings window:
   - Make sure **Allow Algo Trading** is checked.
   - Under **Inputs**, configure:
     - `InpLotMode`: `LOT_MODE_DYNAMIC_RISK` (sizes lots based on equity) or `LOT_MODE_FIXED`.
     - `InpRiskPercent`: Default `1.0` (risks 1% of account per trade).
     - `InpTrailBreakevenOnTP1`: `true` (automatically trails Stop Loss to entry once TP1 is hit).
8. Click **OK**, and make sure the global **Algo Trading** button on MT5's top toolbar is **green (enabled)**.

The EA is now live and will automatically execute incoming signals!

---

## Method B: Windows Python MT5 Bridge

If you prefer running a background Python service on your Windows machine:

1. Install the MetaTrader5 Python package:
   ```powershell
   pip install MetaTrader5 requests
   ```
2. Start the copier bridge:
   ```powershell
   python mt5/mt5_copier_bridge.py
   ```
3. The script will automatically connect to your open MT5 terminal, print your account balance and equity, and listen for new signals every 2 seconds.

---

## Key Features Built In

| Feature | Description |
|---|---|
| **Broker Suffix Matching** | Automatically matches broker-specific symbols (e.g. `EURUSD`, `EURUSDm`, `EURUSD.pro`, `EURUSD.r`, `XAUUSD`). |
| **Institutional Position Sizing** | Computes lot size based on account equity and exact stop loss distance: $\text{Lots} = \frac{\text{Equity} \times \text{Risk\%}}{\text{SL Distance} \times \text{Tick Value}}$. |
| **Automated Breakeven Trailing** | When the server detects TP1 is reached, the copier automatically modifies the trade ticket in MT5 to move Stop Loss to Entry price. |
| **Duplicate Protection** | Uses Magic Number `889911` and tagged order comments (`FSP#<signal_id>`) to prevent re-opening existing setups. |
