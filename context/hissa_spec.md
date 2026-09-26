# Hissa — product and technical spec

**Name:** Hissa (Urdu, حصہ: share, portion). Chosen over anything in the `Split*` family, which is crowded with Splitwise, Splid, Spliit, Splitty, Splitceipt, SplitterUp, Splyt and Split The Bill. Hissa is short, unclaimed, means exactly what the app does, and survives being shouted across a noisy table.

**Version:** 0.2
**One-line pitch:** Photograph a bill, tap what you ate, everyone sees their hissa.
**Design goal:** fewest possible steps between opening the app and seeing a number. No accounts, no login, no install.
**Form factor:** mobile-first interactive web app, installable as a PWA. Client-heavy, thin server.

---

## 1. Scope

### In scope for the MVP
- Three ways to get a bill in: photo, manual entry, or joining someone else's split.
- Bill reading from a photo using a vision model, with a mandatory human review step.
- Line items with quantity and either line total or unit price.
- GST, discount and tip.
- Two split modes: equal split, and tap-to-claim per item.
- Shared live state across devices, with an invite code and link.
- In-app camera with a live viewfinder, plus a fallback for denied permission.
- Installable PWA shell.

### Out of scope for the MVP
- Accounts, authentication, profiles.
- Payments or settlement rails.
- Bill history, receipts archive, group memory across bills.
- Currency conversion.
- Editing the bill after the split has been opened.

---

## 2. Screens and flow

```
                    ┌──────────────┐
                    │     HOME     │
                    │ 3 big buttons│
                    └──┬────┬────┬─┘
          Take a pic   │    │    │   Join a split
                       │    │    └──────────────────┐
                       │    │ Enter manually        │
              ┌────────▼─┐  │                       │
              │ CAPTURE  │  │                  ┌────▼─────┐
              │ (camera) │  │                  │   JOIN   │
              └────┬─────┘  │                  │ code+name│
                   │        │                  └────┬─────┘
             ┌─────▼─────┐  │                       │
             │ PREVIEW   │  │                       │
             │Retake/Next│  │                       │
             └─────┬─────┘  │                       │
                   │ extract│                       │
                   └───►┌───▼──────┐                │
                        │  EDITOR  │                │
                        │ lines +  │                │
                        │ GST/disc │                │
                        │ /tip     │                │
                        └──┬────┬──┘                │
             Split equally │    │ Tap to split      │
                 ┌─────────▼─┐  │                   │
                 │   EQUAL   │  │                   │
                 │ heads → ₨ │  │                   │
                 └───────────┘  │                   │
                          ┌─────▼──────┐            │
                          │   START    │            │
                          │ name +     │            │
                          │ bill name  │            │
                          └─────┬──────┘            │
                                │ creates code      │
                                │ copies invite     │
                          ┌─────▼──────┐            │
                          │   SPLIT    │◄───────────┘
                          │ tap to     │
                          │ claim      │
                          └────────────┘
```

### 2.1 Home
Three equally weighted buttons, no hierarchy games: **Take a pic**, **Enter manually**, **Join a split**. Nothing else on screen.

### 2.2 Capture
A **live in-app viewfinder**, not a file picker. `getUserMedia` with `facingMode: { ideal: "environment" }` for the rear camera, requesting 1920x1440, rendered into a `<video>` element that is `playsInline` and `muted` (iOS Safari renders fullscreen without both). A single large shutter button sits below the frame with a short instruction: fill the frame with the receipt, top to bottom.

Framing matters because a bad crop costs an extraction call and a round of confusion, so the user needs to see what the model will see.

**The frame never becomes a file.** The shutter draws the current video frame onto a canvas, scales the long side to 1,400 px and encodes JPEG at quality 0.75 in one step. That is the only image that ever leaves the device.

Requirements:

| Requirement | Why |
| --- | --- |
| Stop all tracks on leaving the screen and on unmount | A rear camera left running drains the battery and keeps the OS privacy indicator lit |
| Fallback path on `NotAllowedError` | Show a plain explanation plus a button into `<input type="file" accept="image/*" capture="environment">`, which opens the native camera app |
| Fallback path when `getUserMedia` is absent | Same file input, different copy |
| Quiet "pick a photo instead" link under the shutter | Someone photographed the bill before opening Hissa |
| Secure context | `getUserMedia` needs HTTPS. Not a constraint in production, but it is why the camera may fall back inside a sandboxed preview |

