//+------------------------------------------------------------------+
//|                                     ForexSignalPro_Copier.mq5    |
//|                             Copyright 2026, Forex Signal Pro     |
//|                         https://forex-signal-pro.onrender.com     |
//+------------------------------------------------------------------+
#property copyright   "Forex Signal Pro"
#property link        "https://forex-signal-pro.onrender.com"
#property version     "2.00"
#property description "Institutional Auto-Execution Trade Copier for MT5"
#property description "Auto-executes high-confluence signals with dynamic risk sizing and breakeven trailing"

#include <Trade\Trade.mqh>
#include <Trade\PositionInfo.mqh>
#include <Trade\OrderInfo.mqh>

CTrade         trade;
CPositionInfo  posInfo;

//--- Enums
enum ENUM_LOT_MODE
{
   LOT_MODE_FIXED        = 0, // Fixed Lot Size
   LOT_MODE_DYNAMIC_RISK = 1  // Dynamic Risk (% of Account Equity)
};

//--- Inputs
input group "=== Cloud Backend Configuration ==="
input string          InpServerUrl            = "https://www.pipsattendant.com"; // Backend Base URL (Render)
input string          InpApiKey               = "fsp-secret-copier-key-998811";                             // Copier API Key
input int             InpPollIntervalSec      = 2;                                                           // Signal Check Interval (Seconds)

input group "=== Position Sizing & Risk Management ==="
input ENUM_LOT_MODE   InpLotMode              = LOT_MODE_DYNAMIC_RISK;                                       // Lot Sizing Mode
input double          InpRiskPercent          = 1.0;                                                         // Risk % per Trade (Dynamic Mode)
input double          InpFixedLot             = 0.10;                                                        // Lot Size (Fixed Mode)
input ulong           InpMagicNumber          = 889911;                                                      // EA Magic Number
input ulong           InpSlippagePoints       = 30;                                                          // Max Slippage (Points)

input group "=== Institutional Trade Management ==="
input bool            InpTrailBreakevenOnTP1  = true;                                                        // Move SL to Breakeven on TP1 Hit
input bool            InpUseTP2AsFinalTarget  = true;                                                        // Target TP2 if Available

// Global memory for executed signal IDs to prevent duplicate entries
int    g_executed_ids[];
int    g_executed_count = 0;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   trade.SetExpertMagicNumber(InpMagicNumber);
   trade.SetDeviationInPoints(InpSlippagePoints);
   trade.SetTypeFilling(ORDER_FILLING_IOC);

   ArrayResize(g_executed_ids, 0);
   g_executed_count = 0;

   // Start high-frequency polling timer
   EventSetTimer(InpPollIntervalSec);

   Print("======================================================");
   Print("🚀 Forex Signal Pro MT5 Trade Copier Initialized");
   Print("Backend Server: ", InpServerUrl);
   Print("Lot Mode: ", (InpLotMode == LOT_MODE_DYNAMIC_RISK ? "Dynamic Risk %" : "Fixed Lot"));
   Print("Magic Number: ", InpMagicNumber);
   Print("======================================================");

   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   Print("Forex Signal Pro Copier stopped. Reason code: ", reason);
}

//+------------------------------------------------------------------+
//| Expert timer function (executed every N seconds)                 |
//+------------------------------------------------------------------+
void OnTimer()
{
   FetchAndExecuteSignals();
   ProcessManagementActions();
}

//+------------------------------------------------------------------+
//| Helper: Check if signal has already been executed               |
//+------------------------------------------------------------------+
bool IsSignalExecuted(int sigId)
{
   for(int i = 0; i < g_executed_count; i++)
   {
      if(g_executed_ids[i] == sigId) return true;
   }

   // Also verify active positions by comment
   string tag = "FSP#" + IntegerToString(sigId);
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(posInfo.SelectByIndex(i))
      {
         if(posInfo.Magic() == InpMagicNumber && StringFind(posInfo.Comment(), tag) >= 0)
         {
            return true;
         }
      }
   }
   return false;
}

