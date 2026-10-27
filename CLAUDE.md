# Deep Dive

A 2D explorer game: one vertical axis from low Earth orbit (+600 km) down to the deepest trench (-11 km).
Animals and objects appear as silhouettes at their real elevation range; tap one to discover it and fill the collection book.

Stack: Phaser 3 + TypeScript + Vite. Tests: Vitest (unit/data) and Playwright (e2e, headless, desktop + Pixel 5 profiles).

## Commands
- `npm run dev` - dev server
- `npm run check` - typecheck + unit tests + build + e2e (run before every push)
- `npm test` / `npm run test:e2e` - run one layer
- `npm run sheet` - render all silhouettes to `artifacts/contact-sheet.png` (look at it after adding or editing silhouettes)
- In the cloud sandbox set `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome` before `npm run test:e2e`.

## Conventions
- Elevation is metres, 0 = sea level, negative = below. Sea animals must have `maxM <= 0`, sky animals `minM >= 0`. Aircraft, balloons, meteors, satellites and wrecks use `domain: "object"`.
- Everything is drawn at true scale from one continuous zoom (`View.mPerPx`, metres per CSS pixel, from 0.05 mm/px to 1,100 m/px). There is no non-linear world axis any more; only the minimap is compressed on purpose (`src/game/minimap-math.ts`). Convert with `elevToScreenY`/`screenYToElev`/`xToScreenX` (they take the playfield size; it follows the window, never assume 540x960).
- `lengthM` in `species.json` is the real size of the LONGEST SIDE OF THE DRAWN SILHOUETTE (body length for a fish, wingspan for a bird seen from below, flipper span for a top-view turtle). The engine measures each SVG's bounds (`src/game/svgBounds.ts`) and scales it so that side is exactly `lengthM`. Draw silhouettes with correct proportions and put a sourced real size in `lengthM`.
- Anything under `DOT_PX` (14 px) on screen is drawn as a circle; tapping it (or a dot on the minimap) flies the camera there, zooms until it fills 55% of the shorter screen side, discovers it and follows it. Never rescale sprites for visibility.
- The opening view is at sea level and about 300 m wide (`defaultMPerPx`), roughly a big ship's length. Circles and small silhouettes carry their name as a tag (`SHOW_NAMES` in `DiveScene.ts`; tags of bigger things win when they overlap, and the tag steps aside once a creature fills the screen). The zoom-out button (`#zoom-fit`) flies back to the largest object within 1.5 km (`src/game/nearby.ts`).
- The minimap is a fixed overview and must never zoom (it blocks wheel/pinch/double-tap); only the world view zooms.
- The world is a 1,000 m wide column that wraps horizontally (`WORLD_W_M`); creatures drift slowly relative to their size.
- Important levels (Karman line, ISS orbit, Everest, sea level, Challenger Deep...) live in `src/data/landmarks.json` and are drawn as gold labelled lines; zone edges are drawn automatically (`src/game/markers.ts`). Add a landmark with a `source` URL.
- One-of-a-kind objects set `"instances": 1`; objects that should not drift set `"fixed": true`.
- Pure logic lives in `src/game/*.ts` without Phaser imports (world, zones, species, format, progress) and is unit tested. Keep it that way.
- Content is data: add a species by adding an entry to `src/data/species.json` and one SVG to `public/silhouettes/`. No engine changes needed.
- Silhouette SVG rules (enforced by tests): viewBox `0 0 256 256`, exactly one `<path>`, `fill="#fff"` (the engine tints it), side view facing right (top view for turtles/birds), coordinates within 0-256, no text/images/scripts.
- Every species needs a `source` URL, a `license`, a fact of at least 20 chars, and approximate-but-defensible ranges. Do not invent data.
- UI tests use the debug API `window.__game` (see `src/main.ts`): `setView`, `getView`, `getSize`, `setPaused`, `critterInfo(id)` (on-screen position, size in px, dot or sprite), `critterPoints()`, `focus(key)`, `minimapPointOf(key)`, `minimapPointAt(elevM)`, `getDiscovered`. Keys look like `iss#0`.
- Add an e2e test for every new player-facing behaviour, and look at the screenshots in `artifacts/`.

## Roadmap
1. More content: 40+ sea entries, 30 sky and object entries (more aircraft, rockets, Sputnik, Moon-bound things are out of scope), spread evenly across zones.
2. Quiz mode ("who's that?") before the reveal.
3. Sound + haptics, a submersible with depth limits and upgrades.
4. Capacitor wrapper for iOS/Android (`@capacitor/core`, `@capacitor/cli`, `npx cap add android`), Tauri or Electron for macOS.
