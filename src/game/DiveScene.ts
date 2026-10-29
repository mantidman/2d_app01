import Phaser from 'phaser';
import { SPECIES, Species, Instance, placeInstances } from './species';
import { Progress } from './progress';
import { SILHOUETTE_BOUNDS } from './silhouettes';
import { silhouetteColorAt } from './zones';
import { buildMarkers } from './markers';
import { formatElevation } from './format';
import { pickLargestNearby, pickNearest } from './nearby';
import { EarthGeometry, backgroundGradient, contourY, earthGeometry, worldToScreen } from './earth';
import { Rect, clipPolygon, clipSegment } from './clip';
import { MOUNTAINS, Mountain, PLATFORM_HALF_WIDTHS, axisM, frameView, fullWidthKm, insideSolid, profileElevation } from './mountains';
import {
  DOT_PX,
  EARTH_RADIUS_M,
  Size,
  View,
  clamp,
  clampView,
  defaultMPerPx,
  elevToScreenY,
  focusMPerPx,
  focusPx,
  renderMode,
  sizeInPx,
  wholeEarthMPerPx,
  wrapDx,
  xToScreenX,
  zoomAbout,
} from './world';

export interface SceneHooks {
  progress: Progress;
  onView(view: View, size: Size): void;
  onTap(species: Species, isNew: boolean): void;
  /** The mountain profile layer changed (null = off). */
  onMountain?(id: string | null): void;
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
  label: Phaser.GameObjects.Text;
  sprite: Phaser.GameObjects.Image;
  dot: Phaser.GameObjects.Image;
  halo: Phaser.GameObjects.Image;
  phase: number;
  /** Inside rock or ground while a mountain profile is shown: not drawn, not tappable. */
  hidden: boolean;
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
const ARC_STEPS = 32;
/** Names are shown beside circles and small silhouettes (set false to keep undiscovered creatures secret). */
const SHOW_NAMES = true;
const LABEL_H = 18;
/** Zoomed out beyond this, the 1 km column is under ~80 px wide: creatures sit on top of each other and name tags would only pile up. */
const LABEL_MAX_M_PER_PX = 12;
/** Zoomed out beyond this, following a creature is pointless (it is a pixel): let the camera roam. */
const FOLLOW_MAX_M_PER_PX = 2000;
/** A silhouette bigger than this share of the shorter screen side needs no label: you are looking right at it. */
const LABEL_MAX_FRACTION = 0.4;

/** A circle as a polygon, with enough corners that it looks round at its size. */
function circlePoints(cx: number, cy: number, r: number): Phaser.Types.Math.Vector2Like[] {
  const n = Math.round(clamp(r / 4, 64, 360));
  return Array.from({ length: n }, (_, i) => ({ x: cx + r * Math.cos((2 * Math.PI * i) / n), y: cy + r * Math.sin((2 * Math.PI * i) / n) }));
}

const nfm = (m: number) => new Intl.NumberFormat('en-US').format(Math.round(m));

const hexToInt = (hex: string) => Phaser.Display.Color.HexStringToColor(hex).color;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class DiveScene extends Phaser.Scene {
  private hooks!: SceneHooks;
  private view: View = { x: 0, elevM: 0, mPerPx: 1 };
  private critters: Critter[] = [];
  private labels: MarkerLabel[] = [];
  private bgTex!: Phaser.Textures.CanvasTexture;
  private bgImage!: Phaser.GameObjects.Image;
  private bgKey = '';
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
  private labelLayoutW = 0;
  private geo: EarthGeometry | null = null;
  private mountain: Mountain | null = null;
  private mtnGfx!: Phaser.GameObjects.Graphics;
  private mtnLabel!: Phaser.GameObjects.Text;
  /** Screen boxes other labels must stay out of (the mountain's own label), refilled every frame. */
  private reserved: Array<{ x0: number; x1: number; y0: number; y1: number }> = [];
  /** Smoothed milliseconds per frame spent building the background and marker geometry (debug/perf). */
  drawMs = 0;
  private radiusLabel!: Phaser.GameObjects.Text;
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
    this.view.mPerPx = defaultMPerPx(this.size);
    this.bgTex = this.textures.createCanvas('bg', Math.max(1, this.scale.width), Math.max(1, this.scale.height))!;
    this.bgImage = this.add.image(0, 0, 'bg').setOrigin(0, 0).setDepth(-10);
    this.mtnGfx = this.add.graphics().setDepth(-6);
    this.mtnLabel = this.add
      .text(0, 0, '', { fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#ffffff', align: 'center', stroke: '#000000', strokeThickness: 3, resolution: 2 })
      .setOrigin(0.5, 1)
      .setDepth(-2)
      .setVisible(false);
    this.lines = this.add.graphics().setDepth(-4);
    this.makeTextures();
    this.createLabels();
    this.radiusLabel = this.add
      .text(0, 0, 'Earth radius 6,371 km', { fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#ffffff', stroke: '#000000', strokeThickness: 3, resolution: 2 })
      .setOrigin(0, 0.5)
      .setDepth(-2)
      .setVisible(false);
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
    else if (this.following && this.view.mPerPx > FOLLOW_MAX_M_PER_PX) this.following = null;
    else if (this.following) this.setView({ x: this.following.inst.x, elevM: this.following.inst.elevM });
    else if (!this.drag && (Math.abs(this.vel.x) > 1 || Math.abs(this.vel.y) > 1)) {
      this.setView({ x: this.view.x - this.vel.x * dt * this.view.mPerPx, elevM: this.view.elevM + this.vel.y * dt * this.view.mPerPx });
      const damp = Math.pow(0.02, dt);
      this.vel = { x: this.vel.x * damp, y: this.vel.y * damp };
    }

    if (!this.paused) this.moveCritters(dt);
    this.render();

    if (this.scale.width !== this.labelLayoutW) this.layoutLabels(this.scale.width);
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
    const base = this.fly ? this.fly.target() : this.getView();
    const follow = this.following;
    this.cancelMotion();
    this.following = follow;
    const zoomed = zoomAbout(base, factor, this.size);
    this.startFly(() => (follow ? clampView({ ...zoomed, x: this.view.x + wrapDx(follow.inst.x - this.view.x), elevM: follow.inst.elevM }) : zoomed));
  }

  /** Show a mountain's side profile in the world (true width, schematic shape) and fly to frame it; null hides it. */
  setMountain(id: string | null, frame = true): void {
    this.mountain = id ? (MOUNTAINS.find((m) => m.id === id) ?? null) : null;
    this.hooks.onMountain?.(this.mountain?.id ?? null);
    if (this.mountain && frame) {
      const f = frameView(this.mountain, this.size);
      this.flyTo({ x: f.x, elevM: f.elevM, mPerPx: f.mPerPx });
    }
  }

  /** Where the shown mountain is on screen (used by tests). */
  mountainInfo(): { id: string; widthPx: number; heightPx: number; summit: { x: number; y: number }; footLeft: { x: number; y: number }; footRight: { x: number; y: number } } | null {
    const m = this.mountain;
    if (!m) return null;
    const W = m.halfWidthKm * 1000;
    const at = (s: number, e: number) => worldToScreen(this.view, this.size, s, e);
    const summit = at(axisM(m), m.summitM);
    const footLeft = at(axisM(m) - W, m.baseM);
    const footRight = at(axisM(m) + W, m.baseM);
    return { id: m.id, widthPx: footRight.x - footLeft.x, heightPx: footLeft.y - summit.y, summit, footLeft, footRight };
  }

  /** Fly to a height on the world's axis at the opening zoom (used by the mountain profiles). */
  flyToElevation(elevM: number): void {
    this.flyTo({ x: 0, elevM, mPerPx: defaultMPerPx(this.size) });
  }

  /** Fly out until the whole planet is on screen, centred on its middle. */
  showWholeEarth(): void {
    this.flyTo({ x: 0, elevM: -EARTH_RADIUS_M, mPerPx: wholeEarthMPerPx(this.size) });
  }

  /** How the Earth is currently drawn (used by tests). */
  earthInfo(): EarthGeometry & { drawMs: number } {
    return { ...earthGeometry(this.view, this.size), drawMs: this.drawMs };
  }

  /** Fly back to the largest thing nearby and frame it: the way out after zooming in on something small. */
  focusLargestNearby(): string | null {
    const pick = pickLargestNearby(
      this.critters.map((c) => ({ key: c.key, lengthM: c.species.lengthM, elevM: c.inst.elevM, x: c.inst.x })),
      this.view,
    );
    if (!pick) return null;
    this.focusOn(pick.key);
    return pick.key;
  }

  /** Fly to the nearest one of a species (used by the collection book) and focus it. */
  focusSpecies(speciesId: string): string | null {
    const pick = pickNearest(
      this.critters.filter((c) => c.species.id === speciesId).map((c) => ({ key: c.key, elevM: c.inst.elevM, x: c.inst.x })),
      this.view,
    );
    if (!pick) return null;
    this.focusOn(pick.key);
    return pick.key;
  }

  /** Names currently drawn on screen, with page coordinates (used by tests). */
  visibleLabels(): Array<{ key: string; text: string; x: number; y: number }> {
    const rect = this.game.canvas.getBoundingClientRect();
    return this.critters.filter((c) => c.label.visible).map((c) => ({ key: c.key, text: c.label.text, x: rect.left + c.label.x, y: rect.top + c.label.y }));
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
      if (c.species.id !== speciesId || c.hidden) continue;
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
    const distM = Math.hypot(to.x - from.x, to.elevM - from.elevM);
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
      x: f.from.x + (to.x - f.from.x) * s,
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
    if (c.hidden) this.setMountain(null, false); // it lives inside the rock: take the mountain away so it can be seen
    this.cancelMotion();
    this.following = c;
    const wanted = focusMPerPx(c.species.lengthM, this.size);
    // Already about the right size on screen: keep the zoom, just centre and discover.
    // Much too big (we are zoomed in on something tiny) or too small: change the zoom to frame it.
    const ratio = sizeInPx(c.species.lengthM, this.view.mPerPx) / focusPx(this.size);
    const keep = ratio >= 0.6 && ratio <= 2;
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
      if (c.hidden) continue;
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
    const t0 = performance.now();
    this.drawBackground(w, h);
    this.drawMountain(w, h);
    this.drawMarkers(w, h);
    this.drawMs = this.drawMs * 0.9 + (performance.now() - t0) * 0.1;

    for (const c of this.critters) {
      c.sx = xToScreenX(v, c.inst.x, w);
      c.sy = elevToScreenY(v, c.inst.elevM, h);
      c.hidden = this.mountain !== null && insideSolid(this.mountain, v.x + wrapDx(c.inst.x - v.x), c.inst.elevM);
      c.sizePx = sizeInPx(c.species.lengthM, v.mPerPx);
      c.mode = renderMode(c.sizePx);
      const margin = Math.max(c.sizePx, DOT_PX * 3);
      const visible = !c.hidden && c.sx > -margin && c.sx < w + margin && c.sy > -margin && c.sy < h + margin;
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
    this.placeLabels(w, h);
    this.snow?.setVisible(v.elevM < -60);
  }

  /** Name tags under circles and small silhouettes; bigger things win when tags would overlap. */
  private placeLabels(w: number, h: number): void {
    const bigPx = Math.min(w, h) * LABEL_MAX_FRACTION;
    const placed: Array<{ x0: number; x1: number; y0: number; y1: number }> = [];
    const shown = this.critters
      .filter((c) => SHOW_NAMES && this.view.mPerPx <= LABEL_MAX_M_PER_PX && (c.sprite.visible || c.dot.visible) && c.sizePx < bigPx)
      .sort((a, b) => b.species.lengthM - a.species.lengthM);
    const keep = new Set<Critter>();
    for (const c of shown) {
      const half = c.label.width / 2;
      const below = c.mode === 'dot' ? DOT_PX / 2 + 8 : ((SILHOUETTE_BOUNDS[c.species.silhouette].height / SILHOUETTE_BOUNDS[c.species.silhouette].longest) * c.sizePx) / 2 + 4;
      const y0 = c.sy + below;
      const box = { x0: c.sx - half, x1: c.sx + half, y0, y1: y0 + LABEL_H };
      const onScreen = box.x1 > 0 && box.x0 < w && box.y1 > 0 && box.y0 < h;
      if (!onScreen || placed.some((p) => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0)) continue;
      placed.push(box);
      keep.add(c);
      c.label.setPosition(c.sx, y0);
    }
    for (const c of this.critters) c.label.setVisible(keep.has(c));
  }

  /** Sky, sea and Earth's insides as one gradient on a canvas, repainted only when the view changes. */
  private drawBackground(w: number, h: number): void {
    const geo = earthGeometry(this.view, this.size);
    this.geo = geo;
    const key = `${this.lastView}`;
    if (key === this.bgKey && this.bgTex.width === w && this.bgTex.height === h) return;
    this.bgKey = key;
    if (this.bgTex.width !== w || this.bgTex.height !== h) {
      this.bgTex.setSize(w, h);
      this.bgImage.setTexture('bg').setDisplaySize(w, h);
    }
    const spec = backgroundGradient(this.view, this.size, geo);
    const ctx = this.bgTex.context;
    const grad = spec.kind === 'radial' ? ctx.createRadialGradient(spec.cx, spec.cy, 0, spec.cx, spec.cy, spec.r) : ctx.createLinearGradient(0, 0, 0, h);
    for (const s of spec.stops) grad.addColorStop(s.t, `#${s.color.toString(16).padStart(6, '0')}`);
    ctx.fillStyle = `#${(spec.stops[spec.stops.length - 1]?.color ?? 0).toString(16).padStart(6, '0')}`;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    this.bgTex.refresh();
  }

  /** The mountain's side profile on the round Earth, clipped to the screen. Heights are sourced, the flank curve is schematic. */
  private drawMountain(w: number, h: number): void {
    const g = this.mtnGfx;
    g.clear();
    this.reserved = [];
    const m = this.mountain;
    if (!m) {
      this.mtnLabel.setVisible(false);
      return;
    }
    const v = this.view;
    const size = this.size;
    const W = m.halfWidthKm * 1000;
    const axis = axisM(m);
    const rect: Rect = { x0: -40, y0: -40, x1: w + 40, y1: h + 40 };
    const halfVis = w * 0.65 * v.mPerPx;
    const range = (half: number): [number, number] | null => {
      const lo = Math.max(v.x - halfVis, axis - half);
      const hi = Math.min(v.x + halfVis, axis + half);
      return lo < hi ? [lo, hi] : null;
    };
    const pt = (s: number, e: number) => worldToScreen(v, size, s, e);
    const line = (a: number, b: number, n: number, elev: (s: number) => number) => Array.from({ length: n + 1 }, (_, i) => {
      const s = a + ((b - a) * i) / n;
      return pt(s, elev(s));
    });
    const fill = (poly: Array<{ x: number; y: number }>, color: number) => {
      const clipped = clipPolygon(poly, rect);
      if (clipped.length >= 3) g.fillStyle(color, 1).fillPoints(clipped, true);
    };

    const plat = range(PLATFORM_HALF_WIDTHS * W);
    if (plat) {
      const top = line(plat[0], plat[1], 48, () => m.baseM);
      fill([...top, pt(plat[1], m.baseM - 20000), pt(plat[0], m.baseM - 20000)], 0x4a2e1a);
    }
    const body = range(W);
    if (body) {
      const profile = (s: number) => profileElevation(m, Math.abs(s - axis) / 1000);
      const bottom = line(body[0], body[1], 48, () => m.baseM);
      const top = line(body[1], body[0], 160, profile);
      fill([...bottom, ...top], hexToInt(m.color));
      g.lineStyle(2, 0xffffff, 0.85);
      for (let i = 0; i + 1 < top.length; i++) {
        const seg = clipSegment(top[i], top[i + 1], rect);
        if (seg) g.lineBetween(seg[0].x, seg[0].y, seg[1].x, seg[1].y);
      }
    }

    const sp = pt(axis, m.summitM);
    const show = sp.x > 20 && sp.x < w - 20 && sp.y > 30 && sp.y < h - 10;
    this.mtnLabel.setVisible(show);
    if (show) {
      const narrow = w < 500;
      this.mtnLabel.setWordWrapWidth(Math.max(120, w - 60), true);
      this.mtnLabel.setFontSize(narrow ? 12 : 13);
      this.mtnLabel.setText(narrow ? `${m.name} · ${nfm(m.summitM)} m\n${fullWidthKm(m).toFixed(1)} km wide (approx.)` : `${m.name} · ${nfm(m.summitM)} m\nwidth about ${fullWidthKm(m).toFixed(1)} km (approx.), shape schematic`);
      this.mtnLabel.setPosition(sp.x, sp.y - 6);
      const tw = this.mtnLabel.width;
      const th = this.mtnLabel.height;
      this.reserved.push({ x0: sp.x - tw / 2, x1: sp.x + tw / 2, y0: sp.y - 6 - th, y1: sp.y - 6 });
    }
  }

  /** Landmark lines (gold) and zone edges (white), curved like the planet; labels that would overlap are hidden, landmarks first. */
  private drawMarkers(w: number, h: number): void {
    const g = this.lines;
    g.clear();
    const geo = this.geo ?? earthGeometry(this.view, this.size);
    const taken: Array<{ x0: number; x1: number; y0: number; y1: number }> = [...this.reserved];
    if (this.mountain) taken.push({ x0: 0, x1: w, y0: 104, y1: 162 }); // the profile buttons sit here
    const ordered = [...this.labels].sort((a, b) => Number(b.landmark) - Number(a.landmark));
    for (const m of ordered) {
      const topY = elevToScreenY(this.view, m.elevM, h);
      const rho = (EARTH_RADIUS_M + m.elevM) / this.view.mPerPx;
      const wholeCircle = geo.mode === 'circle';
      const lineY = (x: number) => contourY(this.view, this.size, geo, m.elevM, x);
      // The label sits at the right edge, or on top of the circle when the circle is narrower than the screen.
      const atRight = !wholeCircle || Math.abs(w - 8 - geo.cx) < rho;
      const labelX = atRight ? w - 8 : geo.cx;
      const labelY = wholeCircle ? (atRight ? geo.cy - Math.sqrt(Math.max(0, rho * rho - (labelX - geo.cx) ** 2)) : geo.cy - rho) : lineY(labelX);
      const onScreen = labelY > -4 && labelY < h + 4 && labelX > -4 && labelX < w + 4;
      g.lineStyle(m.landmark ? 2 : 1, m.landmark ? 0xffe08a : 0xffffff, m.landmark ? 0.7 : 0.35);
      if (wholeCircle) {
        if (rho > 1) g.strokePoints(circlePoints(geo.cx, geo.cy, rho), true);
      } else if (topY > -h && topY < 2 * h) {
        const pts: Phaser.Types.Math.Vector2Like[] = [];
        const steps = geo.mode === 'flat' ? 1 : ARC_STEPS;
        for (let i = 0; i <= steps; i++) {
          const x = (w * i) / steps;
          pts.push({ x, y: lineY(x) });
        }
        g.strokePoints(pts, false);
      }
      const tw = m.text.width;
      const box = { x0: atRight ? labelX - tw : labelX - tw / 2, x1: atRight ? labelX : labelX + tw / 2, y0: labelY - 3 - m.text.height, y1: labelY - 3 };
      const clash = taken.some((t) => box.x0 < t.x1 + 4 && box.x1 > t.x0 - 4 && box.y0 < t.y1 + 4 && box.y1 > t.y0 - 4);
      const free = onScreen && !clash;
      m.text.setVisible(free);
      if (free) {
        taken.push(box);
        m.text.setOrigin(atRight ? 1 : 0.5, 1).setPosition(labelX, labelY - 3);
      }
    }
    this.drawRadius(geo);
  }

  /** When the whole planet is on screen: a line from its centre to the surface, labelled with the radius. */
  private drawRadius(geo: EarthGeometry): void {
    const { w, h } = this.size;
    const show = geo.mode === 'circle' && geo.seaPx >= 36 && geo.cx > 0 && geo.cx < w && geo.cy > 0 && geo.cy < h;
    this.radiusLabel.setVisible(show);
    if (!show) return;
    const g = this.lines;
    g.lineStyle(2, 0xffffff, 0.9);
    g.lineBetween(geo.cx, geo.cy, geo.cx, geo.cy - geo.seaPx);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(geo.cx, geo.cy, 3);
    const roomRight = w - (geo.cx + 12);
    const flip = roomRight < this.radiusLabel.width;
    this.radiusLabel.setOrigin(flip ? 1 : 0, 0.5).setPosition(geo.cx + (flip ? -8 : 8), geo.cy - geo.seaPx / 2);
  }

  /** Level labels shrink and wrap on narrow screens so they never run off the edge. */
  private layoutLabels(w: number): void {
    this.labelLayoutW = w;
    this.radiusLabel.setText(w < 500 ? 'Earth radius\n6,371 km' : 'Earth radius 6,371 km');
    const wrap = Math.max(120, w - 76);
    for (const m of this.labels) {
      m.text.setFontSize(Math.round(clamp(w / (m.landmark ? 24 : 27), 11, m.landmark ? 15 : 13)));
      m.text.setWordWrapWidth(wrap, true);
    }
  }

  private createLabels(): void {
    for (const m of buildMarkers()) {
      const landmark = m.kind === 'landmark';
      const text = this.add
        .text(0, 0, m.elevM === 0 ? m.label : `${m.label} · ${formatElevation(m.elevM)}`, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: landmark ? '15px' : '13px',
          color: landmark ? '#ffe08a' : '#ffffff',
          stroke: '#000000',
          strokeThickness: 3,
          resolution: 2,
        })
        .setOrigin(1, 1)
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
        const label = this.add
          .text(0, 0, sp.name, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '13px',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 3,
            resolution: 2,
          })
          .setOrigin(0.5, 0)
          .setDepth(2)
          .setVisible(false);
        const c: Critter = {
          key: `${sp.id}#${i}`,
          species: sp,
          inst,
          label,
          sprite,
          dot,
          halo,
          phase: 0,
          hidden: false,
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
