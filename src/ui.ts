import { SPECIES, Species } from './game/species';
import { Progress } from './game/progress';
import { formatElevation, formatRange } from './game/format';
import { zoneAt } from './game/zones';
import { WORLD_H, elevToY, yToElev } from './game/world';

export interface UiControls {
  update(elevM: number): void;
  showCard(sp: Species, isNew: boolean): void;
  refresh(): void;
  onSlider(cb: (m: number) => void): void;
}

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function createUi(progress: Progress): UiControls {
  const depth = el('depth');
  const zone = el('zone');
  const bookBtn = el<HTMLButtonElement>('book-btn');
  const slider = el<HTMLInputElement>('slider');
  const card = el('card');
  const book = el('book');
  const grid = el('book-grid');
  let sliderCb: (m: number) => void = () => {};
  let hideTimer: number | undefined;

  // The slider works in world pixels (top = highest) so every zone gets its fair share of the track.
  slider.min = '0';
  slider.max = String(WORLD_H);
  slider.addEventListener('input', () => sliderCb(yToElev(WORLD_H - Number(slider.value))));

  const sorted = [...SPECIES].sort((a, b) => b.maxM - a.maxM);

  function refresh(): void {
    bookBtn.textContent = `Book ${progress.list().length}/${SPECIES.length}`;
    grid.replaceChildren(
      ...sorted.map((sp) => {
        const found = progress.has(sp.id);
        const item = document.createElement('div');
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
        range.textContent = found ? formatRange(sp.minM, sp.maxM) : '';
        item.append(icon, name, range);
        return item;
      }),
    );
  }

  bookBtn.addEventListener('click', () => {
    refresh();
    book.hidden = !book.hidden;
  });
  el('book-close').addEventListener('click', () => (book.hidden = true));

  refresh();

  return {
    update(elevM) {
      depth.textContent = formatElevation(elevM);
      zone.textContent = zoneAt(elevM).name;
      if (document.activeElement !== slider) slider.value = String(Math.round(WORLD_H - elevToY(elevM)));
    },
    showCard(sp, isNew) {
      el('card-badge').textContent = isNew ? 'New discovery' : 'Seen before';
      el('card-name').textContent = sp.name;
      el('card-range').textContent = formatRange(sp.minM, sp.maxM);
      el('card-fact').textContent = sp.fact;
      card.hidden = false;
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => (card.hidden = true), 6000);
      refresh();
    },
    refresh,
    onSlider(cb) {
      sliderCb = cb;
    },
  };
}
