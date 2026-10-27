# Salman & Wajeha Racing — Project Handoff

Last updated: 28 October 2026 (Asia/Karachi)

## Start here in a new chat

Ask Codex to read this file before making changes:

> Continue `salman-wajeha-racing`. Read `PROJECT_CONTEXT.md`, inspect the current files, and preserve the existing driving feel, performance, Phase 5 train/timer flow, Google Sheets security model, Git history, and Netlify deployment. Do not add later story features unless I explicitly request them.

Project directory:

`C:\Users\Salman Javed\Downloads\AI game\salman-wajeha-racing`

Production game:

https://salman-wajeha-racing.netlify.app/

GitHub repository:

https://github.com/Sallu6262/stoody-funningly

## Current status

The project is a deployed Phase 5 build. It is a lightweight Three.js/Cannon.js driving game inspired by Bruno Simon's Folio 2019, but uses a new map, F1-inspired car, palette, environment, UI, and Salman & Wajeha branding.

The current production version has:

- Responsive F1 driving with acceleration, reverse, steering, braking, boost, suspension, collisions, reset, and a chase camera.
- A wide, smooth circular driving circuit with short access roads.
- Ramps, barriers, trees, signs, small structures, roadside scenery, shadows, and collision objects.
- Three playable checkpoint locations outside the circuit: Signal Point, Water Tower, and Depot Yard.
- Railway tracks, two dark tunnels, a captive placeholder, and three numbered locks.
- The licensed locomotive GLB now moves from the first tunnel toward the captive in sync with each paper countdown and exits through the second tunnel on timeout.
- An opening cinematic, story dialogue, configurable first clue, minimap, waypoint, and distance indicator.
- A separate Answer Submission Station and a reusable schema-driven puzzle form used by all three checkpoints.
- Google Sheets draft saving, submission, manual approval/rejection polling, examiner feedback, and three server-awarded lock codes.
- Persisted per-paper timers, timeout/retry flow, a train-video Easter egg, server-verified lock entry, and a final rescue sequence.
- Desktop keyboard controls and a car-centered touch joystick ported from Bruno Simon's Folio 2025, with analog throttle, reverse, two-finger camera/pinch zoom, tap-to-hop, horn and reset.
- Gesture-activated music, speed-sensitive engine/road loops, collision/skid/boost/UI/train/result sounds, and a persistent mute switch.
- Production deployment on Netlify with serverless functions protecting the Google integration.

## Completed phases

### Phase 1 — Lightweight driving world

- Ported only the necessary driving/rendering/physics ideas instead of the full Folio portfolio.
- Runtime dependencies are only `three` and `cannon`; Vite is the build tool.
- Added a custom procedural low-poly F1-inspired car in `src/game/F1Model.js`.
- Preserved the responsive Cannon raycast-vehicle character and added a more energetic chase camera.
- Created the personalized Salman & Wajeha welcome area and visual identity.
- Kept attribution and provenance in `LICENSE` and `THIRD_PARTY_NOTICES.md`.

### Phase 2 — Rescue environment and refinement

- Added the railway, sealed tunnel, captive placeholder, and three numbered locks.
- Removed the visible stationary locomotive; the far side of the tunnel is blocked and dark.
- Widened and smoothed the circuit and removed awkward racing-line obstacles.
- Placed all three checkpoint landmarks outside the main loop with easy road spurs.
- Added a rescue-area code console. Only a code awarded by the puzzle system can currently open Lock 1.
- Train movement, questions, timers, and story logic were deliberately deferred at this stage.

### Phase 3 — Story introduction and first mission

- Added the cinematic camera path over the rescue scene and tunnel.
- Added skippable dialogue and a Continue flow that pauses driving during popups.
- Added the configurable first clue in `src/game/storyConfig.js`.
- Current clue answer: `signal point` (also accepts configured alternatives).
- Correctly solving the clue reveals Signal Point on the minimap and activates its waypoint.
- Reaching Signal Point introduces the first major puzzle and then guides the player to the Answer Submission Station.

### Phase 4 — Puzzle submission and examiner approval

