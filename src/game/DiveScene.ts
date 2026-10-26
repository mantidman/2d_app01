import Phaser from 'phaser';
import { SPECIES, Species, Instance, placeInstances } from './species';
import { Progress } from './progress';
import { SILHOUETTE_BOUNDS } from './silhouettes';
import { backgroundColorAt, silhouetteColorAt } from './zones';
import { buildMarkers } from './markers';
import { formatElevation } from './format';
import {
  DEFAULT_M_PER_PX,
  DOT_PX,
  MAX_M_PER_PX,
  MIN_M_PER_PX,
  Size,
  View,
  clamp,
  clampView,
  elevToScreenY,
  focusMPerPx,
  focusPx,
  renderMode,
  screenYToElev,
  sizeInPx,
  wrapDx,
  xToScreenX,
  zoomAbout,
} from './world';

export interface SceneHooks {
  progress: Progress;
  onView(view: View, size: Size): void;
  onTap(species: Species, isNew: boolean): void;
}

export interface CritterPoint {
  key: string;
  speciesId: string;
  elevM: number;
  /** Current horizontal position in metres (creatures drift). */
  x: number;
  color: string;
  found: boolean;
}

export interface CritterInfo {
  key: string;
  /** Page coordinates of the centre. */
  x: number;
  y: number;
  sizePx: number;
  mode: 'dot' | 'sprite';
}

interface Critter {
  key: string;
  species: Species;
  inst: Instance;
  sprite: Phaser.GameObjects.Image;
  dot: Phaser.GameObjects.Image;
  halo: Phaser.GameObjects.Image;
  phase: number;
  sx: number;
  sy: number;
  sizePx: number;
  mode: 'dot' | 'sprite';
}

interface Fly {
  t0: number;
  dur: number;
  from: View;
  peakLog: number;
  target: () => View;
  onDone?: () => void;
}

interface MarkerLabel {
  text: Phaser.GameObjects.Text;
  elevM: number;
  landmark: boolean;
}

const TEX = 512;
const TAP_SLOP = 10;
const KEY_PX_PER_S = 420;
const KEY_ZOOM_PER_S = 1.8;
const MIN_HIT_PX = 18;
const STRIPS = 96;
const LABEL_GAP_PX = 22;

