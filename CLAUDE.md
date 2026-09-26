# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

Built and deployed. `context/hissa_spec.md` is the product spec (v0.2) and `context/hissa_mvp.jsx` a single-file artifact prototype kept as a reference for flow and maths — neither is the code. **v2** — the stored name, stacked extras, pass the phone, sharing, the full-screen camera — is specified in `context/hissa_v2_plan.md` and was shipped against `context/hissa_v2_todo.md`; where the plan and the v0.2 spec disagree, the plan wins.

**Four places the shipped app deliberately departs from the spec.** Do not "fix" these back:

| Spec says | Actually built | Why |
| --- | --- | --- |
| §9 "explicitly not Next.js", no SEO surface | Vite MPA: zero-JS static landing + `noindex` app | SEO became a requirement; the *app* still has nothing to index |
| §10 Durable Object + WebSocket | ETag-gated polling on Vercel + Upstash Redis | 5s for the first hour, manual after; stale-first paint from `localStorage` |
| §8 receipt-paper aesthetic | Handwritten-journal design language | Replaced wholesale on request |
| §7.3 `gemini-2.5-flash`, `thinkingBudget: 0` | `gemini-3.1-flash-lite`, budget retried away on 400 | 2.5-flash now 404s for new keys; 3.6+ reject the argument |

## Commands

```sh
pnpm dev      # client only, at /app.html
pnpm test     # 180 unit tests
pnpm build    # static build to dist/
vercel dev    # adds /api (needs .env.local)
```

`vercel dev` does not load `GEMINI_API_KEY` from `.env.local` on its own: start it as `set -a; . ./.env.local; set +a; vercel dev`. It also does not emulate `vercel.json` rewrites reliably behind a framework dev command — `/s/CODE` is handled by a Vite middleware in `vite.config.ts` for dev and by the rewrite in production. Verify routing on a deployment, not on `vercel dev`.

Environment: `GEMINI_API_KEY` (production only, server-side), `KV_REST_API_URL`/`_TOKEN` (from the Upstash integration). **Never prefix anything `VITE_`** — that inlines it into the public bundle; `tests/secrets.test.ts` enforces this.

## What Hissa is

Photograph a bill, tap what you ate, everyone sees their share. Mobile-first PWA, no accounts, no login, no install. The design goal is fewest steps between opening the app and seeing a number — every proposed control has to justify itself against that or it does not ship.

The name is asked once (entry 00), then: home → capture → preview → editor → (equal split | chooser → (live split | table → turns → tally)), plus join. Every split ends with copy / share-as-image. The editor is the only dense screen.

## Stack

Vite (multi-page) + Preact via `preact/compat` + TypeScript; `wouter-preact` for `/s/:code`; plain CSS with custom properties; `vite-plugin-pwa`. API is Vercel functions over Upstash Redis: the bill endpoints on Edge, `/api/extract` on Node.js (see below). Extraction proxies Gemini server-side.

Still explicitly rejected: Next.js, a utility CSS framework, TanStack Query, Zustand, Tesseract, classical OCR.

Budget: app JS **26 KB gz** against a 60 KB ceiling (17 KB before v2); landing critical path ~6 KB gz plus a 35 KB font. Fonts total 64 KB — over the 45 KB target, and the one budget that is not met. Check any dependency against these.

## Invariants

These come from the spec's maths and data model and are the things most likely to be broken by a plausible-looking change.

**Money is integer minor units everywhere.** Floats appear only at parse time (`num`/`cents` in the prototype). Anything that stores, sums or transmits an amount uses paisa/cents.

**Claiming is by portions, not units.** A line's amount is divided by total portions claimed on it, and the *last claimer absorbs the rounding remainder* — so every line is always fully distributed no matter who tapped it. See `hissa_mvp.jsx:800-812`.

**Per-person totals scale off the subtotal share**: `personTotal = round(billTotal × personSubtotalShare / billSubtotal)`. Tax, discount and tip ride along proportionally rather than being apportioned separately. Unclaimed amounts are shown through the same scale so the figures are comparable.

**Extras stack in steps** (`money.ts`: `apply`, `Steps`). Service, GST, discount and tip each sit on a step; a step's percentages are of the running total after the step before, and rows sharing a step share a base. The default `[[service, gst], [discount, tip]]` *is* v1's rule (GST on the subtotal, discount and tip on the post-GST amount), which is why every v1 money test still passes. The editor never exposes the structure: it lists the distinct *totals* (`outcomes`) because percentages commute and most stackings collapse — three % rows give 5 outcomes, not 13. The stacking in use always represents its own total, so the list never words it differently from the "worked out" line.

**Identity is a normalised name.** The device's own name is `hissa:name`, asked once; changing it never renames you on a split already open (the name is that split's key). Trim, collapse inner whitespace, lowercase. `Faraz`, `faraz` and ` FARAZ ` are one person and one storage key. This is deliberate — it makes rejoining from a second device free, and makes the name-collision failure mode visible rather than silent.

**One storage key per person.** `bs:v1:<CODE>:meta` (bill, written once by the initiator, plus the leftovers toggle) and `bs:v1:<CODE>:c:<slug>` (one per person, only that person writes it). Never write another member's key — the concurrency case this design exists for is eight people tapping at once.

**The bill is frozen when the split opens.** `lines[]` entries carry `{id, name, qty, amt}` with `amt` already resolved, so members never re-derive pricing mode, tax or rounding. No post-open editing in the MVP.