- Implemented Checkpoint 1 only, using placeholder paper content.
- The question form supports configurable MCQ, text, textarea/working, and number fields.
- Draft answers are saved after a short debounce and update the same Google Sheets response row.
- Submissions record paper/question identity, player ID, all answers, timestamps, score where applicable, status, and feedback.
- The game polls approval status every 20 seconds without refreshing.
- `APPROVED` awards Lock Code 1 and unlocks the next-mission state.
- `REJECTED` shows examiner feedback and allows the player to return and resubmit.
- The player can continue driving while approval is pending.

### Phase 5 — Train, timers, and complete puzzle flow

- Generalized the existing paper workflow across Checkpoints 1–3 without duplicating the form or Netlify functions.
- Added one configurable `TIMER_SECONDS` value per Google Sheets paper.
- The timer runs while solving/driving, pauses as soon as a submission is sent, resumes after rejection, and completes safely after approval.
- Approval reveals the next checkpoint; after Checkpoint 3, the player is routed to the captive.
- Added the moving licensed locomotive, second tunnel, cartoon voxel timeout burst, failure screen, retry flow, and a temporary **End timer** test button.
- Added **Where's the Train?** above the top-left map, now styled as a lavender railway-cinema ticket. Clicking it plays Salman's supplied 10-second video in a centered native dialog with a red close button, Escape/backdrop dismissal, and standard playback controls.
- The video is loaded only on first opening; closing stops playback and resets it. The original live train camera remains dedicated to the timeout/impact sequence.
- Lock entry now checks fresh server status before opening, so edited browser progress cannot manufacture an approval or code.
- Added final rescue animation and success state after all three locks open.
- Progress, drafts, timers, approved papers, codes, opened locks, and completion survive refresh.

## Google Sheets and backend architecture

One separate Google spreadsheet is already connected. It uses three tabs:

- `Papers`: one row per daily paper/checkpoint configuration.
- `Questions`: any number and mixture of fields linked by `PAPER_ID`.
- `Responses`: one response row per player attempt, with dynamic answer columns added automatically for new paper fields.

Important files:

- `google-apps-script/PuzzleApproval.gs` — workbook setup, dynamic columns, validation, grading/manual review, and status API.
- `netlify/functions/puzzle-paper.mjs` — fetches the active checkpoint paper.
- `netlify/functions/puzzle-draft.mjs` — saves live drafts.
- `netlify/functions/puzzle-submit.mjs` — submits answers.
- `netlify/functions/puzzle-status.mjs` — returns trusted examiner status.
- `netlify/lib/puzzle.mjs` — validation, sanitization, and server-to-Apps-Script requests.
- `src/game/PuzzleApi.js` — browser API client; local development uses mock mode automatically.
- `src/game/PuzzleSystem.js` — form, station, draft, submit, polling, and reward UI.
- `src/game/puzzleConfig.js` — fallback placeholder paper and timing/station settings.

Security model:

- The browser never receives the Apps Script secret and cannot submit an approval status or lock code.
- Netlify holds `GOOGLE_APPS_SCRIPT_URL` and `PUZZLE_API_SECRET` as server environment variables.
- Apps Script holds the same secret as a Script Property.
- Do not print, commit, paste into chat, or move either secret into frontend code.
- The private spreadsheet link is intentionally not duplicated in this file. The integration is already configured; ask Salman for the sheet link only if direct sheet editing is required.

The updated Apps Script seeds `demo-paper-1`, `demo-paper-2`, and `demo-paper-3` only where a checkpoint does not already have a paper. The live spreadsheet and Apps Script deployment still need to be updated after Salman approves Phase 5.

## Main source map

