"""
Precision Entry Engine — Three-Stage Pipeline Orchestrator.

Runs Stage A → Stage B → Stage C in sequence.
Returns a ConfirmationResult for every instrument scanned.
Only a result with lifecycle_state == 'CONFIRMED' should be persisted as a signal.

This module is the single entry point for all callers.
"""

from typing import List, Optional
from app.schemas.market import Candle, Quote
from app.services.precision_engine.context import validate_context, ContextResult
from app.services.precision_engine.setup import detect_setup, SetupResult
from app.services.precision_engine.confirmation import confirm_entry, ConfirmationResult


def run_precision_pipeline(
    symbol: str,
    timeframe: str,
    candles: List[Candle],
    quote: Quote,
    h4_candles: Optional[List[Candle]] = None,
) -> ConfirmationResult:
    """
    Full three-stage precision-entry pipeline.

    Stage A: Context validation (bias, session, regime, levels).
    Stage B: Setup detection (BOS/CHoCH, FVGs, OBs, sweeps, displacement).
    Stage C: Entry confirmation & 11 mandatory hard gates.

    The pipeline is short-circuit aware: if Stage A fails, Stage B and C
    return appropriate NO_TRADE results without redundant computation.
    """
    # Stage A
    context: ContextResult = validate_context(
        symbol=symbol,
        timeframe=timeframe,
        candles=candles,
        quote=quote,
        h4_candles=h4_candles,
    )

    # Stage B
    setup: SetupResult = detect_setup(
        context=context,
        candles=candles,
    )

    # Stage C
    result: ConfirmationResult = confirm_entry(
        context=context,
        setup=setup,
        candles=candles,
        quote=quote,
    )

    return result
