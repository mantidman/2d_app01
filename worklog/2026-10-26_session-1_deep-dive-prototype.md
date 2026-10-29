# Worklog: Deep Dive prototype, session 1

Dates: 2026-10-26 to 2026-10-27. Built with Claude Code in a cloud session; nothing was run on a real phone, and the GitHub Actions workflow has not run yet.

## Goal

A mobile (also web and macOS) game or app, built by agents without hand-holding, fully testable in the cloud. The idea that emerged: **discover the depth of the sea and the height of the sky**, with animals and objects shown **only as silhouettes** at their real heights and sizes, ending with the whole Earth at its true radius.

## Decisions

| Topic | Decision | Why |
|---|---|---|
| Stack | Phaser 3 + TypeScript + Vite, Capacitor later for iOS/Android | Text-only source, headless-testable in the cloud, one codebase for web/mobile/mac |
| Art | One white SVG path per animal, tinted by the engine | Agents can write, diff and test it as text; one consistent style |
| Content | JSON data files with a source and licence for every entry | Agents can add content without touching engine code; data is testable |
| Scale | One continuous true-scale zoom (metres per pixel), no inflated sprites | The user asked for correct measurements; small things become circles instead |
| Planet | Sphere of 6,371 km mean radius, camera eases to the centre when zooming out | The user wanted the Earth radius to become visible "after a while" |
| Overview | Fixed, non-zooming minimap on the right, compressed on purpose | The user tested it and called it perfect |
| Hosting | Static build; no backend | Longest possible lifetime, cheapest to keep running |

## Timeline

1. **Advice** on tools, then on the sea-and-sky concept, then silhouettes only.
2. **Prototype** (`44c9568`, branch `claude/elegant-gates-dkskoa`): Phaser dive scene, 13 silhouettes, discovery cards, collection book, localStorage, Vitest + Playwright, CI workflow.
   - Found by the contact sheet: weak silhouettes (whale like a submarine, near-identical birds), redrawn.
   - Found by a unit test: a `-0` formatting bug.
3. **Aircraft, satellites and levels** (`22d6cb0`): 7 new objects (jet, Concorde, balloon, meteor, Starlink, Hubble, ISS), landmarks (Kármán line, ISS orbit, Everest, sea level, Challenger Deep...), atmosphere zones.
   - Fixed a real test race: the debug API said "ready" while assets were still loading.
4. **Branch `improvement1`: true scale, circles, minimap** (`3e51663`, `8b394ac`, `65cefe8`).
   - SVG bounds measured so `lengthM` is the real longest side; sizes corrected.
   - Anything under 14 px is a circle; tap = fly + zoom + discover.
   - Always-visible minimap (click to jump, drag to scrub, click a dot to fly there).
   - Responsive playfield that stops at the minimap; scale bar, wheel/pinch/button zoom.
   - Opening view at sea level about 300 m wide; name tags on circles; zoom-out-to-largest-nearby button.
   - Clickable book entries.
   - Bugs caught by tests: zoom-out button did nothing when zoomed in on something tiny; rapid zoom clicks compounded wrongly.
5. **Merged to `main`**: `main` did not exist, so it was created from `improvement1` (fast-forward, same commit `65cefe8`).
6. **Branch `improvement2`: accurate Earth** (`2f87e12`).
   - Sphere geometry in `src/game/earth.ts` with `flat`/`arc`/`circle` modes; interior layers (crust 35 km, mantle, core-mantle boundary 2,891 km, outer core, inner core 1,221 km radius); radius line labelled 6,371 km; camera pull-back; globe button.
   - Performance finding: stacked ring fills overdrew the screen about 50 times (screenshots took about 8 s). Replaced with one canvas gradient: about 0.4 s, 1-2 ms per frame of geometry.
7. **Docs**: README rewritten with the technology, long-term hosting options and known limits; this worklog.
8. **Merged `improvement2` into `main`** (fast-forward; `main` is the only default line of work now, there is no `master`).

## Branches