//+------------------------------------------------------------------+
//| Helper: Match broker symbol suffix (e.g. EURUSD, EURUSDm, EURUSD.pro) |
//+------------------------------------------------------------------+
string ResolveBrokerSymbol(string rawSymbol)
{
   string base = rawSymbol;
   StringReplace(base, "/", "");
   StringReplace(base, "-", "");
   base = StringTrim(base);

   // Direct match
   if(SymbolExist(base, false)) return base;

   // Common broker suffixes
   string suffixes[] = { "m", ".pro", ".r", ".c", ".ecn", "_i", "micro" };
   for(int s = 0; s < ArraySize(suffixes); s++)
   {
      string candidate = base + suffixes[s];
      if(SymbolExist(candidate, false)) return candidate;
   }

   return base;
}

//+------------------------------------------------------------------+
//| Calculate Lot Size based on Account Equity & SL distance        |
//+------------------------------------------------------------------+
double CalculateLots(string sym, double entryPrice, double stopLoss)
{
   if(InpLotMode == LOT_MODE_FIXED) return InpFixedLot;

   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   double riskAmount = equity * (InpRiskPercent / 100.0);

   double tickSize = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_SIZE);
   double tickValue = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE);
   double point = SymbolInfoDouble(sym, SYMBOL_POINT);

   if(tickSize == 0 || tickValue == 0 || point == 0) return 0.01;

   double slDistance = MathAbs(entryPrice - stopLoss);
   if(slDistance <= 0) return 0.01;

   double lossPerLot = (slDistance / tickSize) * tickValue;
   if(lossPerLot <= 0) return 0.01;

   double calculatedLots = riskAmount / lossPerLot;

   // Normalize to broker limits
   double minLot = SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN);
   double maxLot = SymbolInfoDouble(sym, SYMBOL_VOLUME_MAX);
   double lotStep = SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP);

   calculatedLots = MathFloor(calculatedLots / lotStep) * lotStep;
   if(calculatedLots < minLot) calculatedLots = minLot;
   if(calculatedLots > maxLot) calculatedLots = maxLot;

   return NormalizeDouble(calculatedLots, 2);
}

//+------------------------------------------------------------------+
//| HTTP GET: Fetch pending signals from Cloud Backend              |
//+------------------------------------------------------------------+
void FetchAndExecuteSignals()
{
   string url = InpServerUrl + "/api/v1/copier/pending-signals";
   string headers = "X-Copier-Key: " + InpApiKey + "\r\nAccept: application/json\r\n";
   char postData[];
   char resultData[];
   string resultHeaders;

   ResetLastError();
   int res = WebRequest("GET", url, headers, 3000, postData, resultData, resultHeaders);

   if(res == 200)
   {
      string jsonStr = CharArrayToString(resultData);
      ParseAndTradeJson(jsonStr);
   }
   else if(res == -1)
   {
      static bool warned = false;
      if(!warned)
      {
         Print("⚠️ WebRequest error ", GetLastError(), ". Please add '", InpServerUrl, "' to MT5: Tools > Options > Expert Advisors > Allow WebRequest");
         warned = true;
      }
   }
}

