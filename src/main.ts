import Phaser from 'phaser';
import { DiveScene } from './game/DiveScene';
import { Progress } from './game/progress';
import { SPECIES } from './game/species';
import { Size, View } from './game/world';
import { createUi } from './ui';
import { createPeaks } from './peaks';

const progress = new Progress();

function scene(): DiveScene | undefined {
  return game.scene.getScene('dive') as DiveScene | undefined;
}

const ui = createUi(progress, {
  jumpTo: (m) => scene()?.flyTo({ elevM: m }),
  scrubTo: (m) => scene()?.setViewNow({ elevM: m }),
  focus: (key) => scene()?.focusOn(key),
  zoomBy: (f) => scene()?.zoomStep(f),
  fitLargest: () => scene()?.focusLargestNearby(),
  showEarth: () => scene()?.showWholeEarth(),
  focusSpecies: (id) => scene()?.focusSpecies(id),
});

createPeaks({ flyToElevation: (m) => scene()?.flyToElevation(m) });

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#000000',
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  scene: [DiveScene],
  callbacks: {
    preBoot: (g) => {
      g.registry.set('hooks', {
        progress,
        onView: (v: View, size: Size) => ui.setView(v, size),
        onTap: (sp: (typeof SPECIES)[number], isNew: boolean) => ui.showCard(sp, isNew),
      });
    },
  },
});

game.events.once('ready', () => {
  const s = scene();
  if (s) ui.setPoints(s.critterPoints());
});
const readyTimer = window.setInterval(() => {
  const s = scene();
  if (s?.isReady) {
    ui.setPoints(s.critterPoints());
    window.clearInterval(readyTimer);
  }
}, 50);

/** Small API for automated tests and agents; not used by the game itself. */
(window as unknown as { __game: unknown }).__game = {
  speciesIds: SPECIES.map((s) => s.id),
  ready: () => !!scene()?.isReady,
  getView: () => scene()?.getView(),
  getSize: () => scene()?.size,
  getElevation: () => scene()?.getView().elevM ?? NaN,
  /** Instant jump; any field you leave out stays as it is. */
  setView: (v: Partial<View>) => scene()?.setViewNow(v),
  setElevation: (m: number) => scene()?.setViewNow({ elevM: m }),
  flyTo: (v: Partial<View>) => scene()?.flyTo(v),
  focus: (key: string) => scene()?.focusOn(key),
  fitLargest: () => scene()?.focusLargestNearby() ?? null,
  showEarth: () => scene()?.showWholeEarth(),
  earthInfo: () => scene()?.earthInfo(),
  focusSpecies: (id: string) => scene()?.focusSpecies(id) ?? null,
  labels: () => scene()?.visibleLabels() ?? [],
  setPaused: (p: boolean) => scene()?.setPaused(p),
  getDiscovered: () => progress.list(),
  critterInfo: (id: string) => scene()?.critterInfo(id) ?? null,
  critterPoints: () => scene()?.critterPoints() ?? [],
  /** Page coordinates on the minimap for a creature key ("iss#0") or an elevation. */
  minimapPointOf: (key: string) => ui.minimap.pointOf(key),
  minimapPointAt: (elevM: number) => ui.minimap.pointAtElev(elevM),
  resetProgress: () => {
    progress.reset();
    location.reload();
  },
};
