# Visible: Art of Living in AI search

Hackathon MVP for problem statement #7, "Make Art of Living discoverable in AI search".

When someone in Canada asks an AI assistant "where can I learn meditation in Toronto", Art of Living does not show up. Visible measures that, works out what would change it, generates the fixes, gives AI assistants a direct line to the program catalog, and re-tests.

## What is real and what is simulated

| Piece | Status |
|---|---|
| Baseline audit (20 questions, 17 unbranded + 3 branded) | **Real.** Run on 2026-11-14 through a live web search engine, the retrieval layer AI assistants use for grounded answers. Result: **0 of 17** unbranded questions surface Art of Living; **3 of 3** branded ones do. |
| Program catalog (15 programs, 5 centres) | **Real** names, levels and URLs from artofliving.org/ca-en/programs. Descriptions are short paraphrases. Dates and prices were not on the page. |
| Site check (meta tags, llms.txt, robots.txt, junk indexed pages) | **Real**, fetched 2026-11-14. |
| Projected share of voice in the lift plan | **Simulated.** Uses stated planning assumptions (e.g. a listing gets you into 35% of the questions where that site ranks). Marked SIMULATED in the UI. |
| FAQ answers | **Drafts** generated from the catalog. A volunteer confirms them before publishing. |
| Live re-test | Real when `ANTHROPIC_API_KEY` is set: asks Claude with web search, located in Canada, and saves the run. |

## The strategy for raising the score

The audit shows AI answers for these questions are built from **listing sites** (Eventbrite in 7 of 17, Coursetakers 6, BookRetreats 5, Meetup 4), competitors (Shambhala, Sri Chinmoy) and a few press round-ups. artofliving.org never appears for an unbranded question, even though centre pages exist.

So the plan, ranked by questions reached ÷ effort:
1. **Be where AI already reads.** Post the intro workshop and Part 1 on Eventbrite, Coursetakers, Meetup per city, and Part 2 on BookRetreats. Visible generates the listing copy.
2. **Fix indexing hygiene.** Meta descriptions, retire pages titled "i 504" / "home 4" / "events old", publish a Canada llms.txt.
3. **City pages** per centre with Course, Place and FAQ schema, worded like the real questions.
4. **Answer pages** for the intents with zero presence: anxiety, sleep, breathwork, students, retreats.
5. **Directories, civic calendars, campus wellness pages and press pitches.**
6. **Direct AI access** through the MCP server and open feed, for assistants that call tools.

Then re-test, and the real number replaces the projection.

## Run it

```bash
npm install
npm start            # dashboard on http://localhost:3000
npm test             # 8 tests
npm run audit        # live re-test (needs ANTHROPIC_API_KEY)
npm run mcp          # MCP server over stdio
```

Endpoints: `/api/programs?topic=anxiety&city=Toronto`, `/api/programs/:id`, `/feed.json`, `/llms.txt`, `/fixes/city/<centre>.html`, MCP over HTTP at `/mcp`.

## Demo script (3 minutes)

1. **Audit tab:** 0% on everyday questions, 100% on branded ones. "People who already know us find us. Nobody else does." Show Eventbrite and listing sites taking the space.
2. **Lift plan tab:** tick actions and watch the simulated score move; explain it is evidence-ranked from the audit.
3. **Fixes tab:** open the Toronto city page preview, the FAQ schema, and copy one Eventbrite listing.
4. **AI feed tab:** search "anxiety" + "Toronto"; then show the same tool called from Claude through MCP.
5. **Re-test tab:** run history; after fixes go live, run again for a real before/after.

## Layout

```
data/            programs.json, site-facts.json, queries.json, audits/*.json (every run)
src/audit/       live audit runner (Claude + web search) and response parser
src/score.js     share of voice, by city and intent, source families
src/lift/        ranked action plan and projection
src/fixes/       JSON-LD, FAQ, llms.txt, city pages, listing kit
src/feed/        program search and MCP server
public/          dashboard
server.js        HTTP server (no framework)
```