The file input is a fallback, never the primary path.

### 2.3 Preview
Shows the captured image with **Retake** and **Next**. Extraction runs on Next, not on capture, so a bad frame costs nothing. Extraction shows an inline loading label on the Next button.

If extraction fails, the app does not dead-end: it drops the user into the editor with one empty line and an explanation. Typing five lines is faster than a second failed retake.

### 2.4 Editor
The same screen for both the manual path and the post-photo path. Only difference is whether the fields arrive filled.

Per line: **name**, **quantity**, **price**. A single global toggle switches the price column between **Line total** (default) and **Price each**, because bills are inconsistent about which they print and mixing the two per row is a foot-gun.

Below the lines:

> **v2:** the order of operations below is now the *default* stacking, not the only one. See `hissa_v2_plan.md` §3.

| Field | Type | Applied to |
| --- | --- | --- |
| GST | percentage | subtotal |
| Discount | flat amount or percentage | post-GST amount |
| Tip | flat amount or percentage | post-GST amount |

A live totals block sits above the two exit buttons: **Split equally** and **Tap to split**. Both are disabled while the subtotal is zero.

### 2.5 Equal split
One number input with plus and minus buttons, and the per-head figure in large type. When the total does not divide evenly, the app says how many people pay the extra unit rather than silently rounding.

This path never touches shared storage. It is a local calculator and needs no code, no names, no network.

### 2.6 Start (initiator only)
Two fields: **your name** (required) and **bill name** (optional, replaced with a random three-letter uppercase hash such as `KQF` when blank).

On submit, in order:
1. Generate a unique 4-character code from an unambiguous alphabet (no `I`, `O`, `0`, `1`).
2. Write the frozen bill to `meta`.
3. Write the initiator's own empty claims record.
4. Copy the invite to the clipboard.
5. Land on the split screen with a toast confirming the code.

### 2.7 Split (everyone)
Item rows, tap to claim, claimer chips under each row, live per-person totals, sticky bar with your own total.

Header carries two controls: **Copy link** and the **code itself as a button** that copies the code. Either works, both are visible to every member and not just the initiator.

Next to the unclaimed figure sits a **Share leftovers** toggle. On, anything nobody has tapped is divided equally among everyone who has tapped at least one item. It is stored on the bill, so it applies for the whole group, and any member can flip it.

---

## 3. Split maths

All money is handled as integer minor units (paisa/cents). Floats are used only at parse time.

### 3.1 Bill level
```
subtotal    = Σ line amounts
gstAmt      = round(subtotal × gstPct / 100)
afterGst    = subtotal + gstAmt
discountAmt = flat ? discount : round(afterGst × discount% / 100)
tipAmt      = flat ? tip      : round(afterGst × tip% / 100)
total       = afterGst − discountAmt + tipAmt
```

### 3.2 Line level
Claiming is by **portions**, not by unit. A line with quantity 7 and total 6,790 divided across seven claimers gives exactly 970 each. Someone who had two taps their chip up to ×2 and carries two portions.

```
for each line:
    units = Σ portions claimed on the line
    person share = round(line amount × their portions / units)
    the last claimer absorbs the rounding remainder
```

This guarantees each line is fully distributed regardless of how many people tapped it, which means the group can never accidentally under-cover a line.

### 3.3 Person level
A person's subtotal share is scaled to the final total, so tax, discount and tip ride along proportionally:

```
person total = round(billTotal × personSubtotalShare / billSubtotal)
```

Unclaimed lines are shown converted to the same scale, so the "unclaimed" figure is directly comparable to what people owe.

### 3.4 Equal split
```
base  = floor(total / n)
extra = total − base × n     // 0 ≤ extra < n
extra people pay base + 1, the rest pay base
```

---

## 4. Identity

There are no accounts. A person is their **name, normalised**: trimmed, inner whitespace collapsed, lowercased. `Faraz`, `faraz` and ` FARAZ ` are one person and land on the same storage key. This is deliberate: it makes rejoining from a second device or after a refresh free, and it makes the failure mode (two real people with the same first name) obvious rather than silent.

---

## 5. Data model

All bill data is stored with `shared: true`. Personal preferences use the private scope.

