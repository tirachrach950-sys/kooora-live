# Goalline: live football scores site

A small Node.js site (no dependencies) that pulls scores from a football data API, keeps them in memory, and serves
server-rendered pages in English, French and Arabic. Scores refresh in the browser every 30 seconds.

Leagues: Premier League, La Liga, Ligue 1, Serie A, Bundesliga, Champions League, World Cup (national teams).

## Try it now (sample data, no key needed)
    node server.js          # needs Node 20.6+; run as: MOCK=1 node server.js
    open http://localhost:3000

## Go live with real scores
1. Get a free token at https://www.football-data.org/client/register
2. Copy `.env.example` to `.env`, fill in `FOOTBALL_DATA_TOKEN`, `SITE_URL`, `SITE_NAME`, `CONTACT_EMAIL`.
3. Run locally: `npm run dev`
4. Deploy to a host that runs a normal Node server all the time (Render, Railway, Fly.io or any VPS).
   Build command: none. Start command: `node server.js`. Add the same variables in the host's settings.
   Do NOT use serverless hosting (e.g. Vercel functions): the background poller needs a running process.
5. Point your own domain at it (HTTPS is automatic on those hosts).

## How fresh are the scores?
The poller asks the provider for each league in turn, waiting `GAP_MS` between requests (6.5 s keeps you inside the
free plan's limit of 10 requests per minute). With 7 leagues that is about one update per minute per league.
On a paid plan, lower `GAP_MS` for faster updates. Check the provider's terms: free plans may delay live scores and
may not allow commercial or advertising use. Upgrade before you apply for ads if they say so.

## Google AdSense
1. Deploy on your own domain first. Fill in `SITE_NAME` and `CONTACT_EMAIL` so About, Contact and Privacy are real.
2. Add some original content beyond the auto summaries (match previews, guides) before applying.
3. Apply at https://adsense.google.com and add your site.
4. Once approved, set `ADSENSE_CLIENT` (ca-pub-...), `ADSENSE_PUB` (pub-...), and the two slot IDs. `/ads.txt` and the
   ad units then appear automatically. Until then no ad code is on the page.
5. In AdSense, turn on Google's consent message (Privacy & messaging) for visitors in Europe and the UK.

## Pages
- `/<lang>/<league>`: scores, upcoming matches, results, table (lang = en, fr or ar)
- `/<lang>/team/<league>/<CODE>`: one team, its form and fixtures
- `/<lang>/match/<league>/<id>`: one match with an automatic written summary
- `/<lang>/about`, `/contact`, `/privacy`: translated into English, French and Arabic
- `/api/<league>`, `/sitemap.xml`, `/robots.txt`, `/ads.txt`, `/healthz`

## Deploy
- **Render:** push this folder to GitHub, then New > Blueprint (uses `render.yaml`). Choose an always-on plan.
- **Docker / Fly.io / VPS:** `docker build -t goalline .` then run with the variables from `.env.example`.
- Then point your domain at it and set `SITE_URL` to that address.

## Files
- `server.js`: poller, cache, pages, JSON API, sitemap, ads.txt
- `names.json`: Arabic and French club/country names (add more entries any time: key = the name the provider uses)
- `public/app.js`, `public/style.css`: live refresh, local kick-off times, styling
- `render.yaml`, `Dockerfile`: deployment

## Known limits
- Badges are generated from the club's 3-letter code. Real club logos need a licence.
- The provider is asked only for matches from 4 days ago to 8 days ahead, so older match pages stop existing. Team pages stay.
- Clubs missing from `names.json` show their Latin name in Arabic and French.
- Data is kept in memory and rebuilt after a restart (the first poll takes about a minute).
- Have the privacy policy reviewed for your country.
- Written against football-data.org's documented format; I could not reach it from my workspace, so test with your token and check the logs.
