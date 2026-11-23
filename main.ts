// cbBTC Donchian breakout rider — btc-race-24h-20261123-0511
//
// Strategy (designed from the kit rules, not from any baseline):
//   * ENTRY: the 1-minute close breaks above the highest HIGH of the previous
//     30 bars (a 30-minute Donchian channel breakout). Full-size long, one
//     position at a time. A breakout means buyers just pushed price to a
//     30-minute high, so we ride the move instead of fading it.
//   * EXIT: a 2.5% trailing pullback from the highest close since entry.
//     Winners run; a real reversal cuts the ride short.
//   * SAFETY: after an exit, no re-entry for 120 bars (no chasing the same
//     whipsaw), and a circuit breaker stops new entries once cumulative
//     realised losses from exits reach 5% of starting equity. Worst case is
//     bounded far below the 25% drawdown guardrail.
//   * Long only, no leverage, no shorts, deterministic: every decision is a
//     pure function of the bars seen so far. No clock, no randomness, no
//     network, no files.
//
// Revision log (grade-local on the kit dev window, 1,440 bars):
//   * v1: N=30 breakout, 2.5% trailing exit, 120-bar cooldown, 5% breaker.
//     grade-local: net PnL $0.00, 0 trades — BUG: Donchian window included
//     the current bar's high, so close could never break out.
//   * v2: Donchian window now excludes the current bar's high.

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch, OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

// Donchian channel length in bars (30 one-minute bars = 30 minutes).
const CHANNEL_BARS = 30;
// Trailing exit: sell when the close falls this far below the highest close
// seen since entry (2.5%).
const TRAIL_PCT = 0.025;
// Bars to wait after an exit before a new entry is allowed.
const COOLDOWN_BARS = 120;
// Circuit breaker: stop entering once realised losses from exits reach this
// share of starting equity (5%).
const BREAKER_PCT = 0.05;
// Max slippage vs the latest close, in bps (fills land ~6 bps + impact away;
// 100 bps leaves room for a volatile open without ever accepting a bad fill).
const MAX_SLIPPAGE_BPS = 100;

interface RiderState {
  /** Highs of the bars seen so far, oldest first (USDC, floats). */
  highs: number[];
  /** Closes of the bars seen so far, oldest first (USDC, floats). */
  closes: number[];
  /** Highest close since the current position was opened (USDC). */
  peak: number;
  /** True while a position is open. */
  inPosition: boolean;
  /** Equity (quote units) at the batch where the current position was decided. */
  entryEquity: bigint;
  /** Cumulative realised PnL of completed round trips (quote units). */
  realised: bigint;
  /** Seq of the batch where the last exit was decided (-1 = never). */
  exitSeq: number;
  /** Starting equity, for the circuit breaker. */
  startEquity: bigint;
  /** Price scale from hello (price p is p / 10^price_scale USDC). */
  priceScale: number;
}

const rider: RiderState = {
  highs: [],
  closes: [],
  peak: 0,
  inPosition: false,
  entryEquity: 0n,
  realised: 0n,
  exitSeq: -1,
  startEquity: 0n,
  priceScale: 5,
};

function donchianHigh(): number {
  // Highest high of the previous CHANNEL_BARS bars. The current bar's high is
  // excluded: it is already in rider.highs (pushed first in onBatch), and a
  // close can never exceed its own bar's high, so including it would make a
  // breakout impossible.
  const hs = rider.highs;
  const n = Math.min(CHANNEL_BARS, hs.length - 1);
  let m = -Infinity;
  for (let i = hs.length - 1 - n; i < hs.length - 1; i++) {
    if (hs[i]! > m) m = hs[i]!;
  }
  return m;
}

await runBars({
  onHello(state: BarsState) {
    rider.startEquity = state.equity;
    const sym = state.symbols.get(SYMBOL);
    rider.priceScale = sym !== undefined ? sym.price_scale : 5;
  },

  onBatch(state: BarsState, batch: Batch): OrderInput[] {
    // Fold the new bar (if this batch carries one for CBBTC) into history.
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    const scale = 10 ** rider.priceScale;
    const high = Number(bar.h) / scale;
    const close = Number(bar.c) / scale;
    rider.highs.push(high);
    rider.closes.push(close);

    // Track position transitions from the account the harness reports.
    const pos = state.positions.get(SYMBOL);
    const holding = pos !== undefined && pos.qty > 0n;
    if (holding && !rider.inPosition) {
      // A buy just filled: start the trailing peak at this close.
      rider.inPosition = true;
      rider.peak = close;
    } else if (!holding && rider.inPosition) {
      // A sell just filled (or the window-end flatten): book the round trip.
      rider.realised += state.equity - rider.entryEquity;
      rider.inPosition = false;
      rider.peak = 0;
    }
    if (holding && close > rider.peak) rider.peak = close;

    // Never trade warm-up batches; orders there are rejected anyway.
    if (state.warmingUp) return [];
    // Need a full channel of history before the first signal.
    if (rider.highs.length <= CHANNEL_BARS) return [];

    if (holding) {
      // Trailing exit: the close fell TRAIL_PCT below the best close since entry.
      if (close < rider.peak * (1 - TRAIL_PCT)) {
        rider.exitSeq = state.seq;
        return [{ side: 'sell', symbol: SYMBOL, qty: pos!.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // Flat: consider an entry.
    if (state.seq - rider.exitSeq < COOLDOWN_BARS && rider.exitSeq >= 0) return [];
    if (rider.realised < (-rider.startEquity * BigInt(Math.round(BREAKER_PCT * 10000))) / 10000n) return [];
    if (close > donchianHigh()) {
      rider.entryEquity = state.equity;
      const room = state.weightRoom(SYMBOL);
      const spend = state.cash < room ? state.cash : room;
      if (spend <= 0n) return [];
      return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: spend, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  },
});