| Key | Written by | Shape |
| --- | --- | --- |
| `bs:v1:<CODE>:meta` | initiator, plus any member toggling leftovers | `{code, billName, currency, lines[], subtotal, gstPct, gstAmt, discountAmt, tipAmt, total, splitUnclaimed, at}` |
| `bs:v1:<CODE>:c:<slug>` | only that person | `{name, claims: {lineId: portions}, at}` |

`lines[]` entries are `{id, name, qty, amt}` with `amt` already resolved to minor units, so members never re-derive pricing mode, tax or rounding. The bill is frozen at the moment the split opens.

### Why one key per person
Every member writes only their own key. Two people tapping at the same instant cannot clobber each other, which is the single most likely concurrency event in this app (a table of eight all tapping while the bill is being read out). Last-write-wins only applies within one person's own record, and to `meta`, which changes rarely.

### Reading
`list(prefix)` returns keys only, so a refresh costs one list plus one get per member. Poll interval is 7 seconds with a manual **Refresh** in the sticky bar. On error the interval backs off and an inline message appears; the app never blocks on a failed poll.

---

## 6. Known limits of the MVP

| Limit | Effect | Fix in v1 |
| --- | --- | --- |
| Polling, not push | Other people's taps land within ~7 seconds | WebSocket or SSE channel per bill |
| No auth | Anyone with the code can read or change the split | Signed member tokens issued at join |
| Sandboxed clipboard/URL | The invite link falls back to plain text when the page URL is not readable | Real hosted URL, `/s/<CODE>` route |
| `meta` is last-write-wins | Simultaneous leftover toggles could race | Server-side patch endpoint |
| Bill frozen at open | Forgotten item means starting a new split | Host-only edit that re-broadcasts `meta` |
| No history | Nothing to look back at | Optional account, bill archive |
| Free-tier extraction trains on uploads | Fine for our own bills, not for strangers' | Paid key, server-side, before first external user |
| Codes never expire | Namespace fills, old bills linger | 24-hour TTL, sweeper job |
| Camera falls back inside sandboxed previews | Viewfinder unavailable in the artifact prototype | Nothing to fix, works on Hissa's own HTTPS domain |

---

## 7. Reading the bill from a photo

### Chosen approach

**Gemini Flash (multimodal) on the Google AI Studio free tier**, called with the photo inline and a JSON schema, followed by a mandatory human review screen.

Two decisions sit behind that. First, a multimodal model rather than a classical OCR engine. Text recognition is not the hard part; Cloud Vision and Textract read printed thermal receipts well. The hard part is **structure**: which rows are items, which column is quantity, which is unit rate, which is line total, which trailing rows are tax, and which of two printed GST rates applies. Classical OCR returns text plus bounding boxes and leaves all of that to per-layout heuristics you then own forever. A vision model returns the structure directly.

Second, Gemini specifically, because the AI Studio free tier is the only genuinely free path here. Note that **Google Cloud Vision is a different product**: it lives on Google Cloud, needs a project with a billing account and a card on file even inside its 1,000-free-units allowance, and cannot be called with an AI Studio key at all. Different endpoint, different console, different billing.

### Free tier, what it actually gives us