- `src/game/Game.js` — scene/physics loop, input, camera, HUD, rescue interaction, and debug state.
- `src/game/Vehicle.js` — Cannon raycast vehicle tuning and wheel/suspension behavior.
- `src/game/TouchControls.js` — Folio 2025-style ground joystick, cubic analog throttle/steering, multi-touch camera, tap-to-hop, cancellation and focus/resize cleanup.
- `src/game/SoundManager.js` — gesture-safe Web Audio mixer, engine/road/effect loops, impact sounds, music streaming, mute persistence, page visibility and video ducking.
- `src/game/F1Model.js` — lightweight procedural car visuals.
- `src/game/World.js` — circuit, lighting-supporting environment, scenery, and obstacles.
- `src/game/RescueEnvironment.js` — railway, tunnel, captive, locks, and three destinations.
- `src/game/TrainController.js` — locomotive loading/movement, driver placeholders, timeout burst, cinematic camera, and rescue motion.
- `src/game/rescueConfig.js` — rescue interaction/lock configuration.
- `src/game/Story.js` — cinematic, dialogue, clue, waypoint, and minimap.
- `src/game/storyConfig.js` — editable story and clue text/answers.
- `src/game/PuzzleSystem.js` — three-paper progression, timers, persistence, submission/review, checkpoint routing, lock verification, and rescue completion.
- `src/style.css` and `index.html` — game UI.

## Recent bug fix

The clue input previously accepted only one character because the rescue updater focused the game canvas every animation frame while story UI was open. `Game.toggleRescuePanel()` now restores canvas focus only when an actually open rescue panel closes and driving is not blocked. The clue also explicitly focuses its input.

Verified with Playwright in both flows:

- Skip cinematic and use **Skip to clue**.
- Watch/continue through the normal tutorial.

Both accepted the complete `signal point` answer, retained `clue-input` focus, and produced zero browser errors. This fix is deployed to production.

## Verification state

Freshly verified locally on 27 October 2026:

- `npm.cmd test`: 5/5 tests passed.
- `npm.cmd run build`: successful, 23 modules transformed.
- Production source maps remain disabled.
- Playwright covered timer start, live train view, forced timeout, voxel burst, second-tunnel exit, retry, rejection/resume, all three approvals, three server-verified unlocks, final rescue, and refresh restoration.
- Zero browser console errors were recorded during the verification run.
- Phase 5 frontend and all four Netlify puzzle functions were deployed to production as Netlify deploy `6ae0dec59af0370e98765430` from Git commit `7d78592`.
- A production Playwright smoke check confirmed the game loads, the story reveals Checkpoint 1, and the lightweight **Where's the Train?** view opens and closes.
- The live API currently returns Checkpoint 1, but Checkpoints 2 and 3 fall back to bundled papers because the live Apps Script/sheet configuration has not yet been updated. The resulting two 502 resource errors are expected until that backend step is completed.

Current build sizes:

| File/scope | Raw | Gzip |
|---|---:|---:|
| HTML | 11,929 B | 3,534 B |
| CSS | 29,349 B | 6,504 B |
| JavaScript | 819,892 B | 218,204 B |
| Favicon | 307 B | 237 B |
| Locomotive GLB | 821,108 B | 246,224 B |
| Train video (on demand) | 3,684,490 B | 3,676,886 B |
| Audio assets and license/provenance (after start) | 6,359,279 B | 6,127,556 B |
| Built artifact total | 11,726,354 B | 10,279,145 B |

The locomotive is now requested by Phase 5 because it is part of the active timer threat and train camera.

Train-video update verification (27 October 2026): Playwright confirmed the button is above the map on desktop and mobile, the supplied 1280×720 video plays, the popup fits the viewport, the red close button and Escape stop/reset playback, and timeout while watching transitions safely to impact and retry. The five existing tests and production build passed.

The train-video update was deployed from Git commit `9519452` as Netlify deploy `6ae0eec9459d2d5c571ef1b9`. A production Playwright check verified video playback from the public asset URL, red-close dismissal, stopped/reset media, restored button focus, and no JavaScript runtime errors. The existing Checkpoint 2/3 backend configuration warnings remain unchanged.

Mobile/audio update (28 October 2026): replaced the five mobile buttons with the current Folio 2025 joystick's ring shader, 2–4.5 world-unit throttle range, cubic response, and 270-degree forward sector, adapted to Z-up/Cannon. Mobile camera framing now leaves room to touch in front of and behind the car. Keyboard driving/brake/boost bindings are preserved; H honks and L mutes. Multi-touch suspends driving and controls orbit/elevation/pinch zoom, and a grounded tap hops the car. Cannon clears `isInContact` during visual updates, so hop grounding correctly uses `raycastResult.hasHit`.

