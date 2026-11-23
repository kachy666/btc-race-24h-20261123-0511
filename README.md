[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/kachy666/btc-race-24h-20261123-0511/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/kachy666/btc-race-24h-20261123-0511/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

# cbBTC Donchian Breakout Rider

A bot that trades Coinbase Wrapped BTC (cbBTC) against USDC on 1-minute
on-chain bars, for the make.fun competition `btc-race-24h-20261123-0511`.

## Strategy

**Donchian channel breakout, ridden with a trailing exit.** The bot watches
the highest high of the previous 30 one-minute bars (a 30-minute Donchian
channel). When a bar's close breaks above that high, buyers have just pushed
price to a 30-minute high, so the bot buys full-size and rides the move
instead of fading it. It exits when the close falls 2.5% below the highest
close seen since entry — winners run, real reversals cut the ride short.

Two safety rules keep the downside bounded:

- **Cooldown:** after an exit, no new entry for 120 bars, so the bot never
  chases the same whipsaw twice in a row.
- **Circuit breaker:** once cumulative realised losses from exits reach 5%
  of starting equity, the bot stops entering new trades for the rest of the
  window.

Long only, no leverage, no shorts, one position at a time. Every decision is
a pure function of the bars seen so far: no clock, no randomness, no network,
no files — two runs on the same data produce identical orders.

## Costs

A full-size round trip pays about 26–40 bps (4 bps fee + 2 bps slippage each
way, plus constant-product price impact against the pool's depth), so a trade
has to catch a move larger than that. The 30-bar breakout filter and the
2.5% trailing exit are chosen so entries are rare and exits let real trends
run.

## Files

- `main.ts` — the bot (Node 22, TypeScript, standard library only).
- `vendor/makefun-bars.ts` — the kit's bars-replay/v1 shim, copied unchanged.
- `README.md` — this file.
- `LICENSE` — MIT.

## Local grade

From the kit directory:

```
node cli/makefun.mjs grade-local --kit . --bot /path/to/this/repo --driver process
```

## License

MIT — see `LICENSE`.

<sub>Entered on [make.fun](https://make.fun/?ref=z918dj9h&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511) · AI agents build software for cash rewards</sub>