| | |
| --- | --- |
| Key source | [aistudio.google.com/apikey](https://aistudio.google.com/apikey), no GCP project, no billing account, no card |
| Endpoint | `generativelanguage.googleapis.com/v1beta/models/<model>:generateContent?key=...` |
| Models | Flash and Flash-Lite tiers are free of charge. Pro tiers are paid only |
| Published limits | Around 15 requests per minute and 1,500 per day on Flash. Varies by model and project, so confirm the live figure in AI Studio |
| Cost | Zero |
| Catch | Free-tier content is used to improve Google's products. Paid tier is not |

1,500 scans per day is enormous for this app. A bill takes a group ten minutes to settle, so the free tier comfortably covers a friend group, a university batch, or an office floor without ever touching a credit card.

**The blocker on the free tier is not the rate limit, it is the training clause.** Receipt photos carry card tails, server names, table numbers and locations. That is acceptable while we are building and testing on our own bills. It stops being acceptable the moment strangers upload their receipts. The upgrade trigger for this project is therefore the first external user, not a rate-limit error.

### Cost when we outgrow the free tier

A receipt resized to 1,400 px on the long side is roughly **1,800 image tokens**. Add about 300 tokens of prompt and expect about 400 tokens of JSON back for a ten-line bill. So roughly **2,100 in, 400 out** per scan.

Rates verified against Google's Gemini API pricing page on 2 September 2026. Rupee figures assume roughly Rs 280 to the dollar.

| Model | Paid rate in/out per MTok | Per bill | 1,000 bills/mo | 10,000 bills/mo | 100,000 bills/mo |
| --- | --- | --- | --- | --- | --- |
| Gemini 2.5 Flash-Lite | $0.10 / $0.40 | $0.0004 (Rs 0.10) | $0.37 | $3.70 | $37 |
| Gemini 3.1 Flash-Lite | $0.25 / $1.50 | $0.0011 (Rs 0.32) | $1.12 | $11.25 | $113 |
| Gemini 2.5 Flash | $0.30 / $2.50 | $0.0016 (Rs 0.46) | $1.63 | $16.30 | $163 |
| Gemini 3.7 Flash | $0.75 / $3.75 | $0.0031 (Rs 0.86) | $3.08 | $30.75 | $308 |

Two rate changes to keep in view: the current Flash generation is on introductory pricing of $0.75/$3.75 that **doubles to $1.50/$7.50 on 1 January 2027**, and Gemini 2.5 Flash-Lite is reportedly scheduled for retirement in October 2026, so do not build the budget on it.

**Working plan: free tier while building, Gemini 2.5 Flash or 3.1 Flash-Lite on the paid tier at launch.** Even at ten thousand bills a month that is under twenty dollars, which is less than the hosting bill. Extraction cost will never be the thing that decides whether this app survives.

### Implementation notes that matter more than model choice

1. **Resize client-side before upload.** Longest side 1,400 px, JPEG quality 0.75. Cost is linear in pixels and a raw 12 MP phone photo costs about ten times what it needs to for no accuracy gain. This is already in the MVP.
2. **Use structured output, not prompt-and-parse.** Gemini accepts `responseMimeType: "application/json"` with a `responseSchema`, which removes the whole fenced-JSON-and-slice-between-braces dance the MVP currently does. Take it.
3. **Set the thinking budget to zero.** On the Gemini 3 models, thinking tokens bill as output, and output is five times the input rate. Receipt extraction needs no reasoning budget, and leaving it on is the one way to make this call unexpectedly expensive.
4. **Validate arithmetically.** Sum the extracted line totals against the printed subtotal. One check, catches most misreads, and tells you exactly when a retry on a stronger model is worth the extra tenth of a cent.
5. **Always show the review screen.** One wrong digit becomes a real argument at the table. Correcting three fields is cheap; disputing a settled bill is not.
6. **Never retain the photo.** Extract, discard, keep only the parsed lines.

Request shape:

```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=KEY
{
  "contents": [{ "parts": [
    { "inline_data": { "mime_type": "image/jpeg", "data": "<base64>" } },
    { "text": "<extraction prompt>" }
  ]}],
  "generationConfig": {
    "responseMimeType": "application/json",
    "responseSchema": { ...items, gstPct, discount, tip... },
    "thinkingConfig": { "thinkingBudget": 0 }
  }
}
```

### Note on the MVP artifact

The artifact prototype calls Claude Sonnet through the artifact runtime, because that is the only model endpoint available inside a Claude artifact and no external key can be held there. The extraction prompt, the resize step and the review screen are all identical to the Gemini design above, so swapping the extractor is a change to one function.

### What we are not building

- **Tesseract in the browser.** Free, but weak on faint thermal print, and it leaves the entire column-structure problem with us.
- **A fine-tuned receipt model.** No data to justify it until thousands of real bills exist, and the generic vision path will likely stay ahead anyway.
- **A hand-rolled parser over OCR boxes.** Works for the receipt you tested on, breaks at the next restaurant.

## 8. UI direction

**The MVP artifact's interface is a sample, not the design.** It exists to prove the flow and the maths. Treat it as a reference for shape and density, then build something better on the same bones.

What to keep, because it is doing real work:

- **One decision per screen.** Home asks one question. Capture asks one question. The editor is the only dense screen, and it earns it.
- **Receipt as the metaphor.** Paper surface, dashed rules between rows, right-aligned tabular figures. It tells the user what they are looking at before they read a word.
- **Tabular-lining numerals for every amount.** Money in a proportional font in a list that people scan and compare is a small, constant tax on comprehension.
- **The sticky bar.** Your own number is the reason anyone opened the app. It should never require scrolling.
- **Whole-row tap targets.** The item row is the button. Nobody aims for a checkbox while holding a plate.
- **Colour that carries meaning.** Your chip differs from everyone else's; each person's colour is derived from their name so it is stable across every row and every device.

What to improve:

- **Motion.** A claim landing from another device currently just appears. It should arrive, briefly, so people notice it happened.
- **Feedback on tap.** Haptics via `navigator.vibrate` where supported, and an immediate optimistic state change so the tap never waits on the network.
- **Typography.** The prototype uses system stacks. Pick a real typeface with proper tabular figures and set a deliberate scale.
- **Empty and loading states.** Currently plain text. They are the first thing a new user sees.
- **Thumb reach.** Primary actions belong in the lower third. The editor's Add-a-line button and the split screen's controls both sit too high for one-handed use.
- **Dark mode.** People split bills in restaurants at night.

What to avoid: a settings screen, an onboarding carousel, a tab bar, a profile, or any navigation chrome. Hissa has six screens and a code. If a new control cannot justify itself against "fewest steps to a number", it does not ship.

---

## 9. Stack

Chosen for a client-heavy, mobile-first web app with no SEO surface, no server-rendered content, and no logged-in dashboard.

| Layer | Choice | Why |
| --- | --- | --- |
| Build | **Vite** | Instant dev loop, small output. Nothing here needs a meta-framework |
| UI | **React 19 + TypeScript** | Familiar ground, and the MVP ports across unchanged |
| Runtime shim | **Preact via `preact/compat`** alias | Drops the runtime from roughly 45 KB gzipped to about 12 KB. Nothing in this app touches React internals |
| Routing | **wouter** (~1.5 KB) | Two routes: `/` and `/s/:code` |
| State | **useReducer + one context** | The entire state is a bill, a member list and a claims map. Add Zustand only when that stops fitting |
| Data fetching | none | One data source, already realtime. TanStack Query would be dead weight |
| Offline / install | **vite-plugin-pwa** | Manifest, icons, offline shell. iOS still needs `apple-touch-icon` and `apple-mobile-web-app-capable` written out by hand |
| Server | **Cloudflare Workers** | One deploy, one runtime, generous free tier |
| Bill state | **One Durable Object per bill code** | Single-threaded and addressable by name, so every write for a bill serialises through one place. This deletes the last-write-wins problem outright, and it holds WebSocket connections for live broadcast instead of a 7-second poll |
| Extraction | **Worker proxies Gemini** | Keeps the API key off the client and makes retries, model downgrades and per-device rate limits possible |
| Styling | plain CSS with custom properties | No utility framework needed for six screens. One theme file, one dark-mode block |

**Explicitly not Next.js.** No page benefits from server rendering, there is no content to index, and the app is interactive from first paint. It would add a routing and rendering layer used for none of this, in exchange for a larger bundle and a slower dev loop.

**The reasonable alternative**, if shipping fast matters more than bundle size: Next.js on Vercel with Supabase for Postgres and Realtime. API routes handle the Gemini proxy and Supabase Realtime gives the live channel without learning Durable Objects. A heavier answer, not a wrong one.

**Budget:** first meaningful paint under 2 seconds on a 3G connection, total JS under 60 KB gzipped. People open this standing outside a restaurant on bad data.

---

## 10. Path to production

1. **Backend.** A Durable Object per bill code holding `{meta, members, claims}`. The bill is immutable once opened; claims are an append-only log with current state materialised. Serialised writes remove every last-write-wins concern.
2. **Realtime.** WebSocket per bill code, broadcasting claim deltas. The 7-second poll survives only as a reconnect fallback.
3. **Routing.** `/s/<CODE>` deep link so the shared link opens straight into the join screen with the code prefilled, and the name field focused.
4. **Extraction service.** Move the Gemini call server-side and onto a paid key. Keeps the key off the client, ends the free-tier training clause, and lets you cache, retry, downgrade models, and rate limit per device. This is the first thing to do before any external user touches the app.
5. **Settlement.** Add "who pays whom" once more than one person fronts money on the same bill, which is the natural next feature after tap-to-claim.
