# Salman & Wajeha - Open Road

A small, polished low-poly driving world built with Three.js and Cannon.js. It preserves the responsive raycast-vehicle character of Bruno Simon's Folio 2019 while using a new F1-inspired car, map, palette and identity.

Live production game: https://salman-wajeha-racing.netlify.app

The current Phase 4 build adds a reusable, schema-driven puzzle form and a separate Answer Submission Station. A single private Google spreadsheet can host a new paper every day using `Papers`, `Questions`, and `Responses` tabs. Forms can contain any mix of MCQs, text, numbers, and working steps; drafts update the response row while the player types, and approval is polled in the background while the player explores.

The sealed railway tunnel, captive and three numbered locks remain in place. Train movement, timers and final puzzle content are intentionally not implemented yet.

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
- E: use the nearby answer station or rescue lock console
- Touch controls appear on coarse-pointer/mobile devices

## Current locations

- Site 01: Signal Point
- Site 02: Water Tower
- Site 03: Depot Yard
- Rescue Siding: captive placeholder, three numbered locks and a proximity code console

## Puzzle approval setup

Localhost automatically uses a safe mock approval service for testing. Deployed builds use the Netlify Functions proxy and never receive the spreadsheet ID, Apps Script secret, answer keys or examiner permissions.

Follow [GOOGLE_SHEETS_SETUP.md](./GOOGLE_SHEETS_SETUP.md) to initialize the three-tab daily-paper workbook and deploy the trusted Apps Script endpoint. Do not enable mock mode in production.

See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for attribution.
