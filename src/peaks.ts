import { MEASURES, MOUNTAINS, Measure, Mountain, heightBy, profileElevation, rankBy, shoreDistanceKm, summitDifferenceM } from './game/mountains';

export interface PeaksHooks {
  /** Close the panel and fly the world view to this elevation. */
  flyToElevation(elevM: number): void;
}

const nf = new Intl.NumberFormat('en-US');
const fmt = (m: number) => `${nf.format(Math.round(m))} m`;

const TOP_M = 12000; // headroom above Everest for its label
const BOTTOM_M = -13600;
const AXIS_W = 46;
const SKY = '#bfe6f8';
const SEA = '#1d6fa0';
const GROUND = '#4a2e1a';

/** Panel that compares the height of Everest, Mauna Kea and Mauna Loa on one true vertical scale. */
export function createPeaks(hooks: PeaksHooks): { open(): void; close(): void; measure(): Measure } {
  const root = document.getElementById('peaks')!;
  const canvas = document.getElementById('peaks-canvas') as HTMLCanvasElement;
  const rankEl = document.getElementById('peaks-rank')!;
  const blurb = document.getElementById('peaks-blurb')!;
  const cards = document.getElementById('peaks-cards')!;
  const tabs = document.getElementById('peaks-measures')!;
  let measure: Measure = 'above-sea';

  for (const m of MEASURES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.measure = m.id;
    b.textContent = m.label;
    b.addEventListener('click', () => {
      measure = m.id;
      render();
    });
    tabs.append(b);
  }

  for (const m of MOUNTAINS) cards.append(buildCard(m));

  function buildCard(m: Mountain): HTMLElement {
    const el = document.createElement('article');
    el.className = 'peak-card';
    el.dataset.id = m.id;
    const h = document.createElement('h2');
    h.textContent = m.name;
    const stats = document.createElement('ul');
    const rows: string[] = [
      `Summit: ${fmt(m.summitM)} above sea level${m.summitNote ? ` (${m.summitNote})` : ''}`,
      `Base: ${m.baseM < 0 ? `${fmt(-m.baseM)} below sea level` : `${fmt(m.baseM)} above sea level`}, so ${fmt(m.summitM - m.baseM)} base to summit`,
    ];
    if (m.depressionM !== null) rows.push(`Presses the crust down about ${fmt(m.depressionM)}, about ${fmt(m.summitM - m.baseM + m.depressionM)} in all`);
    if (m.volumeKm3 !== null) rows.push(`Volume: at least ${nf.format(m.volumeKm3)} cubic km`);
    for (const r of rows) {
      const li = document.createElement('li');
      li.textContent = r;
      stats.append(li);
    }
    const fact = document.createElement('p');
    fact.textContent = m.fact;
    const note = document.createElement('p');
    note.className = 'peak-note';
    note.textContent = m.baseNote;
    const fly = document.createElement('button');
    fly.type = 'button';
    fly.dataset.fly = m.id;
    fly.textContent = `Fly to the summit (${fmt(m.summitM)})`;
    fly.addEventListener('click', () => {
      close();
      hooks.flyToElevation(m.summitM);
    });
    const src = document.createElement('p');
    src.className = 'peak-sources';
    src.append('Sources: ');
    m.sources.forEach((u, i) => {
      const a = document.createElement('a');
      a.href = u;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = new URL(u).hostname.replace(/^www\./, '');
      src.append(i ? ', ' : '', a);
    });
    el.append(h, stats, fact, note, fly, src);
    return el;
  }

  function render(): void {
    for (const b of tabs.querySelectorAll<HTMLButtonElement>('button')) b.setAttribute('aria-pressed', String(b.dataset.measure === measure));
    blurb.textContent = MEASURES.find((m) => m.id === measure)!.blurb;
    const ranking = rankBy(measure);
    rankEl.replaceChildren(
      ...ranking.map((r, i) => {
        const li = document.createElement('li');
        li.dataset.id = r.mountain.id;
        li.className = i === 0 ? 'winner' : '';
        li.textContent = `${i + 1}. ${r.mountain.name}: ${fmt(r.heightM)}${i === 0 ? '  (tallest by this measure)' : ''}`;
        return li;
      }),
    );
    if (ranking.length < MOUNTAINS.length) {
      const li = document.createElement('li');
      li.className = 'peak-note';
      li.textContent = 'No sourced figure for the others.';
      rankEl.append(li);
    }
    const kea = MOUNTAINS.find((m) => m.id === 'mauna-kea');
    const loa = MOUNTAINS.find((m) => m.id === 'mauna-loa');
    if (kea && loa && measure === 'above-sea') {
      const li = document.createElement('li');
      li.className = 'peak-note';
      li.textContent = `Mauna Kea's summit is only ${fmt(summitDifferenceM(kea, loa))} higher than Mauna Loa's; Mauna Loa is far bigger by volume.`;
      rankEl.append(li);
    }
    cards.querySelectorAll<HTMLElement>('.peak-card').forEach((c) => c.classList.toggle('winner', c.dataset.id === ranking[0]?.mountain.id));
    draw();
  }

  function draw(): void {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(240, rect.width);
    const h = Math.max(260, rect.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const y = (elev: number) => ((TOP_M - elev) / (TOP_M - BOTTOM_M)) * (h - 26) + 6;
    const slotW = (w - AXIS_W) / MOUNTAINS.length;
    const winner = rankBy(measure)[0]?.mountain.id;

    ctx.font = '11px system-ui, sans-serif';
    for (let e = -12000; e <= 8000; e += 2000) {
      ctx.strokeStyle = e === 0 ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.12)';
      ctx.setLineDash(e === 0 ? [6, 4] : []);
      ctx.beginPath();
      ctx.moveTo(AXIS_W - 6, y(e));
      ctx.lineTo(w, y(e));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = e === 0 ? '#ffffff' : '#9db4c8';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(e === 0 ? '0 m' : `${e / 1000} km`, AXIS_W - 8, y(e));
    }

    MOUNTAINS.forEach((m, i) => {
      const x0 = AXIS_W + i * slotW;
      const cx = x0 + slotW / 2;
      const half = slotW * 0.46;
      const px = (km: number) => cx + (km / m.halfWidthKm) * half;
      const seaFloor = m.baseM < 0;

      // sky, sea, ground
      ctx.fillStyle = SKY;
      ctx.fillRect(x0 + 2, y(TOP_M), slotW - 4, y(Math.max(0, m.baseM)) - y(TOP_M));
      if (seaFloor) {
        ctx.fillStyle = SEA;
        ctx.fillRect(x0 + 2, y(0), slotW - 4, y(m.baseM) - y(0));
      }
      ctx.fillStyle = GROUND;
      ctx.fillRect(x0 + 2, y(m.baseM), slotW - 4, y(BOTTOM_M) - y(m.baseM));

      // crust pressed down under the volcano (dashed bowl)
      if (m.depressionM !== null) {
        ctx.beginPath();
        ctx.moveTo(px(-m.halfWidthKm), y(m.baseM));
        for (let k = -m.halfWidthKm; k <= m.halfWidthKm; k += m.halfWidthKm / 20) {
          const u = k / m.halfWidthKm;
          ctx.lineTo(px(k), y(m.baseM - m.depressionM * (1 - u * u)));
        }
        ctx.lineTo(px(m.halfWidthKm), y(m.baseM));
        ctx.closePath();
        ctx.fillStyle = 'rgba(224,86,28,0.35)';
        ctx.fill();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = '#ffb08a';
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // the mountain
      ctx.beginPath();
      ctx.moveTo(px(-m.halfWidthKm), y(m.baseM));
      for (let k = -m.halfWidthKm; k <= m.halfWidthKm; k += m.halfWidthKm / 40) ctx.lineTo(px(k), y(profileElevation(m, k)));
      ctx.lineTo(px(m.halfWidthKm), y(m.baseM));
      ctx.closePath();
      ctx.fillStyle = m.color;
      ctx.fill();
      ctx.lineWidth = m.id === winner ? 3 : 1;
      ctx.strokeStyle = m.id === winner ? '#ffe08a' : 'rgba(0,0,0,0.5)';
      ctx.stroke();
      ctx.lineWidth = 1;

      // shore mark where the volcano meets the waves
      const shore = shoreDistanceKm(m);
      if (shore !== null) {
        ctx.fillStyle = '#ffffff';
        for (const s of [-shore, shore]) ctx.fillRect(px(s) - 1.5, y(0) - 1.5, 3, 3);
      }

      // bracket for the chosen measure, drawn beside the summit
      const total = heightBy(m, measure);
      const bx = cx + half * 0.28;
      if (total !== null) {
        const lowElev = measure === 'above-sea' ? 0 : measure === 'base-to-summit' ? m.baseM : m.baseM - (m.depressionM ?? 0);
        ctx.strokeStyle = '#ffe08a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bx, y(m.summitM));
        ctx.lineTo(bx, y(lowElev));
        ctx.moveTo(bx - 4, y(m.summitM));
        ctx.lineTo(bx + 4, y(m.summitM));
        ctx.moveTo(bx - 4, y(lowElev));
        ctx.lineTo(bx + 4, y(lowElev));
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.save();
        ctx.translate(bx + 8, (y(m.summitM) + y(lowElev)) / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#000000';
        ctx.strokeText(fmt(total), 0, -2);
        ctx.fillStyle = '#ffe08a';
        ctx.fillText(fmt(total), 0, -2);
        ctx.restore();
      }

      // names and summit heights
      // (always above the summit, i.e. on the pale sky, so dark text)
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillStyle = '#0b1a2c';
      ctx.fillText(m.name, cx, y(m.summitM) - 16);
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillStyle = '#1d3a5a';
      ctx.fillText(fmt(m.summitM), cx, y(m.summitM) - 3);
    });
  }

  function open(): void {
    root.hidden = false;
    render();
  }
  function close(): void {
    root.hidden = true;
  }

  document.getElementById('peaks-btn')!.addEventListener('click', open);
  document.getElementById('peaks-close')!.addEventListener('click', close);
  window.addEventListener('resize', () => {
    if (!root.hidden) draw();
  });

  return { open, close, measure: () => measure };
}
