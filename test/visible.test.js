import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalog, listRuns } from '../src/data.js';
import { scoreRun, isOwn } from '../src/score.js';
import { buildPlan, projectShareOfVoice } from '../src/lift/plan.js';
import { parseClaudeResponse } from '../src/audit/run.js';
import { findPrograms } from '../src/feed/search.js';
import { generateAll, cityLandingHtml, faqFor } from '../src/fixes/generate.js';
import { listingKit } from '../src/fixes/listings.js';
import { buildMcpServer } from '../src/feed/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const catalog = loadCatalog();
const baseline = listRuns().find((r) => r.runId === 'baseline-2026-11-14');

test('baseline scores match the real audit: 8 of 49 unbranded, 5 of 5 branded', () => {
  const s = scoreRun(baseline);
  assert.equal(s.unbrandedTotal, 49);
  assert.equal(s.unbrandedMentioned, 8);
  assert.equal(s.brandedRecall, 100);
  assert.equal(s.byProvince.ON.total > 0, true);
  assert.equal(s.topSources[0].name, 'Eventbrite');
});

test('own-domain detection includes subdomains but not lookalikes', () => {
  assert.ok(isOwn('www.artofliving.org'));
  assert.ok(isOwn('skycampuscanada.org'));
  assert.ok(!isOwn('notartofliving.org'));
});

test('plan ranks listing sites first and projection grows with more actions', () => {
  const plan = buildPlan(baseline);
  assert.equal(plan.actions[0].family, 'Eventbrite');
  const one = projectShareOfVoice(baseline, plan.actions.slice(0, 1));
  const all = projectShareOfVoice(baseline, plan.actions);
  assert.ok(one > 0 && all > one && all <= 100);
  assert.equal(projectShareOfVoice(baseline, []), scoreRun(baseline).shareOfVoice);
});

test('parses a Claude web-search response into domains, rank and mention', () => {
  const msg = {
    content: [
      { type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'x' } },
      { type: 'web_search_tool_result', tool_use_id: 's1', content: [
        { type: 'web_search_result', url: 'https://toronto.shambhala.org/a', title: 'a' },
        { type: 'web_search_result', url: 'https://www.artofliving.org/ca-en/toronto-downtown', title: 'b' },
      ] },
      { type: 'text', text: 'Try the Art of Living Part 1 course.', citations: [{ type: 'web_search_result_location', url: 'https://www.artofliving.org/ca-en/toronto-downtown' }] },
    ],
  };
  const r = parseClaudeResponse(msg);
  assert.deepEqual(r.resultDomains, ['toronto.shambhala.org', 'www.artofliving.org']);
  assert.equal(r.ownRank, 2);
  assert.equal(r.mentioned, true);
  assert.equal(r.citedOwn, true);
  assert.equal(parseClaudeResponse({ content: [{ type: 'text', text: 'Try Shambhala.' }] }).mentioned, false);
});

test('program search maps everyday words to the right programs', () => {
  assert.equal(findPrograms(catalog, { topic: 'help with anxiety' }).programs[0].id, 'sleep-anxiety');
  assert.equal(findPrograms(catalog, { topic: 'university students' }).programs[0].id, 'sky-campus');
  const t = findPrograms(catalog, { topic: 'meditation', city: 'toronto' });
  assert.equal(t.centres.length, 2);
  assert.ok(findPrograms(catalog, { city: 'Sherbrooke' }).centres.length === 1);
  assert.match(findPrograms(catalog, { city: 'Halifax' }).note, /No listed centre in Halifax/);
});

test('fixes produce valid JSON-LD and a page with unique titles', () => {
  const f = generateAll(catalog);
  assert.equal(f.courses.length, catalog.programs.length);
  for (const c of f.courses) assert.equal(c['@type'], 'Course');
  const titles = f.centres.map((c) => c.meta.title);
  assert.equal(new Set(titles).size, titles.length);
  const html = cityLandingHtml({ centre: catalog.centres[0], catalog });
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  assert.ok(blocks.some((b) => b['@type'] === 'FAQPage'));
  assert.ok(faqFor({ programs: catalog.programs }).items.every((i) => i.status === 'draft-needs-review'));
  assert.match(f.llmsTxt, /Deep Sleep & Anxiety Relief/);
});

test('listing kit respects platform title limits', () => {
  const kit = listingKit({ catalog, families: ['Eventbrite', 'BookRetreats'], cities: ['Toronto'] });
  assert.ok(kit.length >= 4);
  for (const l of kit.filter((k) => k.platform === 'Eventbrite')) assert.ok(l.title.length <= 75);
  assert.ok(kit.some((k) => k.platform === 'BookRetreats' && /Part 2/.test(k.title)));
});

test('MCP server exposes tools and answers find_programs', async () => {
  const server = buildMcpServer(catalog);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: 't', version: '1' });
  await client.connect(b);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ['find_programs', 'get_program', 'list_centres']);
  const res = await client.callTool({ name: 'find_programs', arguments: { topic: 'sleep' } });
  assert.equal(JSON.parse(res.content[0].text).programs[0].id, 'sleep-anxiety');
  await client.close();
});

test('French materials cover Québec cities and keep drafts flagged', async () => {
  const { faqFr, listingsFr } = await import('../src/fixes/french.js');
  const f = faqFr({ programs: catalog.programs });
  assert.ok(f.items.length >= 4 && f.items.every((i) => i.status === 'brouillon-a-verifier'));
  assert.equal(f.jsonLd.inLanguage, 'fr-CA');
  const l = listingsFr({ catalog, cities: ['Sherbrooke'] });
  assert.ok(l.every((x) => x.title.length <= 75 && x.body.includes('/ca-fr/')));
});
