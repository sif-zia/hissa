# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

No application code exists yet. The repo holds two documents:

- `context/hissa_spec.md` — the product and technical spec (v0.2). Authoritative.
- `context/hissa_mvp.jsx` — a single-file React prototype built as a Claude artifact. A working reference for flow, maths and density, **not** the design and not the target architecture.

Read the spec before building anything. When the two disagree, the spec wins; the prototype's deviations are documented as artifact-runtime constraints (§7 "Note on the MVP artifact", §8 "UI direction").

## What Hissa is

Photograph a bill, tap what you ate, everyone sees their share. Mobile-first PWA, no accounts, no login, no install. The design goal is fewest steps between opening the app and seeing a number — every proposed control has to justify itself against that or it does not ship.

Six screens: home → capture → preview → editor → (equal split | start → split), plus join. The editor is the only dense screen.

## Target stack (spec §9, not yet scaffolded)

Vite + React 19 + TypeScript, aliased to Preact via `preact/compat`; wouter for two routes (`/` and `/s/:code`); `useReducer` + one context for state; plain CSS with custom properties; `vite-plugin-pwa`. Server is Cloudflare Workers with **one Durable Object per bill code** holding `{meta, members, claims}`, a WebSocket per bill for live claim deltas, and a Worker route proxying Gemini for extraction.

Explicitly rejected: Next.js, a utility CSS framework, TanStack Query, Zustand (until `useReducer` stops fitting), Tesseract, classical OCR.

Budget: under 60 KB gzipped JS, first meaningful paint under 2s on 3G. This is a real constraint, not aspiration — check any dependency against it.

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

## Prototype code that does not port

`window.storage.get/set/list` is the artifact runtime's shared KV, and the 7-second poll in `hissa_mvp.jsx` exists only because that API has no push. Both are replaced by the Durable Object and its WebSocket; the poll survives only as a reconnect fallback. Likewise the `#s=CODE` hash link is a stand-in for the real `/s/<CODE>` route.