const hexToInt = (hex: string) => Phaser.Display.Color.HexStringToColor(hex).color;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class DiveScene extends Phaser.Scene {
  private hooks!: SceneHooks;
  private view: View = { x: 0, elevM: 0, mPerPx: DEFAULT_M_PER_PX };
  private critters: Critter[] = [];
  private labels: MarkerLabel[] = [];
  private bg!: Phaser.GameObjects.Graphics;
  private lines!: Phaser.GameObjects.Graphics;
  private snow?: Phaser.GameObjects.Particles.ParticleEmitter;
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd' | 'q' | 'e', Phaser.Input.Keyboard.Key>;
  private drag: { lastX: number; lastY: number; moved: number; t: number } | null = null;
  private vel = { x: 0, y: 0 };
  private pinchLast = 0;
  private fly: Fly | null = null;
  private following: Critter | null = null;
  private paused = false;
  private lastView = '';
  /** True once create() has finished; the debug API waits for it so tests never race asset loading. */
  isReady = false;

  constructor() {
    super('dive');
  }

  preload(): void {
    for (const sp of SPECIES) this.load.svg(sp.id, `silhouettes/${sp.silhouette}`, { width: TEX, height: TEX });
  }

  create(): void {
    this.hooks = this.registry.get('hooks') as SceneHooks;
    this.bg = this.add.graphics().setDepth(-10);
    this.lines = this.add.graphics().setDepth(-4);
    this.makeTextures();
    this.createLabels();
    this.spawnCritters();
    this.createSnow();

    const kb = this.input.keyboard!;
    this.keys = {
      up: kb.addKey('UP'),
      down: kb.addKey('DOWN'),
      left: kb.addKey('LEFT'),
      right: kb.addKey('RIGHT'),
      w: kb.addKey('W'),
      a: kb.addKey('A'),
      s: kb.addKey('S'),
      d: kb.addKey('D'),
      q: kb.addKey('Q'),
      e: kb.addKey('E'),
    };
    this.input.addPointer(1);
    this.scale.on('resize', () => this.createSnow());

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.input.pointer2.isDown) return;
      this.drag = { lastX: p.x, lastY: p.y, moved: 0, t: this.time.now };
      this.vel = { x: 0, y: 0 };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.drag || !p.isDown || this.input.pointer2.isDown) return;
      const dx = p.x - this.drag.lastX;
      const dy = p.y - this.drag.lastY;
      this.drag.lastX = p.x;
      this.drag.lastY = p.y;
      this.drag.moved += Math.abs(dx) + Math.abs(dy);
      if (this.drag.moved >= TAP_SLOP) this.cancelMotion();
      this.setView({ x: this.view.x - dx * this.view.mPerPx, elevM: this.view.elevM + dy * this.view.mPerPx });
      this.vel = { x: dx * 60, y: dy * 60 };
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const d = this.drag;
      this.drag = null;
      this.pinchLast = 0;
      if (d && d.moved < TAP_SLOP && this.time.now - d.t < 600) {
        this.vel = { x: 0, y: 0 };
        this.tapAt(p.x, p.y);
      }
    });
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      this.cancelMotion();
      this.view = zoomAbout(this.view, Math.exp(dy * 0.0015), this.size, p.x, p.y);
    });
    this.isReady = true;
  }

  update(_t: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.1);
    this.handleKeys(dt);
    this.handlePinch();

    if (this.fly) this.stepFly();
    else if (this.following) this.setView({ x: this.following.inst.x, elevM: this.following.inst.elevM });
    else if (!this.drag && (Math.abs(this.vel.x) > 1 || Math.abs(this.vel.y) > 1)) {
      this.setView({ x: this.view.x - this.vel.x * dt * this.view.mPerPx, elevM: this.view.elevM + this.vel.y * dt * this.view.mPerPx });
      const damp = Math.pow(0.02, dt);
      this.vel = { x: this.vel.x * damp, y: this.vel.y * damp };
    }

    if (!this.paused) this.moveCritters(dt);
    this.render();

    const key = `${this.view.x.toFixed(4)}|${this.view.elevM.toFixed(4)}|${this.view.mPerPx.toPrecision(6)}|${this.scale.width}x${this.scale.height}`;
    if (key !== this.lastView) {
      this.lastView = key;
      this.hooks.onView({ ...this.view }, this.size);
    }
  }

  get size(): Size {
    return { w: this.scale.width, h: this.scale.height };
  }

  // ---- public API (UI and tests) -------------------------------------------------------------

  getView(): View {
    return { ...this.view };
  }

  /** Jump instantly. Cancels any flight or follow. */
  setViewNow(v: Partial<View>): void {
    this.cancelMotion();
    this.setView(v);
  }

  setPaused(p: boolean): void {
    this.paused = p;
  }

  /** Smoothly travel to a view: zooms out as far as needed to show the journey, then settles. */
  flyTo(to: Partial<View>, onDone?: () => void): void {
    this.cancelMotion();
    const start = this.getView();
    this.startFly(() => clampView({ ...start, ...to }), onDone);
  }

  /** Zoom button step: compounds on a zoom already under way and keeps following a focused creature. */
  zoomStep(factor: number): void {
    const base = this.fly ? this.fly.target().mPerPx : this.view.mPerPx;
    const mPerPx = clamp(base * factor, MIN_M_PER_PX, MAX_M_PER_PX);
    const follow = this.following;
    const { x, elevM } = this.view;
    this.cancelMotion();
    this.following = follow;
    this.startFly(() => clampView({ x: follow ? this.view.x + wrapDx(follow.inst.x - this.view.x) : x, elevM: follow ? follow.inst.elevM : elevM, mPerPx }));
  }

  /** Fly to a creature, zoom in so it fills the screen, and discover it on arrival. */
  focusOn(key: string): boolean {
    const c = this.critters.find((x) => x.key === key);
    if (!c) return false;
    this.focusCritter(c);
    return true;
  }

  critterPoints(): CritterPoint[] {
    return this.critters.map((c) => ({
      key: c.key,
      speciesId: c.species.id,
      elevM: c.inst.elevM,
      x: c.inst.x,
      color: c.species.color,
      found: this.hooks.progress.has(c.species.id),
    }));
  }

  /** On-screen info about the first visible instance of a species (null if none is on screen). */
  critterInfo(speciesId: string): CritterInfo | null {
    const rect = this.game.canvas.getBoundingClientRect();
    const scale = rect.width / this.scale.width;
    const { w, h } = this.size;
    for (const c of this.critters) {
      if (c.species.id !== speciesId) continue;
      if (c.sy < 0 || c.sy > h || c.sx < 0 || c.sx > w) continue;
      return { key: c.key, x: rect.left + c.sx * scale, y: rect.top + c.sy * scale, sizePx: c.sizePx, mode: c.mode };
    }
    return null;
  }

  /** Fill in every instance of a species once it has been discovered. */
  reveal(id: string): void {
    for (const c of this.critters) if (c.species.id === id) this.tint(c);
  }

  // ---- internals ----------------------------------------------------------------------------

  private setView(v: Partial<View>): void {
    this.view = clampView({ ...this.view, ...v });
  }

  private cancelMotion(): void {
    this.fly = null;
    this.following = null;
  }

  private handleKeys(dt: number): void {
    const k = this.keys;
    const dir = (c: boolean, d: boolean) => (c ? 1 : 0) - (d ? 1 : 0);
    const vy = dir(k.up.isDown || k.w.isDown, k.down.isDown || k.s.isDown);
    const vx = dir(k.right.isDown || k.d.isDown, k.left.isDown || k.a.isDown);
    const vz = dir(k.q.isDown, k.e.isDown);
    if (!vx && !vy && !vz) return;
    this.cancelMotion();
    this.vel = { x: 0, y: 0 };
    const step = KEY_PX_PER_S * dt * this.view.mPerPx;
    if (vz) this.view = zoomAbout(this.view, Math.pow(KEY_ZOOM_PER_S, vz * dt * 3), this.size);
    this.setView({ x: this.view.x + vx * step, elevM: this.view.elevM + vy * step });
  }

  private handlePinch(): void {
    const { pointer1: a, pointer2: b } = this.input;
    if (!(a.isDown && b.isDown)) {
      this.pinchLast = 0;
      return;
    }
    this.cancelMotion();
    this.drag = null;
    const dist = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
    if (this.pinchLast > 0 && dist > 4) this.view = zoomAbout(this.view, this.pinchLast / dist, this.size, (a.x + b.x) / 2, (a.y + b.y) / 2);
    this.pinchLast = dist;
  }

  private startFly(target: () => View, onDone?: () => void): void {
    const from = this.getView();
    const to = target();
    const distM = Math.hypot(wrapDx(to.x - from.x), to.elevM - from.elevM);
    const lz0 = Math.log(from.mPerPx);
    const lz1 = Math.log(to.mPerPx);
    const needLog = Math.log(Math.max(distM / (0.7 * this.size.h), 1e-9));
    const peakLog = Math.max(lz0, lz1, needLog);
    const distPx = distM / from.mPerPx;
    const dur = clamp(0.5 + 0.3 * Math.log10(1 + distPx / this.size.h) + 0.12 * Math.abs(lz1 - lz0), 0.5, 2.4);
    this.fly = { t0: this.time.now, dur: dur * 1000, from, peakLog, target, onDone };
  }

  private stepFly(): void {
    const f = this.fly!;
    const t = clamp((this.time.now - f.t0) / f.dur, 0, 1);
    const s = ease(t);
    const to = f.target();
    const lz0 = Math.log(f.from.mPerPx);
    const lz1 = Math.log(to.mPerPx);
    const bump = Math.max(0, f.peakLog - Math.max(lz0, lz1)) * Math.sin(Math.PI * s);
    this.setView({
      x: f.from.x + wrapDx(to.x - f.from.x) * s,
      elevM: f.from.elevM + (to.elevM - f.from.elevM) * s,
      mPerPx: Math.exp(lz0 + (lz1 - lz0) * s + bump),
    });
    if (t >= 1) {
      this.fly = null;
      this.setView(to);
      f.onDone?.();
    }
  }

  private focusCritter(c: Critter): void {
    this.cancelMotion();
    this.following = c;
    const wanted = focusMPerPx(c.species.lengthM, this.size);
    // Already big enough on screen: keep the zoom, just centre and discover.
    const keep = sizeInPx(c.species.lengthM, this.view.mPerPx) >= focusPx(this.size) * 0.6;
    const mPerPx = keep ? this.view.mPerPx : wanted;
    this.startFly(
      () => clampView({ x: this.view.x + wrapDx(c.inst.x - this.view.x), elevM: c.inst.elevM, mPerPx }),
      () => {
        const isNew = this.hooks.progress.add(c.species.id);
        this.reveal(c.species.id);
        this.hooks.onTap(c.species, isNew);
      },
    );
  }

  private tapAt(px: number, py: number): void {
    let best: Critter | null = null;
    let bestD = Infinity;
    for (const c of this.critters) {
      const r = Math.max(MIN_HIT_PX, c.mode === 'sprite' ? c.sizePx * 0.45 : 0);
      const d = Math.hypot(c.sx - px, c.sy - py);
      if (d <= r && d < bestD) {
        best = c;
        bestD = d;
      }
    }
    if (best) this.focusCritter(best);
  }

  private moveCritters(dt: number): void {
    for (const c of this.critters) {
      c.inst.x += c.inst.dir * c.inst.speed * dt;
      c.inst.x = wrapDx(c.inst.x);
    }
  }

  private render(): void {
    const v = this.view;
    const { w, h } = this.size;
    this.drawBackground(w, h);
    this.drawMarkers(w, h);

    for (const c of this.critters) {
      c.sx = xToScreenX(v, c.inst.x, w);
      c.sy = elevToScreenY(v, c.inst.elevM, h);
      c.sizePx = sizeInPx(c.species.lengthM, v.mPerPx);
      c.mode = renderMode(c.sizePx);
      const margin = Math.max(c.sizePx, DOT_PX * 3);
      const visible = c.sx > -margin && c.sx < w + margin && c.sy > -margin && c.sy < h + margin;
      const showSprite = visible && c.mode === 'sprite';
      const showDot = visible && c.mode === 'dot';
      c.sprite.setVisible(showSprite);
      c.dot.setVisible(showDot);
      c.halo.setVisible(showDot);
      if (showSprite) {
        const b = SILHOUETTE_BOUNDS[c.species.silhouette];
        const boxPx = (c.sizePx * 256) / b.longest;
        const scale = boxPx / TEX;
        c.sprite.setPosition(c.sx, c.sy).setScale(c.inst.dir < 0 ? -scale : scale, scale);
      } else if (showDot) {
        c.dot.setPosition(c.sx, c.sy);
        c.halo.setPosition(c.sx, c.sy);
      }
    }
    this.snow?.setVisible(v.elevM < -60);
  }

  private drawBackground(w: number, h: number): void {
    const g = this.bg;
    g.clear();
    const strip = h / STRIPS;
    for (let i = 0; i < STRIPS; i++) {
      g.fillStyle(backgroundColorAt(screenYToElev(this.view, (i + 0.5) * strip, h)), 1);
      g.fillRect(0, i * strip, w, strip + 1);
    }
  }

  /** Landmark lines (gold) and zone edges (white). Labels that would overlap are hidden, landmarks first. */
  private drawMarkers(w: number, h: number): void {
    const g = this.lines;
    g.clear();
    const taken: number[] = [];
    const ordered = [...this.labels].sort((a, b) => Number(b.landmark) - Number(a.landmark));
    for (const m of ordered) {
      const y = elevToScreenY(this.view, m.elevM, h);
      const onScreen = y > -4 && y < h + 4;
      if (onScreen) {
        g.lineStyle(m.landmark ? 2 : 1, m.landmark ? 0xffe08a : 0xffffff, m.landmark ? 0.7 : 0.35);
        g.lineBetween(0, y, w, y);
      }
      const free = onScreen && !taken.some((t) => Math.abs(t - y) < LABEL_GAP_PX);
      m.text.setVisible(free);
      if (free) {
        taken.push(y);
        m.text.setPosition(10, y - 3);
      }
    }
  }

  private createLabels(): void {
    for (const m of buildMarkers()) {
      const landmark = m.kind === 'landmark';
      const text = this.add
        .text(10, 0, `${m.label} · ${formatElevation(m.elevM)}`, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: landmark ? '15px' : '13px',
          color: landmark ? '#ffe08a' : '#ffffff',
          stroke: '#000000',
          strokeThickness: 3,
          resolution: 2,
        })
        .setOrigin(0, 1)
        .setAlpha(landmark ? 0.95 : 0.7)
        .setDepth(-3)
        .setVisible(false);
      this.labels.push({ text, elevM: m.elevM, landmark });
    }
  }

  private makeTextures(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1).fillCircle(16, 16, 16);
    g.generateTexture('disc', 32, 32);
    g.clear();
    for (let r = 32; r > 0; r -= 2) g.fillStyle(0xffffff, 0.035).fillCircle(32, 32, r);
    g.generateTexture('halo', 64, 64);
    g.clear();
    g.fillStyle(0xffffff, 1).fillCircle(2, 2, 2);
    g.generateTexture('dot', 4, 4);
    g.destroy();
  }

  private spawnCritters(): void {
    for (const sp of SPECIES) {
      const b = SILHOUETTE_BOUNDS[sp.silhouette];
      placeInstances(sp).forEach((inst, i) => {
        const sprite = this.add.image(0, 0, sp.id).setOrigin(b.cx / 256, b.cy / 256).setVisible(false);
        const halo = this.add.image(0, 0, 'halo').setDisplaySize(DOT_PX * 2.6, DOT_PX * 2.6).setVisible(false).setAlpha(0.8);
        const dot = this.add.image(0, 0, 'disc').setDisplaySize(DOT_PX, DOT_PX).setVisible(false);
        const c: Critter = {
          key: `${sp.id}#${i}`,
          species: sp,
          inst,
          sprite,
          dot,
          halo,
          phase: 0,
          sx: -1e6,
          sy: -1e6,
          sizePx: 0,
          mode: 'dot',
        };
        this.tint(c);
        this.critters.push(c);
      });
    }
  }

  private tint(c: Critter): void {
    const found = this.hooks.progress.has(c.species.id);
    const color = found ? hexToInt(c.species.color) : silhouetteColorAt(c.inst.elevM);
    c.sprite.setTint(color);
    c.dot.setTint(color);
    c.halo.setTint(found ? color : 0x5fe0d0);
  }

  private createSnow(): void {
    this.snow?.destroy();
    const { w, h } = this.size;
    this.snow = this.add
      .particles(0, 0, 'dot', {
        x: { min: 0, max: w },
        y: { min: h, max: h + 20 },
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
