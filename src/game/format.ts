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
