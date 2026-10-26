const nf = new Intl.NumberFormat('en-US');

export function formatElevation(m: number): string {
  const r = Math.round(m);
  if (r === 0) return 'Sea level';
  return `${nf.format(Math.abs(r))} m ${r > 0 ? 'above' : 'deep'}`;
}

export function formatRange(minM: number, maxM: number): string {
  if (minM === maxM) return formatElevation(minM);
  if (minM >= 0) return `${nf.format(minM)} to ${nf.format(maxM)} m above sea`;
  if (maxM <= 0) return `${nf.format(Math.abs(maxM))} to ${nf.format(-minM)} m deep`;
  return `${nf.format(-minM)} m deep to ${nf.format(maxM)} m above sea`;
}
