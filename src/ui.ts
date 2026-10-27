import { SPECIES, Species } from './game/species';
import { Progress } from './game/progress';
import { formatElevation, formatLength, formatRange, niceScale } from './game/format';
import { zoneAt } from './game/zones';
import { Size, View } from './game/world';
import { Minimap } from './minimap';
import type { CritterPoint } from './game/DiveScene';

export interface UiHooks {
  jumpTo(elevM: number): void;
  scrubTo(elevM: number): void;
  focus(key: string): void;
  zoomBy(factor: number): void;
  /** Fly back to the largest object near the camera. */
  fitLargest(): void;
  /** Fly out to see the whole planet. */
  showEarth(): void;
  /** Fly to the nearest one of a species and focus it. */
  focusSpecies(speciesId: string): void;
}

export interface UiControls {
  setView(v: View, size: Size): void;
  setPoints(p: CritterPoint[]): void;
  showCard(sp: Species, isNew: boolean): void;
  refresh(): void;
  minimap: Minimap;
}

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const SCALE_MAX_PX = 110;

export function createUi(progress: Progress, hooks: UiHooks): UiControls {
  const depth = el('depth');
  const zone = el('zone');
  const bookBtn = el<HTMLButtonElement>('book-btn');
  const card = el('card');
  const book = el('book');
  const grid = el('book-grid');
  const scaleLine = el('scalebar-line');
  const scaleLabel = el('scalebar-label');
  const hint = el('hint');
  const minimap = new Minimap(el<HTMLCanvasElement>('minimap-canvas'), hooks);
  let hideTimer: number | undefined;
  let points: CritterPoint[] = [];

  const dismissHint = () => (hint.hidden = true);
  for (const ev of ['pointerdown', 'wheel', 'keydown']) window.addEventListener(ev, dismissHint, { once: true, passive: true });

  el('zoom-in').addEventListener('click', () => hooks.zoomBy(0.5));
  el('zoom-out').addEventListener('click', () => hooks.zoomBy(2));
  el('zoom-fit').addEventListener('click', () => hooks.fitLargest());
  el('zoom-earth').addEventListener('click', () => hooks.showEarth());

  const sorted = [...SPECIES].sort((a, b) => b.maxM - a.maxM);

  function refresh(): void {
    bookBtn.textContent = `Book ${progress.list().length}/${SPECIES.length}`;
    grid.replaceChildren(
      ...sorted.map((sp) => {
        const found = progress.has(sp.id);
        const item = document.createElement('button');
        item.type = 'button';
        item.title = found ? `Fly to the nearest ${sp.name}` : 'Fly to the nearest one';
        item.addEventListener('click', () => {
          book.hidden = true;
          hooks.focusSpecies(sp.id);
        });
        item.className = 'entry' + (found ? ' found' : '');
        item.dataset.id = sp.id;
        const icon = document.createElement('div');
        icon.className = 'icon';
        const url = `url(silhouettes/${sp.silhouette})`;
        icon.style.setProperty('mask-image', url);
        icon.style.setProperty('-webkit-mask-image', url);
        icon.style.backgroundColor = found ? sp.color : '#3a4a5c';
        const name = document.createElement('div');
        name.className = 'name';
        name.textContent = found ? sp.name : '???';
        const range = document.createElement('div');
        range.className = 'range';
        range.textContent = found ? `${formatRange(sp.minM, sp.maxM)} · ${formatLength(sp.lengthM)}` : '';
        item.append(icon, name, range);
        return item;
      }),
    );
    points = points.map((p) => ({ ...p, found: progress.has(p.speciesId) }));
    minimap.setPoints(points);
  }

  bookBtn.addEventListener('click', () => {
    refresh();
    book.hidden = !book.hidden;
  });
  el('book-close').addEventListener('click', () => (book.hidden = true));

  refresh();

  return {
    minimap,
    setView(v, size) {
      depth.textContent = formatElevation(v.elevM);
      zone.textContent = zoneAt(v.elevM).name;
      const s = niceScale(v.mPerPx, SCALE_MAX_PX);
      scaleLine.style.width = `${s.px}px`;
      scaleLabel.textContent = s.label;
      minimap.setView(v, size);
    },
    setPoints(p) {
      points = p;
      minimap.setPoints(p);
    },
    showCard(sp, isNew) {
      el('card-badge').textContent = isNew ? 'New discovery' : 'Seen before';
      el('card-name').textContent = sp.name;
      el('card-range').textContent = `${formatRange(sp.minM, sp.maxM)} · ${formatLength(sp.lengthM)} long`;
      el('card-fact').textContent = sp.fact;
      card.hidden = false;
      hint.hidden = true;
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => (card.hidden = true), 6000);
      refresh();
    },
    refresh,
  };
}
