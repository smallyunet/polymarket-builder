# Polymarket Builder Explorer

Small local web app for exploring Polymarket builder data.

## Run

```sh
npm start
```

Then open <http://localhost:4173>

## Data Sources

- `GET https://data-api.polymarket.com/v1/builders/leaderboard`
- `GET https://data-api.polymarket.com/v1/builders/volume`
- `GET https://clob.polymarket.com/builder/trades`

`/data/trades` is intentionally not wired into the UI because it requires authenticated CLOB API headers and an HMAC signature. The local `server.mjs` proxy is the right place to add that later without exposing secrets in the browser.
