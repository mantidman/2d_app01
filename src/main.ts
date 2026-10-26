import Phaser from 'phaser';
import { DiveScene } from './game/DiveScene';
import { Progress } from './game/progress';
import { SPECIES } from './game/species';
import { WORLD_W, VIEW_H } from './game/world';
import { createUi } from './ui';

const progress = new Progress();
const ui = createUi(progress);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: WORLD_W,
  height: VIEW_H,
  backgroundColor: '#000000',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [DiveScene],
  callbacks: {
    preBoot: (g) => {
      g.registry.set('hooks', {
        progress,
        onElevation: (m: number) => ui.update(m),
        onTap: (sp: (typeof SPECIES)[number], isNew: boolean) => ui.showCard(sp, isNew),
      });
    },
  },
});

function scene(): DiveScene | undefined {
  return game.scene.getScene('dive') as DiveScene | undefined;
}

ui.onSlider((m) => scene()?.setElevation(m));

/** Small API for automated tests and agents; not used by the game itself. */
(window as unknown as { __game: unknown }).__game = {
  speciesIds: SPECIES.map((s) => s.id),
  ready: () => !!scene()?.cameras?.main,
  getElevation: () => scene()?.getElevation() ?? NaN,
  setElevation: (m: number) => scene()?.setElevation(m),
  setPaused: (p: boolean) => scene()?.setPaused(p),
  getDiscovered: () => progress.list(),
  discoverableAt: (m: number) => scene()?.discoverableAt(m) ?? [],
  screenPositionOf: (id: string) => scene()?.screenPositionOf(id) ?? null,
  resetProgress: () => {
    progress.reset();
    location.reload();
  },
};
