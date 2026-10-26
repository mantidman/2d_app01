const nf = new Intl.NumberFormat('en-US');
const KM_FROM_M = 20000;

function unit(m: number): { n: string; u: 'm' | 'km' } {
  const a = Math.abs(Math.round(m));
  return m >= KM_FROM_M ? { n: nf.format(Math.round(m / 1000)), u: 'km' } : { n: nf.format(a), u: 'm' };
}

export function formatElevation(m: number): string {
  const r = Math.round(m);
  if (r === 0) return 'Sea level';
  const { n, u } = unit(r);
  return `${n} ${u} ${r > 0 ? 'above' : 'deep'}`;
}

export function formatRange(minM: number, maxM: number): string {
  if (minM === maxM) return formatElevation(minM);
  if (minM >= 0) {
    const lo = unit(minM);
    const hi = unit(maxM);
    return lo.u === hi.u ? `${lo.n} to ${hi.n} ${hi.u} above sea` : `${lo.n} ${lo.u} to ${hi.n} ${hi.u} above sea`;
  }
  if (maxM <= 0) return `${nf.format(Math.abs(maxM))} to ${nf.format(-minM)} m deep`;
  return `${nf.format(-minM)} m deep to ${unit(maxM).n} ${unit(maxM).u} above sea`;
}

/** Size of a creature or object, e.g. "4 cm", "25 m", "1.2 km". */
export function formatLength(m: number): string {
  const trim = (v: number) => nf.format(Number(v.toPrecision(2)));
  if (m < 0.01) return `${trim(m * 1000)} mm`;
  if (m < 1) return `${trim(m * 100)} cm`;
  if (m < 1000) return `${trim(m)} m`;
  return `${trim(m / 1000)} km`;
}

const NICE = [1, 2, 5];

/** A round length (1, 2, 5 x 10^n metres) for a scale bar that is at most `maxPx` wide. */
export function niceScale(mPerPx: number, maxPx: number): { meters: number; px: number; label: string } {
  const maxM = mPerPx * maxPx;
  let exp = Math.floor(Math.log10(maxM));
  let best = 0;
  for (let e = exp; e >= exp - 1; e--) {
    for (const n of NICE) {
      const v = n * Math.pow(10, e);
      if (v <= maxM && v > best) best = v;
    }
  }
  return { meters: best, px: best / mPerPx, label: formatLength(best) };
}
