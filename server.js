// Visible: AI-search visibility kit for Art of Living Canada.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ROOT, loadCatalog, loadSiteFacts, loadQueries, listRuns, saveRun } from './src/data.js';
import { scoreRun, isOwn, sourceFamily } from './src/score.js';
import { buildPlan, projectionCurve, ASSUMPTIONS } from './src/lift/plan.js';
import { generateAll, cityLandingHtml, llmsTxt } from './src/fixes/generate.js';
import { listingKit } from './src/fixes/listings.js';
import { faqFr, listingsFr } from './src/fixes/french.js';
import { findPrograms, getProgram } from './src/feed/search.js';
import { buildMcpServer } from './src/feed/mcp.js';
import { runAudit } from './src/audit/run.js';

const PORT = Number(process.env.PORT ?? 3000);
const catalog = loadCatalog();
const auditJob = { running: false, done: 0, total: 0, current: null, error: null, lastRunId: null };

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'content-type': type, 'access-control-allow-origin': '*' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body, null, 2));
};

const readBody = (req) => new Promise((resolve, reject) => {
  let data = '';
  req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
  req.on('end', () => { try { resolve(data ? JSON.parse(data) : undefined); } catch (e) { reject(e); } });
  req.on('error', reject);
});

export function state() {
  const runs = listRuns();
  const baseline = runs[0];
  const plan = buildPlan(baseline);
  const cities = [...new Set(catalog.centres.map((c) => c.city))].filter((c) => c !== 'Saint-Mathieu-du-Parc');
  const families = [...new Set(plan.actions.filter((a) => a.lever === 'listing').slice(0, 5).map((a) => a.family))];
  return {
    runs: runs.map((r) => ({ ...scoreRun(r), runAt: r.runAt, method: r.method, queries: r.queries.map((q) => ({ ...q, sources: [...new Set(q.resultDomains.filter((d) => !isOwn(d)).map(sourceFamily))] })) })),
    siteFacts: loadSiteFacts(),
    plan,
    projection: projectionCurve(baseline, plan),
    assumptions: ASSUMPTIONS,
    fixes: generateAll(catalog),
    listings: [...listingKit({ catalog, families, cities }), ...listingsFr({ catalog, cities: ['Montréal', 'Québec', 'Sherbrooke'] })],
    faqFr: faqFr({ programs: catalog.programs }),
    catalog,
    auditJob,
    liveAuditAvailable: !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
  };
}

async function startAudit() {
  if (auditJob.running) return;
  const { queries } = loadQueries();
  Object.assign(auditJob, { running: true, done: 0, total: queries.length, error: null });
  try {
    const run = await runAudit({ queries, onProgress: (i, n, q) => Object.assign(auditJob, { done: i, current: q }) });
    saveRun(run);
    auditJob.lastRunId = run.runId;
  } catch (e) {
    auditJob.error = e.message;
  } finally {
    auditJob.running = false;
  }
}

export async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  const path = url.pathname;
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,DELETE' });
      return res.end();
    }
    if (path === '/mcp') {
      // Stateless MCP over Streamable HTTP: a fresh server per request.
      const mcp = buildMcpServer(catalog);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => { transport.close(); mcp.close(); });
      await mcp.connect(transport);
      const body = req.method === 'POST' ? await readBody(req) : undefined;
      return transport.handleRequest(req, res, body);
    }
    if (path === '/' || path === '/index.html') return send(res, 200, readFileSync(join(ROOT, 'public/index.html')), 'text/html; charset=utf-8');
    if (path === '/api/state') return send(res, 200, state());
    if (path === '/api/programs') {
      return send(res, 200, findPrograms(catalog, {
        topic: url.searchParams.get('topic') ?? undefined, city: url.searchParams.get('city') ?? undefined,
        level: url.searchParams.get('level') ?? undefined,
      }));
    }
    if (path.startsWith('/api/programs/')) {
      const p = getProgram(catalog, decodeURIComponent(path.split('/').pop()));
      return p ? send(res, 200, p) : send(res, 404, { error: 'not found' });
    }
    if (path === '/feed.json') {
      const f = generateAll(catalog);
      return send(res, 200, { '@context': 'https://schema.org', '@graph': [f.organization, ...f.courses, ...f.centres.map((c) => c.jsonLd)] });
    }
    if (path === '/llms.txt') return send(res, 200, llmsTxt(catalog), 'text/plain; charset=utf-8');
    const m = path.match(/^\/fixes\/city\/([a-z0-9-]+)\.html$/);
    if (m) {
      const centre = catalog.centres.find((c) => c.id === m[1]);
      return centre ? send(res, 200, cityLandingHtml({ centre, catalog }), 'text/html; charset=utf-8') : send(res, 404, 'not found', 'text/plain');
    }
    if (path === '/api/audit/run' && req.method === 'POST') {
      if (!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)) {
        return send(res, 400, { error: 'Live re-test needs ANTHROPIC_API_KEY set on the server.' });
      }
      startAudit();
      return send(res, 202, auditJob);
    }
    if (path === '/api/audit/status') return send(res, 200, auditJob);
    return send(res, 404, { error: 'not found' });
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: e.message });
  }
}

export const server = createServer(handler);

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  server.listen(PORT, () => console.log(`Visible running on http://localhost:${PORT}`));
}
