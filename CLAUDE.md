# Deep Dive

A 2D explorer game: from low Earth orbit (+600 km) down through the sea (-11 km) and, zoomed out, the whole planet with its real radius (6,371 km) down to the Earth's centre.
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
- The world is a real sphere: `EARTH_RADIUS_M` = 6,371,000 m (IUGG mean radius; flattening ignored, equatorial 6,378 km / polar 6,357 km). Every elevation is a circle of radius R+e around the centre at elevation -R. Zoom range is 0.05 mm/px to 60,000 m/px; the whole planet fits at about 20,000 m/px on a desktop and 49,000 m/px on a phone (`wholeEarthMPerPx`). Zooming out past 5,000 m/px eases the camera towards the centre (`zoomAbout`) so the planet comes into view; the globe button flies there directly.
- Earth geometry lives in `src/game/earth.ts` (pure): `flat` (curve < 0.25 px), `arc` (visibly bent) and `circle` modes; the background is ONE canvas gradient (`backgroundGradient`) built from the colour table in `zones.ts`, repainted only when the view changes. Never paint overlapping full-width bands or discs for backgrounds: overdraw made frames 20x slower in software GL and would hurt phones. Landmark and zone lines are drawn as arcs/circles.
- Interior zones (crust to 35 km, mantle to 2,891 km, outer core to 5,150 km, inner core to the centre) are in `ZONES` and the colour table; they hold no creatures (the species test only covers zones above the trench).
- `lengthM` in `species.json` is the real size of the LONGEST SIDE OF THE DRAWN SILHOUETTE (body length for a fish, wingspan for a bird seen from below, flipper span for a top-view turtle). The engine measures each SVG's bounds (`src/game/svgBounds.ts`) and scales it so that side is exactly `lengthM`. Draw silhouettes with correct proportions and put a sourced real size in `lengthM`.
- Anything under `DOT_PX` (14 px) on screen is drawn as a circle; tapping it (or a dot on the minimap) flies the camera there, zooms until it fills 55% of the shorter screen side, discovers it and follows it. Never rescale sprites for visibility.
- The opening view is at sea level and about 300 m wide (`defaultMPerPx`), roughly a big ship's length. Circles and small silhouettes carry their name as a tag (`SHOW_NAMES` in `DiveScene.ts`; only at 12 m/px or finer, where the 1 km column is wide enough for creatures to be told apart; tags of bigger things win when they overlap, and the tag steps aside once a creature fills the screen). The zoom-out button (`#zoom-fit`) flies back to the largest object within 1.5 km (`src/game/nearby.ts`).
- Mountain profiles: `src/data/mountains.json` (Everest, Mauna Kea; Mauna Loa was dropped for now), pure maths in `src/game/mountains.ts`, polygon clipping in `src/game/clip.ts`. The `Profile: Off / Everest / Mauna Kea` control draws the mountain's side profile IN the world on the same height/depth scale, at its true width, and flies the camera to frame it. Heights are sourced (USGS, NOAA/Guinness, the 2020 Nepal-China survey); the flank CURVE is schematic; the WIDTHS ARE APPROXIMATE (`widthStatus`, `widthNote`) until a source is found. Never present them as measured, and only add a figure with a source.
- Horizontal position `view.x` is a true distance in metres along the planet's surface (it wraps once around the Earth, not every km). The camera walks along the curved surface, so the planet's centre is always straight under the screen centre (`earthGeometry().cx = w/2`). Use `worldToScreen` (src/game/earth.ts) for anything with real horizontal extent (it follows the Earth's curve); creatures use the flat 1 km-column transform `xToScreenX` and repeat every km. Flights use plain differences of `x`, never `wrapDx`.
- Big shapes (mountains are tens of thousands of px wide when zoomed in) are clipped to the screen in doubles before drawing (`clipPolygon`/`clipSegment`); never hand float32 GPU coordinates of 1e5+.
- While a profile is shown, creatures inside rock or ground (`insideSolid`) are hidden and untappable; focusing one from the book or minimap switches the profile off.
- The compare panel (button ⛰ in the zoom column, `src/peaks.ts`) ranks the two mountains above sea level and base to summit and links to the in-world profile.
- Book entries are buttons: clicking one closes the book and flies to the nearest copy of that species (`focusSpecies`), also for undiscovered "???" entries.
- The minimap is a fixed overview and must never zoom (it blocks wheel/pinch/double-tap); only the world view zooms.
- The world is a 1,000 m wide column that wraps horizontally (`WORLD_W_M`); creatures drift slowly relative to their size.
- Important levels (Karman line, ISS orbit, Everest, sea level, Challenger Deep...) live in `src/data/landmarks.json` and are drawn as gold labelled lines; zone edges are drawn automatically (`src/game/markers.ts`). Add a landmark with a `source` URL.
- One-of-a-kind objects set `"instances": 1`; objects that should not drift set `"fixed": true`.
- Pure logic lives in `src/game/*.ts` without Phaser imports (world, zones, species, format, progress) and is unit tested. Keep it that way.
- Content is data: add a species by adding an entry to `src/data/species.json` and one SVG to `public/silhouettes/`. No engine changes needed.
- Silhouette SVG rules (enforced by tests): viewBox `0 0 256 256`, exactly one `<path>`, `fill="#fff"` (the engine tints it), side view facing right (top view for turtles/birds), coordinates within 0-256, no text/images/scripts.
- Every species needs a `source` URL, a `license`, a fact of at least 20 chars, and approximate-but-defensible ranges. Do not invent data.
- UI tests use the debug API `window.__game` (see `src/main.ts`): `setView`, `getView`, `getSize`, `setPaused`, `critterInfo(id)` (on-screen position, size in px, dot or sprite), `critterPoints()`, `focus(key)`, `minimapPointOf(key)`, `minimapPointAt(elevM)`, `getDiscovered`, `earthInfo()` (mode, sea-level radius in px, sag, per-frame draw ms), `showEarth()`, `labels()`. Keys look like `iss#0`.
- Add an e2e test for every new player-facing behaviour, and look at the screenshots in `artifacts/`.

## Roadmap
1. More content: 40+ sea entries, 30 sky and object entries (more aircraft, rockets, Sputnik, Moon-bound things are out of scope), spread evenly across zones.
2. Quiz mode ("who's that?") before the reveal.
3. Sound + haptics, a submersible with depth limits and upgrades.
4. Capacitor wrapper for iOS/Android (`@capacitor/core`, `@capacitor/cli`, `npx cap add android`), Tauri or Electron for macOS.
