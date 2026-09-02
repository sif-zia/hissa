# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

Built and deployed. `context/hissa_spec.md` is the product spec (v0.2) and `context/hissa_mvp.jsx` a single-file artifact prototype kept as a reference for flow and maths — neither is the code.

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
pnpm test     # 79 unit tests
pnpm build    # static build to dist/
vercel dev    # adds /api (needs .env.local)
```

`vercel dev` does not emulate `vercel.json` rewrites reliably behind a framework dev command — `/s/CODE` is handled by a Vite middleware in `vite.config.ts` for dev and by the rewrite in production. Verify routing on a deployment, not on `vercel dev`.

Environment: `GEMINI_API_KEY` (production only, server-side), `KV_REST_API_URL`/`_TOKEN` (from the Upstash integration). **Never prefix anything `VITE_`** — that inlines it into the public bundle; `tests/secrets.test.ts` enforces this.

## What Hissa is

Photograph a bill, tap what you ate, everyone sees their share. Mobile-first PWA, no accounts, no login, no install. The design goal is fewest steps between opening the app and seeing a number — every proposed control has to justify itself against that or it does not ship.

Six screens: home → capture → preview → editor → (equal split | start → split), plus join. The editor is the only dense screen.

## Stack

Vite (multi-page) + Preact via `preact/compat` + TypeScript; `wouter-preact` for `/s/:code`; plain CSS with custom properties; `vite-plugin-pwa`. API is Vercel Edge functions over Upstash Redis. Extraction proxies Gemini server-side.

Still explicitly rejected: Next.js, a utility CSS framework, TanStack Query, Zustand, Tesseract, classical OCR.

Budget: app JS **17 KB gz** against a 60 KB ceiling; landing critical path ~6 KB gz plus a 35 KB font. Fonts total 64 KB — over the 45 KB target, and the one budget that is not met. Check any dependency against these.

## Invariants

These come from the spec's maths and data model and are the things most likely to be broken by a plausible-looking change.

**Money is integer minor units everywhere.** Floats appear only at parse time (`num`/`cents` in the prototype). Anything that stores, sums or transmits an amount uses paisa/cents.

**Claiming is by portions, not units.** A line's amount is divided by total portions claimed on it, and the *last claimer absorbs the rounding remainder* — so every line is always fully distributed no matter who tapped it. See `hissa_mvp.jsx:800-812`.

**Per-person totals scale off the subtotal share**: `personTotal = round(billTotal × personSubtotalShare / billSubtotal)`. Tax, discount and tip ride along proportionally rather than being apportioned separately. Unclaimed amounts are shown through the same scale so the figures are comparable.

**Order of operations at bill level**: GST applies to subtotal; discount and tip both apply to the post-GST amount. Total = afterGst − discount + tip.

**Identity is a normalised name.** Trim, collapse inner whitespace, lowercase. `Faraz`, `faraz` and ` FARAZ ` are one person and one storage key. This is deliberate — it makes rejoining from a second device free, and makes the name-collision failure mode visible rather than silent.

**One storage key per person.** `bs:v1:<CODE>:meta` (bill, written once by the initiator, plus the leftovers toggle) and `bs:v1:<CODE>:c:<slug>` (one per person, only that person writes it). Never write another member's key — the concurrency case this design exists for is eight people tapping at once.

**The bill is frozen when the split opens.** `lines[]` entries carry `{id, name, qty, amt}` with `amt` already resolved, so members never re-derive pricing mode, tax or rounding. No post-open editing in the MVP.

**Codes** are 4 characters from an unambiguous alphabet (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — no I, O, 0, 1).

## Extraction

Gemini Flash on the AI Studio free tier while building; a paid key behind the Worker before any external user touches it (the free tier's training clause, not its rate limit, is the blocker). Non-negotiables: resize client-side to 1,400 px long side / JPEG 0.75 before upload, use `responseMimeType: "application/json"` with a `responseSchema` rather than parsing prose, set `thinkingConfig.thinkingBudget: 0`, validate line sums against the printed subtotal, always show the human review screen, and never retain the photo.

The prototype calls Claude Sonnet instead, because that is the only endpoint available inside an artifact. Swapping extractors is a change to one function (`readBill`).

## Camera

Live `getUserMedia` viewfinder, `facingMode: { ideal: "environment" }`, `<video>` must be both `playsInline` and `muted` or iOS Safari goes fullscreen. The shutter draws the frame to a canvas and encodes straight to JPEG — the frame never becomes a file. Stop all tracks on leaving the screen and on unmount. `<input type="file" capture="environment">` is the fallback for `NotAllowedError` and for missing `getUserMedia`, never the primary path.

## Things that bit, and now have tests

Each of these was a real bug found by running the app, not a hypothetical:

- **Joining wiped your claims.** Registering an empty record unconditionally erased what you had tapped. `doJoin` now reads before writing.
- **Two owners of `mine`.** The join fetch and the poll both wrote local claims, so an in-flight poll clobbered the fresher answer. `adopted` ref in `App.tsx` settles ownership.
- **Upstash batches** go to `/multi-exec`, not the base URL. Posting to the root fails with "unsupported arg type".
- **`cleanUrls` 308s `/app.html` → `/app`**, so the rewrite target must be `/app` or the code in the URL is thrown away.
- **The poll ran at ~2x.** Keying the timer effect on `state` tore it down on every arriving claim. It is keyed on the bill's open time now.
- **Chip colours collided** — hash-to-palette put two people at a table on the same colour. `paletteFor` resolves collisions off a sorted key list so every device agrees.

## Design language

`src/styles/journal.css` is the whole aesthetic as tokens and primitives; screens compose from it and never invent a colour, shadow or rotation.

- **Light is the default**, whatever the OS says. Dark is opt-in via the toggle (light → dark → follow-system), applied inline before first paint so static pages never flash.
- **Rotation is deterministic** (`src/lib/tilt.ts`) and sized by element: `scrap` (−4°..+11°) for chips and stubs, `card` (−1.4°..+1.8°) for full-width blocks. A full-width card at 9° reads as a broken layout, not a hand-placed one.
- **Dashed rules and input underlines are the brief**; dashed *boxes* are not. Small controls are paper with a hard offset shadow.
- **Every money amount** is `.amt` (Courier Prime, tabular). Handwriting faces have no tabular figures, and spec §8 is emphatic that figures people compare must line up.
- Everything flattens under `prefers-reduced-motion`.
