# SkyShards Fusable

A localhost website that reads your Hypixel SkyBlock **hunting box** and tells you which shards you can **fuse right now** — including every pairing your inventory supports — plus what becomes reachable after one intermediate fusion.

skyshards.com already tells you how to get a shard; this fills the gap by working from *your* shards in the other direction.

## Requirements

- [Node.js](https://nodejs.org) 18 or newer (no dependencies, no install step)

## Run it

```shell
git clone <this-repo-url> skyshards-fusable
cd skyshards-fusable
npm start
```

Then open <http://127.0.0.1:3000>, type your Minecraft IGN and press **Analyze**.

Your IGN is remembered in `localStorage`, and you can share a direct link: `http://127.0.0.1:3000/?ign=Notch`.

Port can be changed with `PORT=4000 npm start`.

## Terminal version

```shell
node analyze.mjs <IGN>
```

## How it works

- `server.mjs` — zero-dependency HTTP server: serves `public/` and `GET /api/report?ign=…`.
- `lib/fusion.mjs` — joins a player's shards with the recipe table and builds the report.
- `public/` — the page (`index.html`, `app.js`, `styles.css`).
- `data/fusion-data.json` — [SkyShards](https://github.com/Campionnn/SkyShards) recipe + shard table (MIT).

Player shards come from SkyShards' public backend proxy (`api.skyshards.com/skyshards/profile/<ign>`), which in turn reads the Hypixel API. No API key is needed and nothing leaves your machine except that request.

### Fusion rules used

- A craft consumes each input's own `fuse_amount`: 5 shards normally, 2 for reptile / amphibian / elemental shards, 1 for Chameleon.
- A recipe's output quantity is its `quantity` key in `fusion-data.json` (usually 1, sometimes 2).
- "×N" is the maximum from a *single* pairing; recipes share shards, so the totals across lines are not additive.
- "One extra fusion step away" only chains one intermediate; longer chains are not planned.

## Updating the recipe data

Replace `data/fusion-data.json` with the current file from SkyShards:

```shell
curl -fsSL -o data/fusion-data.json https://raw.githubusercontent.com/Campionnn/SkyShards/master/public/fusion-data.json
```

## Notes

- Only the currently selected SkyBlock profile is read.
- The SkyShards proxy can lag behind the game after an update; refresh in a minute if something looks stale.

## Credits

Recipe and shard data © the [SkyShards](https://github.com/Campionnn/SkyShards) project (MIT). Not affiliated with Hypixel.
