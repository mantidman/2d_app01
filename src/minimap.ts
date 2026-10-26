import { backgroundColorAt } from './game/zones';
import { LANDMARKS } from './game/markers';
import { elevToFrac, fracToElev } from './game/minimap-math';
import { Size, View, screenYToElev } from './game/world';
import type { CritterPoint } from './game/DiveScene';

export interface MinimapHooks {
  /** Fly the camera to an elevation (keeps the current zoom). */
  jumpTo(elevM: number): void;
  /** Drag along the strip: follow the pointer instantly. */
  scrubTo(elevM: number): void;
  /** Clicked right on a creature's dot: fly to it and zoom in. */
  focus(key: string): void;
}

const PAD = 8;
const DOT_HIT_PX = 9;
const STRIP_X = 50;
const DRAG_SLOP = 4;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Always-visible overview strip: where you are, what is around, click or drag to travel. */
export class Minimap {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private points: CritterPoint[] = [];
  private view: View | null = null;
  private viewH = 960;
  private raf = 0;
  private pointer: { startY: number; moved: boolean } | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private hooks: MinimapHooks,
  ) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(canvas);
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', () => (this.pointer = null));
    this.resize();
  }

  setView(v: View, size: Size): void {
    this.view = v;
    this.viewH = size.h;
    this.invalidate();
  }

  setPoints(p: CritterPoint[]): void {
    this.points = p;
    this.invalidate();
  }

  /** CSS-pixel page coordinates of a creature's dot (used by tests). */
  pointOf(key: string): { x: number; y: number } | null {
    const p = this.points.find((q) => q.key === key);
    if (!p) return null;
    const rect = this.canvas.getBoundingClientRect();
    const { x, y } = this.dotPos(p);
    return { x: rect.left + x, y: rect.top + y };
  }

  /** CSS-pixel page coordinates for an elevation on the strip. */
  pointAtElev(elevM: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: rect.left + STRIP_X + (this.w - STRIP_X) / 2, y: rect.top + this.yOf(elevToFrac(elevM)) };
  }

  private yOf(frac: number): number {
    return PAD + frac * (this.h - 2 * PAD);
  }

  private fracOf(y: number): number {
    return Math.min(1, Math.max(0, (y - PAD) / (this.h - 2 * PAD)));
  }

  private dotPos(p: CritterPoint): { x: number; y: number } {
    return { x: STRIP_X + 6 + (hash(p.key) % Math.max(1, this.w - STRIP_X - 12)), y: this.yOf(elevToFrac(p.elevM)) };
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.invalidate();
  }

  private invalidate(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.draw();
    });
  }

  private local(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private down(e: PointerEvent): void {
    this.canvas.setPointerCapture(e.pointerId);
    this.pointer = { startY: this.local(e).y, moved: false };
  }

  private move(e: PointerEvent): void {
    if (!this.pointer) return;
    const { y } = this.local(e);
    if (!this.pointer.moved && Math.abs(y - this.pointer.startY) < DRAG_SLOP) return;
    this.pointer.moved = true;
    this.hooks.scrubTo(fracToElev(this.fracOf(y)));
  }

  private up(e: PointerEvent): void {
    const p = this.pointer;
    this.pointer = null;
    if (!p || p.moved) return;
    const { x, y } = this.local(e);
    let best: CritterPoint | null = null;
    let bestD = DOT_HIT_PX;
    for (const c of this.points) {
      const pos = this.dotPos(c);
      const d = Math.hypot(pos.x - x, pos.y - y);
      if (d < bestD) {
        best = c;
        bestD = d;
      }
    }
    if (best) this.hooks.focus(best.key);
    else this.hooks.jumpTo(fracToElev(this.fracOf(y)));
  }

  private draw(): void {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    const top = PAD;
    const bottom = h - PAD;
    const sw = w - STRIP_X;

    for (let y = top; y < bottom; y += 2) {
      const c = backgroundColorAt(fracToElev((y - top) / (bottom - top)));
      ctx.fillStyle = `#${c.toString(16).padStart(6, '0')}`;
      ctx.fillRect(STRIP_X, y, sw, 2);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.strokeRect(STRIP_X + 0.5, top + 0.5, sw - 1, bottom - top - 1);

    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const l of LANDMARKS) {
      const y = this.yOf(elevToFrac(l.elevM));
      ctx.fillStyle = '#ffe08a';
      ctx.fillRect(STRIP_X - 5, y - 0.5, sw + 5, 1);
      if (l.short) ctx.fillText(l.short, STRIP_X - 8, y);
    }

    for (const p of this.points) {
      const { x, y } = this.dotPos(p);
      ctx.fillStyle = p.found ? p.color : 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(x, y, p.found ? 3 : 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.view) {
      const topM = screenYToElev(this.view, 0, this.viewH);
      const botM = screenYToElev(this.view, this.viewH, this.viewH);
      const y1 = this.yOf(elevToFrac(topM));
      const y2 = this.yOf(elevToFrac(botM));
      const hh = Math.max(4, y2 - y1);
      const cy = this.yOf(elevToFrac(this.view.elevM));
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(STRIP_X - 6, cy - hh / 2, sw + 6, hh);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(STRIP_X - 5.25, cy - hh / 2 + 0.75, sw + 4.5, hh - 1.5);
      ctx.lineWidth = 1;
    }
  }
}
