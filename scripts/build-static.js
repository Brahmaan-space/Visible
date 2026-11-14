// Builds a static copy of the dashboard into docs/ for GitHub Pages (no server needed).
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadCatalog } from '../src/data.js';
import { state } from '../server.js';
import { generateAll, cityLandingHtml, llmsTxt } from '../src/fixes/generate.js';

const out = join(ROOT, 'docs');
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'fixes/city'), { recursive: true });
const catalog = loadCatalog();

const html = readFileSync(join(ROOT, 'public/index.html'), 'utf8')
  .replace('<script>', '<script>window.VISIBLE_STATIC = true;</script>\n<script>');
writeFileSync(join(out, 'index.html'), html);
writeFileSync(join(out, 'state.json'), JSON.stringify({ ...state(), liveAuditAvailable: false }));
copyFileSync(join(ROOT, 'src/feed/search.js'), join(out, 'search.js'));
writeFileSync(join(out, 'llms.txt'), llmsTxt(catalog));
const f = generateAll(catalog);
writeFileSync(join(out, 'feed.json'), JSON.stringify({ '@context': 'https://schema.org', '@graph': [f.organization, ...f.courses, ...f.centres.map((c) => c.jsonLd)] }, null, 1));
for (const centre of catalog.centres) writeFileSync(join(out, `fixes/city/${centre.id}.html`), cityLandingHtml({ centre, catalog }));
writeFileSync(join(out, '.nojekyll'), '');
console.log('Static site written to docs/');