//+------------------------------------------------------------------+
//| Simple lightweight JSON token parser for signals                 |
//+------------------------------------------------------------------+
void ParseAndTradeJson(string json)
{
   if(StringLen(json) < 10) return;

   int searchPos = 0;
   while(true)
   {
      int idPos = StringFind(json, "\"id\":", searchPos);
      if(idPos < 0) break;

      int endId = StringFind(json, ",", idPos);
      string idStr = StringSubstr(json, idPos + 5, endId - (idPos + 5));
      int sigId = (int)StringToInteger(idStr);

      // Extract symbol
      int symPos = StringFind(json, "\"symbol\":\"", idPos);
      int endSym = StringFind(json, "\"", symPos + 10);
      string sym = StringSubstr(json, symPos + 10, endSym - (symPos + 10));

      // Extract direction
      int dirPos = StringFind(json, "\"direction\":\"", endSym);
      int endDir = StringFind(json, "\"", dirPos + 13);
      string dir = StringSubstr(json, dirPos + 13, endDir - (dirPos + 13));

      // Extract entry
      int entryPos = StringFind(json, "\"entry_price\":", endDir);
      int endEntry = StringFind(json, ",", entryPos);
      double entry = StringToDouble(StringSubstr(json, entryPos + 14, endEntry - (entryPos + 14)));

      // Extract SL
      int slPos = StringFind(json, "\"stop_loss\":", endEntry);
      int endSl = StringFind(json, ",", slPos);
      double sl = StringToDouble(StringSubstr(json, slPos + 12, endSl - (slPos + 12)));

      // Extract TP1
      int tpPos = StringFind(json, "\"take_profit_1\":", endSl);
      int endTp = StringFind(json, ",", tpPos);
      double tp = StringToDouble(StringSubstr(json, tpPos + 16, endTp - (tpPos + 16)));

      // Extract TP2 if enabled
      if(InpUseTP2AsFinalTarget)
      {
         int tp2Pos = StringFind(json, "\"take_profit_2\":", endTp);
         if(tp2Pos > 0)
         {
            int endTp2 = StringFind(json, ",", tp2Pos);
            string tp2Val = StringSubstr(json, tp2Pos + 16, endTp2 - (tp2Pos + 16));
            if(tp2Val != "null")
            {
               double tp2 = StringToDouble(tp2Val);
               if(tp2 > 0) tp = tp2;
            }
         }
      }

      // Check if already executed
      if(!IsSignalExecuted(sigId))
      {
         ExecuteOrder(sigId, sym, dir, entry, sl, tp);
      }

      searchPos = endSl;
   }
}

//+------------------------------------------------------------------+
//| Execute Buy/Sell Trade directly on MetaTrader 5                  |
//+------------------------------------------------------------------+
void ExecuteOrder(int sigId, string rawSym, string direction, double entry, double sl, double tp)
{
   string brokerSym = ResolveBrokerSymbol(rawSym);
   if(!SymbolSelect(brokerSym, true))
   {
      Print("❌ Symbol not supported by broker: ", brokerSym);
      return;
   }

   double ask = SymbolInfoDouble(brokerSym, SYMBOL_ASK);
   double bid = SymbolInfoDouble(brokerSym, SYMBOL_BID);
   int digits = (int)SymbolInfoInteger(brokerSym, SYMBOL_DIGITS);

   double lots = CalculateLots(brokerSym, (direction == "BUY" ? ask : bid), sl);
   string comment = "FSP#" + IntegerToString(sigId);

   bool success = false;
   if(direction == "BUY")
   {
      success = trade.Buy(lots, brokerSym, ask, NormalizeDouble(sl, digits), NormalizeDouble(tp, digits), comment);
   }
   else if(direction == "SELL")
   {
      success = trade.Sell(lots, brokerSym, bid, NormalizeDouble(sl, digits), NormalizeDouble(tp, digits), comment);
   }

   if(success)
   {
      ulong ticket = trade.ResultOrder();
      Print("✅ AUTO-EXECUTED: Signal #", sigId, " | ", brokerSym, " ", direction, " ", lots, " Lots @ Ticket #", ticket);

      // Record ID locally
      ArrayResize(g_executed_ids, g_executed_count + 1);
      g_executed_ids[g_executed_count] = sigId;
      g_executed_count++;

      // Send execution confirmation to cloud backend
      ReportExecution(sigId, (int)ticket, brokerSym, direction, lots, trade.ResultPrice());
   }
   else
   {
      Print("❌ Order failed for Signal #", sigId, ". Error: ", trade.ResultRetcode(), " - ", trade.ResultRetcodeDescription());
   }
}

