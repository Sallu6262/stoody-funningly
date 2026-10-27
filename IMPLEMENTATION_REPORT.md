# Salman & Wajeha - Phase 2 refinement

## Changes

- Replaced the irregular road loop with a wider 9.4 m closed circuit using a smoother centripetal spline and 240 road segments.
- Moved the start grid and welcome arch to the new lower straight.
- Removed roadside posts and blocks from the racing line, moved the pit shelter inward, and kept boundary trees clear of destinations and the tunnel.
- Moved all three future question sites outside the circuit and connected each with a short road spur.
- Removed the runtime locomotive and its loader. The licensed GLB remains in `public/assets` for the later arrival phase but is not requested by the browser.
- Added a sealed dark railway tunnel with a solid black rear chamber, physical portal and clear railway signage.
- Retained only the captive at the rescue point, with three larger numbered locks and a nearby three-light console.
- Added configurable placeholder codes in `src/game/rescueConfig.js` and a proximity interaction panel for unlocking each lock independently. No question content is included.

## Verification

- Production build completed successfully with no source maps.
- Playwright keyboard driving reached Signal Point, Water Tower and Depot Yard without added collisions.
- A circuit acceleration/steering pass produced steering and camera response without collisions.
- Correct codes unlock only their matching lock; incorrect codes leave the lock closed and show an inline error.
- Final console: 0 errors and 0 warnings.
- Final network log: HTML, JavaScript and CSS only; `locomotive.glb` was not requested.

## Size

| Scope | Raw | Gzip | Brotli |
|---|---:|---:|---:|
| Initial runtime | 664,333 B | 175,834 B | 144,565 B |
| Packaged build including reserved locomotive | 1,485,441 B | 421,754 B | 294,213 B |

The production JavaScript bundle is 652,778 B raw / 172,043 B gzip. CSS is 7,368 B raw / 2,245 B gzip. The build contains no source maps.

## Deferred

Questions, train movement, timers and story logic remain intentionally unimplemented.
