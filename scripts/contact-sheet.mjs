// Renders every silhouette on one image (artifacts/contact-sheet.png) for quick visual review.
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';

const species = JSON.parse(readFileSync('src/data/species.json', 'utf8'));
mkdirSync('artifacts', { recursive: true });
const cells = species
  .map((s) => {
    const svg = readFileSync(`public/silhouettes/${s.silhouette}`, 'utf8').replace('#fff', s.color);
    return `<div class="c">${svg}<span>${s.name}</span></div>`;
  })
  .join('');
const html = `<body style="margin:0;background:#0b1a2c;color:#cde;font:13px system-ui">
<style>.g{display:grid;grid-template-columns:repeat(5,200px);gap:8px;padding:8px}.c{text-align:center}svg{width:200px;height:200px;background:#102338}</style>
<div class="g">${cells}</div></body>`;

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1060, height: 260 * Math.ceil(species.length / 5) } });
await page.setContent(html);
await page.screenshot({ path: 'artifacts/contact-sheet.png' });
await browser.close();
console.log('wrote artifacts/contact-sheet.png');