//+------------------------------------------------------------------+
//| HTTP POST: Report order fill to Cloud Backend                   |
//+------------------------------------------------------------------+
void ReportExecution(int sigId, int ticket, string sym, string action, double lots, double fillPrice)
{
   string url = InpServerUrl + "/api/v1/copier/report";
   string headers = "X-Copier-Key: " + InpApiKey + "\r\nContent-Type: application/json\r\n";
   string payload = StringFormat("{\"signal_id\":%d,\"mt5_ticket\":%d,\"symbol\":\"%s\",\"action\":\"%s\",\"lot_size\":%.2f,\"fill_price\":%.5f,\"status\":\"EXECUTED\"}",
                                 sigId, ticket, sym, action, lots, fillPrice);
   char postData[];
   StringToCharArray(payload, postData, 0, WHOLE_ARRAY, CP_UTF8);
   ArrayResize(postData, ArraySize(postData) - 1); // remove null terminator

   char resultData[];
   string resultHeaders;
   WebRequest("POST", url, headers, 3000, postData, resultData, resultHeaders);
}

//+------------------------------------------------------------------+
//| Trailing Stop to Breakeven when TP1 is hit                       |
//+------------------------------------------------------------------+
void ProcessManagementActions()
{
   if(!InpTrailBreakevenOnTP1) return;

   string url = InpServerUrl + "/api/v1/copier/management-actions";
   string headers = "X-Copier-Key: " + InpApiKey + "\r\nAccept: application/json\r\n";
   char postData[];
   char resultData[];
   string resultHeaders;

   int res = WebRequest("GET", url, headers, 3000, postData, resultData, resultHeaders);
   if(res != 200) return;

   string json = CharArrayToString(resultData);
   if(StringLen(json) < 10) return;

   // Search for TRAIL_BREAKEVEN commands
   int searchPos = 0;
   while(true)
   {
      int idPos = StringFind(json, "\"signal_id\":", searchPos);
      if(idPos < 0) break;

      int endId = StringFind(json, ",", idPos);
      int sigId = (int)StringToInteger(StringSubstr(json, idPos + 12, endId - (idPos + 12)));

      int actPos = StringFind(json, "\"action\":\"", endId);
      int endAct = StringFind(json, "\"", actPos + 10);
      string action = StringSubstr(json, actPos + 10, endAct - (actPos + 10));

      int entryPos = StringFind(json, "\"entry_price\":", endAct);
      int endEntry = StringFind(json, ",", entryPos);
      double entryPrice = StringToDouble(StringSubstr(json, entryPos + 14, endEntry - (entryPos + 14)));

      if(action == "TRAIL_BREAKEVEN")
      {
         string tag = "FSP#" + IntegerToString(sigId);
         for(int i = PositionsTotal() - 1; i >= 0; i--)
         {
            if(posInfo.SelectByIndex(i))
            {
               if(posInfo.Magic() == InpMagicNumber && StringFind(posInfo.Comment(), tag) >= 0)
               {
                  double currSl = posInfo.StopLoss();
                  int digits = (int)SymbolInfoInteger(posInfo.Symbol(), SYMBOL_DIGITS);
                  double beSl = NormalizeDouble(entryPrice, digits);

                  // Modify SL if not already moved past entry
                  if((posInfo.PositionType() == POSITION_TYPE_BUY && currSl < beSl) ||
                     (posInfo.PositionType() == POSITION_TYPE_SELL && (currSl > beSl || currSl == 0)))
                  {
                     if(trade.PositionModify(posInfo.Ticket(), beSl, posInfo.TakeProfit()))
                     {
                        Print("🛡️ BREAKEVEN ACTIVATED: Ticket #", posInfo.Ticket(), " SL moved to entry ", beSl);
                     }
                  }
               }
            }
         }
      }

      searchPos = endEntry;
   }
}
//+------------------------------------------------------------------+
