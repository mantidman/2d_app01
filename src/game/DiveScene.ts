import Phaser from 'phaser';
import { SPECIES, Species, placeInstances, displaySizeFor, Instance } from './species';
import { Progress } from './progress';
import { backgroundColorAt, silhouetteColorAt } from './zones';
import { buildMarkers } from './markers';
import { formatElevation } from './format';
import { WORLD_W, WORLD_H, VIEW_H, elevToY, yToElev, clamp } from './world';

export interface SceneHooks {
  progress: Progress;
  onElevation(elevM: number): void;
  onTap(species: Species, isNew: boolean): void;
}

interface Critter {
  sprite: Phaser.GameObjects.Image;
  inst: Instance;
  species: Species;
  baseY: number;
  phase: number;
}

const STRIP_PX = 40;
const TAP_SLOP = 10;
const KEY_SPEED = 900;

export class DiveScene extends Phaser.Scene {
  private hooks!: SceneHooks;
  private critters: Critter[] = [];
  private velocity = 0;
  private drag: { startY: number; lastY: number; moved: number; t: number } | null = null;
  private keys!: Record<'up' | 'down' | 'w' | 's', Phaser.Input.Keyboard.Key>;
  private snow?: Phaser.GameObjects.Particles.ParticleEmitter;
  private paused = false;
  private lastReported = NaN;
  /** True once create() has finished; the debug API waits for it so tests never race asset loading. */
  isReady = false;

  constructor() {
    super('dive');
  }

  preload(): void {
    for (const sp of SPECIES) this.load.svg(sp.id, `silhouettes/${sp.silhouette}`, { width: 256, height: 256 });
  }

  create(): void {
    this.hooks = this.registry.get('hooks') as SceneHooks;
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_W, WORLD_H);
    cam.scrollY = elevToY(0) - VIEW_H / 2;

    this.drawBackground();
    this.drawSurface();
    this.drawMarkers();
    this.spawnCritters();
    this.createSnow();