Audio uses six small MIT-covered samples from Folio 2025 plus Kounine's explicitly CC0 **Sudo** music track. Source revision `41046b57eeed8d156d9c3fd7fa259900baef7816`, paths, licenses, and exact sizes are recorded in `THIRD_PARTY_NOTICES.md` / `public/audio/README.md`; all downloaded files were verified against upstream Git blob hashes. No new runtime dependency was added. Music streams after the first start gesture instead of decoding the entire track; welcome-screen audio requests are zero. Web Audio effects are limited/compressed, randomized and scaled with impact/speed. Mute persists; video playback and page hiding silence/pause game audio.

Local verification: 9/9 tests passed. Playwright used a real touch-enabled 390×844 context with trusted CDP touch events to verify acceleration, proportional steering, reverse, neutral release/cancel, multi-touch camera, hop, physical collision audio, music/output energy, gesture activation, mute refresh persistence, and train-video audio handoff. Desktop W/Shift/Space/L checks passed, with no runtime errors. Browser emulation is not a physical iPhone/Safari device test.

Existing verification screenshots:

- `production-live-check.png`
- `phase4-daily-paper-approved.png`

## Known limitations and deliberately deferred work

- Actual exam/puzzle questions have not been supplied; all three papers use placeholder content.
- The 3D drivers and captive use placeholder faces; the Easter-egg video is Salman's supplied clip at `public/assets/train-cinema.mp4`.
- The temporary **End timer** button is intentionally visible for animation testing and should be removed or restricted before the final public release if Salman requests it.
- The updated Apps Script has not been copied/deployed and its setup function has not been rerun, so the existing live sheet may still contain only the Phase 4 Checkpoint 1 configuration.
- Player identity is a generated localStorage ID, not an authenticated account. Clearing browser storage creates a new ID.
- Git is initialized on `main`, connected to `Sallu6262/stoody-funningly`, and protected by a GitHub Actions test/build workflow. Local secrets, Netlify state, dependencies, and build output are ignored.

## Recommended next steps

1. **Add the first real paper.** Salman should provide:
   - Paper title/date or ID.
   - Checkpoint number.
   - Intro/long-question text.
   - Each field in display order: type (`mcq`, `text`, `textarea`, or `number`), label/question, required or optional, choices, points, correct answer/tolerance where auto-grading is wanted, unit, and placeholder.
   - Approval mode (use manual review unless Salman explicitly wants automatic MCQ/numerical scoring).
   - Passing percentage if auto-scored fields are used.
   - Lock number and private reward code.
2. **Update and validate the three sheet tabs.** Keep only one `LIVE` paper per checkpoint. Use the Apps Script **Racing Papers → Validate live papers** menu.
3. **Run an end-to-end production check.** Start a fresh player, discover Checkpoint 1, submit every field, confirm live draft columns, change the sheet status to `APPROVED`/`REJECTED`, verify polling, feedback, code award, and Lock 1 unlock.
4. **Complete the Phase 5 backend rollout.** Copy/deploy the updated Apps Script, run `setupPuzzleWorkbook`, validate all three live papers, and repeat the production approval/rejection check for Checkpoints 2 and 3.
5. **Replace placeholder faces.** Add the two driver photos and captive photo when Salman provides them.

## Local commands

PowerShell on this machine blocks `npm.ps1`, so use `npm.cmd`:

```powershell
cd "C:\Users\Salman Javed\Downloads\AI game\salman-wajeha-racing"
npm.cmd install
npm.cmd run dev
npm.cmd test
npm.cmd run build
npm.cmd run preview
```

Default dev URL: `http://127.0.0.1:5173/`

Deployment uses the already linked Netlify site. Rebuild, test, and perform a Playwright check before any production deploy.

## Product rules to preserve

- Preserve the responsive driving feel, chase camera, collisions, low-poly polish, and current performance.
- Keep the environment visually distinct from Folio 2019 and do not re-import the full portfolio.
- Prefer lightweight, properly licensed assets and keep attribution accurate.
- Keep production source maps disabled.
- Do not expose credentials, private sheet data, examiner permissions, correct answers, or lock codes in frontend bundles.
- Do not let the browser choose its own approval status or reward code.
- Do not add features beyond the approved Phase 5 scope until Salman requests the next phase.