**Device storage.** `hissa:name`, `hissa:steps` and `hissa:withItems` are stored *without* an `at`, because `sweep()` deletes any `hissa:*` value whose `at` is a day old. `hissa:round` (pass the phone) carries one on purpose. Pass the phone never touches the server.

**Codes** are 4 characters from an unambiguous alphabet (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — no I, O, 0, 1).

## Extraction

Gemini Flash on the AI Studio free tier while building; a paid key behind the Worker before any external user touches it (the free tier's training clause, not its rate limit, is the blocker). Non-negotiables: resize client-side to 1,400 px long side / JPEG 0.75 before upload, use `responseMimeType: "application/json"` with a `responseSchema` rather than parsing prose, set `thinkingConfig.thinkingBudget: 0`, validate line sums against the printed subtotal, always show the human review screen, and never retain the photo.

The model reports each extra with its printed rate, amount and `step`, plus the printed total, and when a bill prints two taxes for two ways of paying (cash vs card) it reports the tax and total of the *main* total line, as a pair. The client (`reading.ts` → `detect`) reads each extra as its printed rate or its printed amount (bills round and exempt things their rates don't show: "48%" charged as 1,500), tries every stacking of every reading, and takes the first reading — rates preferred, the model's stacking first — that reproduces the printed total within one major unit. When none does, it lands on the *closest* and the editor says how far off. Any extra, GST included, can be a rate or an amount. `tests/real-bills.test.ts` holds eleven real answers; the photos are in the gitignored `test_bills/`. Freddy's (bill 10) is the honest failure: it charged a 16% nobody printed. The response still carries v1's `gstPct`/`discount`/`tip` for installed v1 apps — remove them once v2 has been live a week.

The prototype calls Claude Sonnet instead, because that is the only endpoint available inside an artifact. Swapping extractors is a change to one function (`readBill`).

## Camera

Live `getUserMedia` viewfinder, `facingMode: { ideal: "environment" }`, `<video>` must be both `playsInline` and `muted` or iOS Safari goes fullscreen. The shutter draws the frame to a canvas and encodes straight to JPEG — the frame never becomes a file. Stop all tracks on leaving the screen and on unmount. `<input type="file" capture="environment">` is the fallback for `NotAllowedError` and for missing `getUserMedia`, never the primary path.

The live viewfinder is a fixed full-viewport layer, not the Fullscreen API (iPhone Safari keeps that for `<video>` and the native player). Tap-to-focus and the torch are requested only when `track.getCapabilities()` reports them — in practice Chrome Android; never show a control the camera can't honour.

## Things that bit, and now have tests

Each of these was a real bug found by running the app, not a hypothetical:

- **Joining wiped your claims.** Registering an empty record unconditionally erased what you had tapped. `doJoin` now reads before writing.
- **Two owners of `mine`.** The join fetch and the poll both wrote local claims, so an in-flight poll clobbered the fresher answer. `adopted` ref in `App.tsx` settles ownership.
- **Upstash batches** go to `/multi-exec`, not the base URL. Posting to the root fails with "unsupported arg type".
- **`cleanUrls` 308s `/app.html` → `/app`**, so the rewrite target must be `/app` or the code in the URL is thrown away.
- **The poll ran at ~2x.** Keying the timer effect on `state` tore it down on every arriving claim. It is keyed on the bill's open time now.
- **A slow read was killed at 25s.** Edge functions must send a first byte within 25s; one Gemini read took longer in production and returned a 504. `/api/extract` runs on Node (`maxDuration: 60`, `export const POST`).
- **Node wants file extensions.** The Edge bundler resolved `./_lib/http`; Node's ESM loader does not, and every call failed with `ERR_MODULE_NOT_FOUND`. Relative imports under `api/` end in `.js`. Only visible on a deployment.
- **Paper vanished over the camera in dark mode.** The viewfinder's strokes and stubs used the theme's "paper", which is dark brown in dark mode. `.cam` pins the light palette.
- **Two taxes, one total.** "Use the lower rate" paired a card-rate 8% with the cash total. The prompt now keeps a tax and its total together.
- **Discounts arrived as zero.** Bills print them as `-348`; the reading kept only positive amounts. Amounts are read by magnitude now.
- **The picker contradicted itself.** Two stackings with the same total: the list named one, the "worked out" line the other.
- **`/?about` would have opened the app.** Workbox matches pathname *and* search, so the service worker denylist needs `^\/(\?.*)?$`, not `^\/$`.
- **Quick taps erased each other.** Tap handlers built the next claims from the render-time value, so a second tap before a re-render overwrote the first — locally and on the server. Found on production. Pass the phone uses a functional `setRound`; the live split reads claims from `mineRef`.
- **Chip colours collided** — hash-to-palette put two people at a table on the same colour. `paletteFor` resolves collisions off a sorted key list so every device agrees.

## Design language

`src/styles/journal.css` is the whole aesthetic as tokens and primitives; screens compose from it and never invent a colour, shadow or rotation.

- **Light is the default**, whatever the OS says. Dark is opt-in via the toggle (light → dark → follow-system), applied inline before first paint so static pages never flash.
- **Rotation is deterministic** (`src/lib/tilt.ts`) and sized by element: `scrap` (−4°..+11°) for chips and stubs, `card` (−1.4°..+1.8°) for full-width blocks. A full-width card at 9° reads as a broken layout, not a hand-placed one.
- **Dashed rules and input underlines are the brief**; dashed *boxes* are not. Small controls are paper with a hard offset shadow.
- **Every money amount** is `.amt` (Courier Prime, tabular). Handwriting faces have no tabular figures, and spec §8 is emphatic that figures people compare must line up.
- Everything flattens under `prefers-reduced-motion`.