    const kb = this.input.keyboard!;
    this.keys = {
      up: kb.addKey('UP'),
      down: kb.addKey('DOWN'),
      w: kb.addKey('W'),
      s: kb.addKey('S'),
    };

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.drag = { startY: p.y, lastY: p.y, moved: 0, t: this.time.now };
      this.velocity = 0;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.drag || !p.isDown) return;
      const dy = p.y - this.drag.lastY;
      this.drag.lastY = p.y;
      this.drag.moved += Math.abs(dy);
      this.cameras.main.scrollY = clamp(cam.scrollY - dy, 0, WORLD_H - VIEW_H);
      this.velocity = -dy * 60;
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const d = this.drag;
      this.drag = null;
      if (d && d.moved < TAP_SLOP && this.time.now - d.t < 600) {
        this.velocity = 0;
        this.tapAt(p.worldX, p.worldY);
      }
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      this.velocity = clamp(this.velocity + dy * 4, -2400, 2400);
    });
    this.isReady = true;
  }

  update(_t: number, delta: number): void {
    const dt = delta / 1000;
    const cam = this.cameras.main;
    const k = this.keys;
    const dir = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
    if (dir !== 0) this.velocity = dir * KEY_SPEED;
    if (!this.drag) {
      cam.scrollY = clamp(cam.scrollY + this.velocity * dt, 0, WORLD_H - VIEW_H);
      this.velocity *= Math.pow(0.02, dt);
      if (Math.abs(this.velocity) < 1) this.velocity = 0;
    }

    const elev = this.getElevation();
    if (Math.abs(elev - this.lastReported) >= 1 || Number.isNaN(this.lastReported)) {
      this.lastReported = elev;
      this.hooks.onElevation(elev);
    }
    this.snow?.setVisible(elev < -60);

    if (this.paused) return;
    const now = this.time.now / 1000;
    for (const c of this.critters) {
      const half = c.sprite.displayWidth / 2;
      c.inst.x += c.inst.dir * c.inst.speed * dt;
      if (c.inst.x > WORLD_W + half) c.inst.x = -half;
      if (c.inst.x < -half) c.inst.x = WORLD_W + half;
      c.sprite.x = c.inst.x;
      c.sprite.y = c.baseY + Math.sin(now * 0.8 + c.phase) * 6;
    }
  }

  getElevation(): number {
    const cam = this.cameras.main;
    return yToElev(cam.scrollY + VIEW_H / 2);
  }

  setElevation(m: number): void {
    this.velocity = 0;
    this.cameras.main.scrollY = clamp(elevToY(m) - VIEW_H / 2, 0, WORLD_H - VIEW_H);
  }

  setPaused(p: boolean): void {
    this.paused = p;
  }

  /** Page coordinates of a sprite for the species if it is on screen (used by UI tests). */
  screenPositionOf(id: string): { x: number; y: number } | null {
    const cam = this.cameras.main;
    const rect = this.game.canvas.getBoundingClientRect();
    const scale = rect.width / this.scale.width;
    for (const c of this.critters) {
      if (c.species.id !== id) continue;
      const sy = c.sprite.y - cam.scrollY;
      if (sy < 0 || sy > VIEW_H || c.sprite.x < 0 || c.sprite.x > WORLD_W) continue;
      return { x: rect.left + c.sprite.x * scale, y: rect.top + sy * scale };
    }
    return null;
  }

  discoverableAt(elevM: number): string[] {
    return SPECIES.filter((s) => elevM >= s.minM - 1 && elevM <= s.maxM + 1).map((s) => s.id);
  }

  private tapAt(wx: number, wy: number): void {
    let best: Critter | null = null;
    let bestD = Infinity;
    for (const c of this.critters) {
      const r = c.sprite.displayWidth * 0.5;
      const d = Math.hypot(c.sprite.x - wx, c.sprite.y - wy);
      if (d <= r * 0.9 && d < bestD) {
        best = c;
        bestD = d;
      }
    }
    if (!best) return;
    const isNew = this.hooks.progress.add(best.species.id);
    this.reveal(best.species.id);
    this.hooks.onTap(best.species, isNew);
  }

  /** Fill in every instance of a species once it has been discovered. */
  reveal(id: string): void {
    for (const c of this.critters) {
      if (c.species.id === id) c.sprite.setTint(Phaser.Display.Color.HexStringToColor(c.species.color).color);
    }
  }

  private drawBackground(): void {
    const g = this.add.graphics().setDepth(-10);
    for (let y = 0; y < WORLD_H; y += STRIP_PX) {
      g.fillStyle(backgroundColorAt(yToElev(y + STRIP_PX / 2)), 1);
      g.fillRect(0, y, WORLD_W, STRIP_PX + 1);
    }
  }

  private drawSurface(): void {
    const g = this.add.graphics().setDepth(-5);
    const y = elevToY(0);
    g.fillStyle(0xffffff, 0.6);
    for (let x = 0; x < WORLD_W; x += 36) g.fillEllipse(x + 18, y, 36, 5);
  }

  /** Labelled lines for landmarks (gold) and zone edges (white), so levels are readable while scrolling. */
  private drawMarkers(): void {
    const g = this.add.graphics().setDepth(-4);
    for (const m of buildMarkers()) {
      const y = elevToY(m.elevM);
      const landmark = m.kind === 'landmark';
      g.lineStyle(landmark ? 2 : 1, landmark ? 0xffe08a : 0xffffff, landmark ? 0.7 : 0.35);
      g.lineBetween(0, y, WORLD_W, y);
      this.add
        .text(10, y - 3, `${m.label} · ${formatElevation(m.elevM)}`, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: landmark ? '15px' : '13px',
          color: landmark ? '#ffe08a' : '#ffffff',
          stroke: '#000000',
          strokeThickness: 3,
          resolution: 2,
        })
        .setOrigin(0, 1)
        .setAlpha(landmark ? 0.95 : 0.7)
        .setDepth(-3);
    }
  }

  private spawnCritters(): void {
    for (const sp of SPECIES) {
      const size = displaySizeFor(sp.lengthM);
      for (const inst of placeInstances(sp, WORLD_W)) {
        const baseY = elevToY(inst.elevM);
        const sprite = this.add.image(inst.x, baseY, sp.id).setDisplaySize(size, size);
        sprite.setFlipX(inst.dir < 0);
        const found = this.hooks.progress.has(sp.id);
        sprite.setTint(found ? Phaser.Display.Color.HexStringToColor(sp.color).color : silhouetteColorAt(inst.elevM));
        this.critters.push({ sprite, inst, species: sp, baseY, phase: Math.random() * 6 });
      }
    }
  }

  private createSnow(): void {
    const gfx = this.make.graphics({ x: 0, y: 0 }, false);
    gfx.fillStyle(0xffffff, 1).fillCircle(2, 2, 2);
    gfx.generateTexture('dot', 4, 4);
    gfx.destroy();
    this.snow = this.add
      .particles(0, 0, 'dot', {
        x: { min: 0, max: WORLD_W },
        y: { min: VIEW_H, max: VIEW_H + 20 },
        lifespan: 9000,
        speedY: { min: -70, max: -30 },
        speedX: { min: -8, max: 8 },
        scale: { min: 0.4, max: 1.4 },
        alpha: { start: 0.45, end: 0 },
        frequency: 140,
      })
      .setScrollFactor(0)
      .setDepth(5)
      .setVisible(false);
  }
}
