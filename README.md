# Hissa

Photograph a bill, tap what you ate, everyone sees their hissa.

Mobile-first PWA. No accounts, no login, no install. `context/hissa_spec.md` is
the authoritative product spec; `CLAUDE.md` records the invariants that a
plausible-looking change is most likely to break.

## Run it

```sh
pnpm install
pnpm dev          # app at /app.html, landing at /
pnpm test         # unit tests
pnpm build        # static build into dist/
```

`pnpm dev` serves the client only. The `/api` functions need `vercel dev`
(and the environment below).

## Environment

Two secrets, neither of which may ever reach the browser.

| Variable | What it is |
| --- | --- |
| `GEMINI_API_KEY` | Reads bills from photos. Server-side only. |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Bill storage. Injected by the Vercel integration. |

**Nothing here gets a `VITE_` prefix.** Vite inlines every `VITE_`-prefixed
variable into the client bundle, where it is public. `tests/secrets.test.ts`
fails the build if a key or a `GEMINI_API_KEY` reference appears under `src/`.

### Getting a Gemini key

1. Open **<https://aistudio.google.com/apikey>** and sign in with a Google
   account.
2. **Create API key** → pick or create a project when prompted. No billing
   account, no card. The key looks like `AIza...`.
   *(Google Cloud Vision is a different product on a different console and
   does require billing — you do not want it. See spec §7.)*
3. Put it in `.env.local` at the repo root:
   ```sh
   echo 'GEMINI_API_KEY=AIza...' >> .env.local
   ```
4. `.env*` is gitignored (with `!.env.example` excepted), so it cannot be
   committed by accident.
5. Give it to Vercel for deployed environments:
   ```sh
   vercel env add GEMINI_API_KEY production
   vercel env add GEMINI_API_KEY preview
   ```

The free tier is fine for building on your own bills, but its content is used
to improve Google's products. **Move to a paid key before any stranger uploads
a receipt** — that is the upgrade trigger, not the rate limit.

### Redis

```sh
vercel integration add upstash/upstash-kv   # accept the marketplace terms in the browser first
vercel env pull .env.local                  # pulls the URL and token down
```

## How it fits together

```
index.html, how-it-works.html   static, zero JS — the entire SEO surface
app.html  →  src/               the app; noindex, never crawled
api/                            Vercel Edge functions
  extract.ts                    Gemini proxy, holds the key
  bill/…                        create, read (ETag), claims, leftovers toggle
```

**Storage.** One Redis hash per bill, 24h TTL:

```
bill:KQF   v      -> version counter, served as the ETag
           meta   -> the frozen bill
           c:ali  -> one field per person, written only by that person
```

Nobody ever writes anyone else's field, which is what makes eight people
tapping at once safe. Every write bundles `HSET` + `HINCRBY v` + `EXPIRE` so
the version can never drift from the data.

**Syncing.** Polls every 5s for the first hour after the code is created, then
stops and waits for the Refresh button. Every request carries `If-None-Match`,
so a quiet poll is a `304` with no body. The last known state is cached in
`localStorage` and painted immediately on load, before the network is touched.

**Design.** `src/styles/journal.css` is the whole design language as tokens and
primitives; screens compose from it and never invent a colour or a rotation.
Rotations are deterministic (`src/lib/tilt.ts`), applied as transforms only, and
flattened under `prefers-reduced-motion`.

**Fonts** are self-hosted, axis-pinned and subset — 172 KB from Google down to
64 KB, of which only the 35 KB body face is on the critical path. Rebuild them
with `tools/fonts.sh` if you need a glyph that is missing (a new currency
symbol, say).

## Budgets

| | Budget | Actual |
| --- | --- | --- |
| App JS | 60 KB gz | 17 KB |
| Landing critical path | — | ~6 KB gz + 35 KB font |
| Fonts total | 45 KB | 64 KB — over; see `src/styles/fonts.css` |
