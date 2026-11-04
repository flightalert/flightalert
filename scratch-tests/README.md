# scratch-tests (WIP, to be cleaned up)

Throwaway verification scripts written while building the cache/feed/HA gate fixes
(Trello cards #133 and #134). Kept so they are not lost. **Not a real test suite.**
Excluded from the `tsc` build in `tsconfig.json`.

Run one with: `npx tsx scratch-tests/<file>.mts`

## Known problems
- Imports use absolute paths (`/Users/preston/Documents/sites/flightalert1/...`) and import
  `node-persist` straight from `node_modules/node-persist/src/node-persist.js`.
- Storage dirs point at a session scratchpad under `/private/tmp/claude-501/...`
  (they get created and need removing afterwards).
- They overwrite `fetch`, `axios.get`, `console.*` and singleton state (`receiver`, `gate`)
  without restoring it, so each file must run on its own, never together.
- Several are stale (see below). Many also print log lines, so they are noisy.

## Files
| File | Covers | Status |
|---|---|---|
| t1 | parser, FlightAware cache, old gate | **Stale**: gate section asserts the removed `failMode`/`staleAfterMs`; type errors |
| t2 | probe: old fail-open gate with a stale `off` and a fresh `unavailable` | Probe only; stale after the gate simplification |
| t3 | gate isOpen/poll, FlightAware, queue | **Stale**: old gate rules and queue-cap assertions |
| t3b | t3 minus old gate sections | FlightAware backoff + queue coalescing/cap (valid) |
| t4 | probe reproducing review findings | Probe only |
| t5 | simplified HA gate (`isOpen`, `poll`, 401 logging, 5 min stale) | Valid |
| t6 | altitude values, backoff escalation, queue cap/metric/timeout | Valid |
| t7 | slim cache entries + memory cap | Valid |
| t8 | `alt_geom`, receiver distance, disk cache during backoff, Apprise timeout | Valid |
| t9 | probe: direction bug and hex-only repeat alerts (pre-fix) | Probe only; its output changed after the fixes |
| t10 | direction at many latitudes, trace guard, body cancel, hex-keyed cache | Valid |

## Intended cleanup
Rewrite the valid ones as `node:test` tests (`node --import tsx --test test/*.test.ts`):
relative imports, a temp dir per test, restore overridden globals. Priority: NDJSON
parser, `isTooHigh`/`isTooFar`, direction calculation, HA gate, FlightAware cache and
backoff. The queue and Apprise-timeout scenarios are the most fragile and can wait.
