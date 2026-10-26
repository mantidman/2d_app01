import { Bounds, pathBounds } from './svgBounds';

const files = import.meta.glob('../../public/silhouettes/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** Drawing bounds (in the 256-unit box) per silhouette file, so sprites can be scaled to real size. */
export const SILHOUETTE_BOUNDS: Record<string, Bounds> = {};

for (const [path, svg] of Object.entries(files)) {
  const d = /\sd="([^"]+)"/.exec(svg)?.[1];
  if (d) SILHOUETTE_BOUNDS[path.split('/').pop()!] = pathBounds(d);
}
