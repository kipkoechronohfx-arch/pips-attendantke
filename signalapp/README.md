# Forex Signal Pro — V2.0 Production Platform

> Institutional-grade Forex Signals, Real-time Market Intelligence, Quantitative Technical Confluence Engine, and Android & Web Trading Terminal.

---

## 1. System Architecture

```
┌────────────────────────────────────────────────────────┐
│               Forex Signal Pro Clients                 │
│   Web Application (React 18 + TS)  /  Android (PWA)    │
└──────────────────────────┬─────────────────────────────┘
                           │ HTTP / JSON & WebSockets
                           ▼
┌────────────────────────────────────────────────────────┐
│             FastAPI Gateway (/api/v1)                  │
├─────────────────┬───────────────────┬──────────────────┤
│ Auth & RBAC     │ Signals Engine    │ Market Data      │
│ - JWT Tokens    │ - EMA 20/50/200   │ - Twelve Data    │
│ - SuperAdmin    │ - RSI & MACD      │ - OANDA          │
│ - Admin Studio  │ - Dynamic ATR     │ - Finnhub        │
│ - Nairobi (EAT) │ - S/R Confluence  │ - Dev Mock Feed  │
├─────────────────┼───────────────────┼──────────────────┤
│ News & Calendar │ Risk Calculator   │ Live WebSockets  │
│ - Currency Tags │ - Standard Lots   │ - Bid/Ask Ticks  │
│ - EAT Timezone  │ - Margin & Pips   │ - Alert Pushes   │
└─────────────────┴───────────────────┴──────────────────┘
                           │
                 ┌─────────┴─────────┐
                 ▼                   ▼
        PostgreSQL / SQLite    Redis Message Cache
```

---

## 2. Technology Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, HTML5 High-DPI Canvas Charts, Zustand.
- **Backend**: Python 3.11+, FastAPI, SQLAlchemy, SQLite (Local Zero-Config) / PostgreSQL 16 (Production), WebSockets.
- **Quantitative Engine**: Pure Python vector calculations for RSI(14), MACD(12,26,9), EMA(20,50,200), Bollinger Bands(20,2), ATR(14), and Swing Support/Resistance.
- **Mobile**: Capacitor 6 + Progressive Web App (PWA) with Android App Bundle (AAB) packaging support.
- **Primary Timezone**: `Africa/Nairobi` (EAT, UTC+3) with user-configurable timezone overrides.
- **Primary Currency**: USD with multi-account currency compatibility.

---

## 3. Quick Start (Local Development)

### Step 1: Start the FastAPI Backend

```bash
# In project root:
$env:PYTHONPATH="backend"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
The backend initializes database tables automatically and seeds initial verified signals and the Chief Analyst account:
- **API URL**: `http://127.0.0.1:8000`
- **Swagger Documentation**: `http://127.0.0.1:8000/docs`
- **Default Super Admin**: `admin@forexsignalpro.com` / `AdminPass123!`

### Step 2: Start the React Frontend

```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 4. Running via Docker Compose

```bash
docker-compose up --build -d
```
Services spun up:
- Web Terminal: `http://localhost:3000`
- API Backend: `http://localhost:8000`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

---

## 5. Automated Tests

The automated test suite verifies password hashing, JWT encoding, technical indicators, and position sizing:

```bash
$env:PYTHONPATH="backend"
python -m pytest backend/tests -v
```

All 9 tests pass with zero warnings:
- `test_auth.py` (Password hashing, JWT decoding)
- `test_indicators.py` (SMA, EMA, RSI bounds, Bollinger Bands, ATR)
- `test_risk_engine.py` (EUR/USD lot sizing, Gold pip value conversion)

---

## 6. Android Packaging & Play Store Deployment

See [`ANDROID_BUILD.md`](./ANDROID_BUILD.md) for full instructions on building `app-release.aab` using Capacitor.
