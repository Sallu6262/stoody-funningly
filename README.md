# Salman & Wajeha - Open Road

A small, polished low-poly driving world built with Three.js and Cannon.js. It preserves the responsive raycast-vehicle character of Bruno Simon's Folio 2019 while using a new F1-inspired car, map, palette and identity.

Live production game: https://salman-wajeha-racing.netlify.app

The Phase 5 build includes three configurable timed checkpoint papers, physical Answer Submission Stations, server-verified approvals and lock codes, a moving train with timeout/retry, and the final rescue. A private Google spreadsheet hosts papers using `Papers`, `Questions`, and `Responses` tabs. Forms can contain any mix of MCQs, text, numbers, and working steps; drafts update while the player types, and approval is polled in the background while the player explores.

The live Google backend still needs its Checkpoint 2/3 configuration rollout; see [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md). The train-video popup, current mobile joystick and audio are implemented locally and tracked in the same deployment history.

## Run locally

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

For the production build:

```bash
npm run build
npm run preview
```

Open `http://127.0.0.1:4173`.

## Controls

- WASD or arrow keys: accelerate, reverse and steer
- Space: brake
- Shift: boost
- R: reset
- H: honk
- L or the Sound button: mute/unmute music and effects
- E: use the nearby answer station or rescue lock console
- Mobile: one finger on the world displays a joystick around the car; drag toward the direction you want to drive, with distance controlling throttle. Drag behind it to reverse; lift your finger to release the throttle.
- Mobile: two fingers rotate/raise the camera and pinch to zoom. Tap the car to hop. The small horn and reset buttons sit at the lower right.

## Audio

The first **Start your engine** tap activates music and Web Audio effects, including speed-sensitive engine/road loops, material/impact-sensitive collisions, tire skid, boost, horn, UI clicks and train/result sounds. Mute preference persists locally; music pauses while the train video is open or the page is hidden. Audio is not downloaded on the welcome screen.

The joystick and small recordings are adapted from Bruno Simon's MIT-licensed Folio 2025; **Sudo** by Kounine is included under its separate CC0 dedication. Full credits and source paths are in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) and [public/audio/README.md](./public/audio/README.md).

## Current locations

- Site 01: Signal Point
- Site 02: Water Tower
- Site 03: Depot Yard
- Rescue Siding: captive placeholder, three numbered locks and a proximity code console

## Puzzle approval setup

Localhost automatically uses a safe mock approval service for testing. Deployed builds use the Netlify Functions proxy and never receive the spreadsheet ID, Apps Script secret, answer keys or examiner permissions.

Follow [GOOGLE_SHEETS_SETUP.md](./GOOGLE_SHEETS_SETUP.md) to initialize the three-tab daily-paper workbook and deploy the trusted Apps Script endpoint. Do not enable mock mode in production.

See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for attribution.
