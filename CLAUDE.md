# Deep Dive

A 2D explorer game: one vertical axis from the high sky (+12,000 m) down to the deepest trench (-11,000 m).
Animals and objects appear as silhouettes at their real elevation range; tap one to discover it and fill the collection book.

Stack: Phaser 3 + TypeScript + Vite. Tests: Vitest (unit/data) and Playwright (e2e, headless, desktop + Pixel 5 profiles).

## Commands
- `npm run dev` - dev server
- `npm run check` - typecheck + unit tests + build + e2e (run before every push)
- `npm test` / `npm run test:e2e` - run one layer
- `npm run sheet` - render all silhouettes to `artifacts/contact-sheet.png` (look at it after adding or editing silhouettes)
- In the cloud sandbox set `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome` before `npm run test:e2e`.

## Conventions
- Elevation is metres, 0 = sea level, negative = below. Sea animals must have `maxM <= 0`, sky animals `minM >= 0`.
- Pure logic lives in `src/game/*.ts` without Phaser imports (world, zones, species, format, progress) and is unit tested. Keep it that way.
- Content is data: add a species by adding an entry to `src/data/species.json` and one SVG to `public/silhouettes/`. No engine changes needed.
- Silhouette SVG rules (enforced by tests): viewBox `0 0 256 256`, exactly one `<path>`, `fill="#fff"` (the engine tints it), side view facing right (top view for turtles/birds), coordinates within 0-256, no text/images/scripts.
- Every species needs a `source` URL, a `license`, a fact of at least 20 chars, and approximate-but-defensible ranges. Do not invent data.
- UI tests use the debug API `window.__game` (see `src/main.ts`): `setElevation`, `setPaused`, `screenPositionOf(id)`, `getDiscovered`.
- Add an e2e test for every new player-facing behaviour, and look at the screenshots in `artifacts/`.

## Roadmap
1. More content: 40+ sea entries, 30 sky entries, spread evenly across zones.
2. Quiz mode ("who's that?") before the reveal.
3. Sound + haptics, a submersible with depth limits and upgrades.
4. Capacitor wrapper for iOS/Android (`@capacitor/core`, `@capacitor/cli`, `npx cap add android`), Tauri or Electron for macOS.
