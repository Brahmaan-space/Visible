// The share-of-voice lift plan: which actions move the score, ranked by evidence from the audit.
import { isOwn, sourceFamily, SOURCE_KIND } from '../score.js';

// Assumed chance an action gets Art of Living into the top results for a query it targets.
// These are planning assumptions, not measurements; the re-test replaces them with real numbers.
export const ASSUMPTIONS = {
  listing: 0.35, directory: 0.15, civic: 0.3, campus: 0.3, press: 0.25, cityPage: 0.15, topicPage: 0.2, hygiene: 0.05,
};

const EFFORT = { listing: 1, directory: 1, civic: 2, campus: 2, press: 3, cityPage: 2, topicPage: 2, hygiene: 1 };

const TOPIC_PAGES = [
  { intents: ['anxiety', 'stress'], title: 'Breathing for anxiety and stress page', program: 'Deep Sleep & Anxiety Relief + Part 1' },
  { intents: ['sleep'], title: 'Breathing for better sleep page', program: 'Deep Sleep & Anxiety Relief' },
  { intents: ['breathwork'], title: 'What is SKY breathwork page', program: 'Art of Living Part 1' },
  { intents: ['students'], title: 'Meditation for students page (SKY Campus)', program: 'SKY Campus' },
  { intents: ['corporate'], title: 'Workplace wellness page', program: 'Corporate programs' },
  { intents: ['retreat'], title: 'Silent retreat in Québec page', program: 'Art of Living Part 2' },
];

export function buildPlan(run) {
  const unbranded = run.queries.filter((q) => !q.branded);
  const famQueries = {};
  for (const q of unbranded) {
    for (const f of new Set(q.resultDomains.filter((d) => !isOwn(d)).map(sourceFamily))) (famQueries[f] ??= []).push(q.id);
  }

  const actions = [];
  for (const [family, ids] of Object.entries(famQueries)) {
    const kind = SOURCE_KIND[family];
    if (!kind || kind === 'competitor' || ids.length < 1) continue;
    const verb = {
      listing: /Retreat/.test(family) ? `List Art of Living Part 2 (silence retreat) on ${family}` : `List the intro workshop and Part 1 on ${family}, per city`,
      directory: `Claim and complete the ${family} profile for each centre`,
      civic: `Submit programs to the ${family} calendar`,
      campus: `Get SKY Campus on ${family} wellness pages`,
      press: `Pitch ${family} for its "best meditation" round-ups`,
    }[kind];
    actions.push({
      id: `src-${family.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      lever: kind, title: verb, family, queryIds: ids, p: ASSUMPTIONS[kind], effort: EFFORT[kind],
      evidence: `${family} appears in the top 10 for ${ids.length} of ${unbranded.length} unbranded questions; Art of Living is in none of them.`,
      visibleBuilds: kind === 'listing' ? 'Listing kit: titles, tags and copy per city' : kind === 'press' ? 'Pitch draft with program facts' : 'Profile facts from the catalog',
    });
  }

  const cityIds = unbranded.filter((q) => q.city && q.city !== 'Canada').map((q) => q.id);
  actions.push({
    id: 'city-pages', lever: 'cityPage', title: 'Publish a city page per centre with Course, Place and FAQ schema',
    queryIds: cityIds, p: ASSUMPTIONS.cityPage, effort: EFFORT.cityPage,
    evidence: `${cityIds.length} unbranded questions name a city. Centre pages exist but did not appear for any of them.`,
    visibleBuilds: 'City landing page HTML with JSON-LD, title and meta description',
  });

  for (const t of TOPIC_PAGES) {
    const ids = unbranded.filter((q) => t.intents.includes(q.intent)).map((q) => q.id);
    if (!ids.length) continue;
    actions.push({
      id: `topic-${t.intents[0]}`, lever: 'topicPage', title: `Publish a "${t.title.replace(/ page/, '')}" answer page`,
      queryIds: ids, p: ASSUMPTIONS.topicPage, effort: EFFORT.topicPage,
      evidence: `${ids.length} question(s) about ${t.intents.join('/')} returned only other providers.`,
      visibleBuilds: `FAQ block and schema around ${t.program}`,
    });
  }

  actions.push({
    id: 'hygiene', lever: 'hygiene', title: 'Fix indexing hygiene: meta descriptions, retire junk pages, Canada llms.txt',
    queryIds: unbranded.map((q) => q.id), p: ASSUMPTIONS.hygiene, effort: EFFORT.hygiene,
    evidence: 'Home page has no meta description; pages titled "i 504", "home 4", "events old" are indexed; llms.txt lists one Canadian link.',
    visibleBuilds: 'Meta tags per page and a Canada llms.txt',
  });

  for (const a of actions) a.impact = +(a.queryIds.length * a.p / a.effort).toFixed(2);
  actions.sort((a, b) => b.impact - a.impact);
  return { actions, unbrandedTotal: unbranded.length };
}

// SIMULATED: expected share of voice if the chosen actions are done, using ASSUMPTIONS.
export function projectShareOfVoice(run, actions) {
  const unbranded = run.queries.filter((q) => !q.branded);
  let expected = 0;
  for (const q of unbranded) {
    if (q.mentioned) { expected += 1; continue; }
    const miss = actions.filter((a) => a.queryIds.includes(q.id)).reduce((m, a) => m * (1 - a.p), 1);
    expected += 1 - miss;
  }
  return Math.round((100 * expected) / unbranded.length);
}

// Projection curve: score after doing the top 1..n actions in plan order.
export function projectionCurve(run, plan) {
  return plan.actions.map((a, i) => ({ step: i + 1, action: a.title, projected: projectShareOfVoice(run, plan.actions.slice(0, i + 1)) }));
}
