# Deep Dive

A 2D discovery game about **height and depth**. Travel from low Earth orbit (600 km up), through the sky and the sea, down to the deepest trench (11 km down) and, zoomed out, see the **whole planet at its true radius (6,371 km)**. Animals and objects appear as **silhouettes at their real elevation and their real size**. Find them, tap them, fill your collection book.

> Prototype. Built with AI agents; every feature is covered by automated tests that run headless, so it can be developed and checked entirely in the cloud.

## How it plays

- **One continuous, true-scale world.** Zoom from 0.05 mm per pixel up to the whole Earth. A 25 m blue whale is always exactly 250 times a 10 cm clownfish. A scale bar shows the current scale.
- **Small things are circles with a name tag.** Tap a circle and the camera flies there, zooms until it fills the screen, and discovers it.
- **Zoom out and the Earth appears.** The horizon bends gradually; after a while the camera pulls back and the whole planet is visible with its layers (atmosphere, sea, crust, mantle, outer core, inner core) and a labelled radius line. The globe button jumps there directly.
- **Minimap on the right (always visible).** Click to jump to a height or depth, drag to scrub, click a dot to fly to that creature. It never zooms; only the world view does.
- **Collection book.** Every entry is clickable and flies you to the nearest one of that species.
- **Height profiles (⛰).** Compare Mount Everest, Mauna Kea and Mauna Loa on one true vertical scale, measured three ways: above sea level (Everest wins; Mauna Kea's summit is only about 38 m higher than Mauna Loa's), base to summit (Mauna Kea, about 10.2 km), and including the crust pressed down under the volcano (Mauna Loa, about 17 km). Fly to any summit from the panel. Heights come from USGS, NOAA/Guinness and the 2020 Nepal-China survey; the profile shapes are schematic.
- **Important levels are marked:** sea level, Mount Everest, Mauna Kea and Mauna Loa summits, Armstrong limit, Kármán line (edge of space), ISS orbit, average ocean depth, Challenger Deep, core-mantle boundary, the Earth's centre, plus zone edges (sunlit, twilight, midnight, abyssal, hadal, atmosphere layers, interior layers).

Controls: drag or arrow keys / WASD to move, mouse wheel / pinch / `Q` `E` / the +/- buttons to zoom, `⤢` to zoom out to the largest nearby object, 🌍 for the whole Earth.

## Technology

It is a **web app**: TypeScript drawn on an HTML canvas. There is no server, database or account system; the build output is a folder of static files.

| Part | Technology |
|---|---|
| Game engine | [Phaser 3](https://phaser.io) (canvas/WebGL): silhouettes, circles, labels, camera |
| Language | TypeScript (strict) |
| Build tool | [Vite](https://vitejs.dev) |
| Background | One canvas 2D gradient: sky, sea and planet interior, with a radial gradient around the Earth's centre when zoomed out |
| Interface | Plain HTML and CSS (minimap, buttons, book, cards), no UI framework |
| Content | Data files: `src/data/species.json`, `src/data/landmarks.json`, one SVG path per silhouette in `public/silhouettes/` |
| Saved progress | Browser `localStorage` |
| Unit tests | [Vitest](https://vitest.dev) (world maths, Earth geometry, zones, sizes, data validation) |
| End-to-end tests | [Playwright](https://playwright.dev), headless Chromium with desktop and phone (Pixel 5) profiles |
| CI | GitHub Actions workflow in `.github/workflows/ci.yml` (typecheck, tests, build, e2e, screenshots as artifacts) |

### How the world works

- **Everything is in metres** on one axis: elevation 0 is sea level, negative is below. The world is a **sphere of radius 6,371 km** (IUGG mean radius), so a height `e` is a circle of radius `R + e` around the planet's centre.
- **True scale.** `View.mPerPx` (metres per screen pixel) is the single zoom. Each silhouette is measured from its SVG path and scaled so its longest side is exactly the species' real size (`lengthM`). Sprites are never enlarged for visibility: anything under 14 px becomes a circle instead.
- **Three drawing modes for the Earth** keep it cheap and numerically safe at every zoom: `flat` (curve under 0.25 px), `arc` (visibly bent), `circle` (whole planet). The background is repainted only when the view changes.
- **Pure logic is separate from rendering.** `src/game/*.ts` (world, zones, earth, species, format, nearby, minimap maths) has no Phaser imports and is unit tested. `DiveScene.ts` is the only Phaser scene.
- **Content is data.** Add a species by adding an entry to `species.json` and one SVG to `public/silhouettes/`. Tests check ranges, sources, licences, silhouette rules and that every zone above the trench has content.

See [`CLAUDE.md`](CLAUDE.md) for the full conventions used when agents work on this repo.

## Run it

```bash
npm install
npm run dev          # play at http://localhost:5173
npm run check        # typecheck, unit tests, build and end-to-end tests
npm run sheet        # render all silhouettes to artifacts/contact-sheet.png
```

In a cloud sandbox with a preinstalled browser, set `PW_CHROMIUM_PATH` to its Chromium before `npm run test:e2e`. Elsewhere run `npx playwright install chromium` once.

## Where it can run long-term

The build (`npm run build` produces `dist/`) is a static site, so it can run almost anywhere and has no backend to keep alive.

| Target | How | Status |
|---|---|---|
| **Web** | Any static host: GitHub Pages, Cloudflare Pages, Netlify. Works offline once cached; can be made an installable PWA. | Not deployed yet |
| **Android / iOS** | Wrap the same build with [Capacitor](https://capacitorjs.com). iOS needs a Mac build machine and an Apple developer account (about $99/year); Android needs a Google Play account (one-time fee). | Planned |
| **macOS / Windows** | Tauri or Electron around the same build, or just use the web version. | Planned |

Long-term notes:

- Progress lives only in the browser; clearing site data resets it. Syncing across devices would need accounts or a cloud save.
- Phaser, Vite, Vitest and Playwright are widely used open source projects; expect occasional dependency updates. The game logic is plain TypeScript and portable.
- Species facts and ranges come mostly from Wikipedia and NOAA links (see the `source` field of each entry) and are approximations: check them before a public release. The silhouettes are original drawings (CC0).

## Known limits

- The Earth is a perfect sphere: flattening is ignored (equatorial radius 6,378 km, polar 6,357 km). The ocean is a uniform 11 km shell and the crust uses a rough 35 km depth.
- The creatures live in a 1 km wide wrapping column. At planet scale the column is a single point at the top of the globe.
- Silhouettes are hand-drawn and only approximate real proportions; the goose, squid and amphipod are the roughest.
- 20 species so far. Most of the huge empty stretches between heights are still empty.

## Roadmap

1. More content: 40+ sea entries and 30 sky and object entries, spread evenly across zones.
2. Quiz mode ("who's that?") before the reveal.
3. Sound, haptics, a submersible with depth limits and upgrades.
4. Capacitor wrapper for iOS and Android; Tauri or Electron for macOS; a GitHub Pages deployment for easy phone testing.
