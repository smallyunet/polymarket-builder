# Polymarket Builder Explorer

Small local web app for exploring Polymarket builder data.

## Run

```sh
npm start
```

Then open <http://localhost:4173>

## Export Builder Data

```sh
npm run export:builders
```

The export writes a timestamped directory under `data/builder-export/` with:

- `REPORT.md` for a human-readable overview.
- `builders.csv` for one-row-per-builder analysis.
- `builders.json`, `volumes.json`, and `trades.json` for structured AI analysis.
- `raw/` endpoint payloads for auditability.

By default the export fetches every builder found in the leaderboard and the
latest builder-trades page for each builder. Use environment variables to tune
depth:

```sh
TRADE_MAX_PAGES=3 npm run export:builders
TRADE_MAX_PAGES=0 TRADE_CONCURRENCY=2 npm run export:builders
TRADE_BUILDER_LIMIT=50 npm run export:builders
```

`TRADE_MAX_PAGES=0` follows trade cursors until the endpoint stops returning a
cursor, which can produce a very large local export.

To generate a single text summary from the latest export for AI analysis:

```sh
node scripts/summarize-builder-export.mjs
```

The summary is written under `data/reports/`. You can also pass an explicit
export directory and output file:

```sh
node scripts/summarize-builder-export.mjs data/builder-export/<export-id> data/reports/<export-id>-summary.txt
```

## Deploy on GitHub Pages

This app can be deployed as a static GitHub Pages site. Push `index.html`,
`styles.css`, `app.js`, and `CNAME`, then configure Pages to serve the branch
root.

GitHub Pages does not run `server.mjs`. In local development, `localhost` uses
the Node proxy routes under `/api/*`. On GitHub Pages or a custom domain, the
browser calls Polymarket public APIs directly.

## Data Sources

- `GET https://data-api.polymarket.com/v1/builders/leaderboard`
- `GET https://data-api.polymarket.com/v1/builders/volume`
- `GET https://clob.polymarket.com/builder/trades`
- `GET https://gamma-api.polymarket.com/markets?condition_ids=...` for
  human-readable market titles and links.

`/data/trades` is intentionally not wired into the UI because it requires authenticated CLOB API headers and an HMAC signature. The local `server.mjs` proxy is the right place to add that later without exposing secrets in the browser.
