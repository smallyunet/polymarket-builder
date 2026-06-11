# Polymarket Builder Explorer

Small local web app for exploring Polymarket builder data.

## Run

```sh
npm start
```

Then open <http://localhost:4173>

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

`/data/trades` is intentionally not wired into the UI because it requires authenticated CLOB API headers and an HMAC signature. The local `server.mjs` proxy is the right place to add that later without exposing secrets in the browser.