| Branch | State |
|---|---|
| `claude/elegant-gates-dkskoa` | Original prototype branch, superseded |
| `improvement1` | Merged into `main` |
| `main` | Created from `improvement1` at `65cefe8` |
| `improvement2` | Earth radius + README + worklog; merged into `main` at the end of the session |

## State at the end of the session

- `npm run check` passes: typecheck, 127 unit tests, build, 36 headless end-to-end runs (desktop and phone sizes).
- 20 species/objects, 10 landmarks, 14 zones.
- Not deployed anywhere; code is on GitHub only.

## Lessons for next time

- Look at screenshots, not just green tests: most visual problems (clipped labels, hidden tails, ugly silhouettes) were only visible in the images.
- Headless software rendering is slow; fps is useless as a metric there. Measure the code you control (per-frame geometry time) instead.
- Avoid overdraw in backgrounds: one gradient beats stacked bands or discs.
- Tests that wait on animations must wait for the flight to finish (final zoom and elevation), not just an intermediate value.
- Phone emulation scales wheel deltas by the pixel ratio, so wheel-based tests need more steps there.

## Open questions and next steps

- Should undiscovered creatures show their names on circles (it spoils the "who's that?" idea), or show "???"? Switch: `SHOW_NAMES` in `DiveScene.ts`.
- Should jumping to an undiscovered book entry discover it, as it does now?
- Is the 1 km wide creature column and the 1.5 km "nearby" radius right?
- Next work: deploy to GitHub Pages for phone testing; Capacitor Android/iOS wrapper; much more content (40+ sea, 30+ sky/object entries) with fact-checked sources; quiz mode; sound and haptics.
- Facts and sizes come from Wikipedia and NOAA links and must be fact-checked before any public release.

## Addendum (2026-10-29): height profiles, branch `improvement3`

- Request: show the height profile of Mauna Kea, Mauna Loa and Mount Everest ("does this make sense?"). Yes: it fits the height theme and shows that "height" depends on where you measure.
- Figures checked with web search before building (Wikipedia is not reachable from the cloud sandbox, so USGS, NOAA, Guinness and news reports were used):
  - Mauna Loa: 4,169 m; volume at least 75,000 km3; submarine flanks about 5 km to the sea floor; crust pressed down about 8 km; about 17 km above its base (USGS).
  - Mauna Kea: summit 4,205 to 4,207 m depending on source; about 10,205 to 10,210 m from base to summit (NOAA, Guinness); where the base begins is debated.
  - Everest: 8,848.86 m (2020 Nepal-China survey).
  - NOT verified: Everest's base level (5,150 m, North Base Camp, approximate), and any crust-depression or volume figure for Mauna Kea and Everest (left empty on purpose).
- Built: `src/data/mountains.json`, `src/game/mountains.ts` (pure), `src/peaks.ts` (compare panel), summit landmarks, unit and e2e tests.

### Follow-up: profile in the world (Everest and Mauna Kea only)

- Request: show the mountain's side profile directly on the height/depth scale, with a toggle, true width, schematic shape, switchable between Everest and Mauna Kea; Mauna Loa dropped for now.
- Done: `Profile: Off / Everest / Mauna Kea` control; the mountain is drawn in the world and the camera flies to frame it; the panel can also show it.
- Architecture change this needed: `view.x` is now a true distance along the Earth's surface (wraps once round the planet) and the camera walks along the curve (`worldToScreen`); mountains are clipped to the screen before drawing (`clip.ts`); creatures inside rock or ground are hidden.
- Widths are NOT sourced: NASA Goddard gives about 120 km for Mauna Loa's base (not used any more); for Mauna Kea 120 km is an assumption by analogy; for Everest 8.8 km is a trekking-site straight-line distance from Base Camp to the summit (unverified). Both are marked `approximate` in the data and in the UI.
- Could not fetch Wikipedia or NASA pages from the sandbox (hosts not in the allowed list); search results were used instead. Allowing en.wikipedia.org, core2.gsfc.nasa.gov and earthobservatory.nasa.gov would let the widths be checked.
- Real elevation profiles (from DEM data) would replace the schematic curves; that needs data access.
