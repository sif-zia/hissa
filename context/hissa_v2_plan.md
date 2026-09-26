# Hissa v2 — plan

Decided in an interview on 2026-09-26. This file is the brief for v2; `hissa_spec.md` (v0.2) stays the reference for everything it doesn't change.

The design goal still holds: **fewest steps between opening the app and seeing a number.** Every control below was checked against it. Most of v2 removes steps: no name typing after the first visit, no landing page for returning users, no "who's asking" screen, and no join form for someone who has used the app before.

---

## 0. Decisions at a glance

| # | Area | Decision |
|---|---|---|
| 1 | Name | Asked once, on its own screen before home. Stored on the device. Changed from home: `hi faraz · not you?` |
| 2 | Link join | With a stored name, `/s/CODE` joins straight in. `not {name}?` on the split still switches identity for that split. |
| 3 | Landing | A returning user (stored name) is redirected from `/` to `/app`. App home links to `/?about`, which skips the redirect. |
| 4 | Adjustments | GST, discount, tip, and service charge (new, hidden until present), on 1–4 **steps**. Chosen through a single "worked out" line that lists only the distinct outcomes. |
| 5 | Auto-detect | Gemini reports the steps and the printed total. If the LLM's steps reproduce the printed total within 1 major unit, use them; otherwise search every arrangement; if nothing matches, use the LLM's steps and warn. |
| 6 | Manual default | Today's rule (`gst`, then `discount & tip`). The last-used arrangement is remembered. |
| 7 | Label | `learned →` becomes **`fyi →`** on the split screen and **`note →`** on how-it-works. |
| 8 | Chooser | `tap to split` opens one screen: the bill-name field plus two cards, **share the link** (recommended for 5 or more) and **pass the phone** (recommended for under 5). Replaces the Start screen. |
| 9 | Bill name | Prefilled with the restaurant name read from the photo, else `saturday dinner`-style. No more random three letters. |
| 10 | Pass the phone | People stepper (min 1, no max) → handoff card per person → the same tap list with earlier people's chips visible → tally with "tap a name to redo their turn". Local only, resumable from home for 24h. |
| 11 | Sharing | Copy text and share-as-image at the end of **every** split type (equal, pass the phone, live link). One remembered `with items` toggle changes both. |
| 12 | Camera | Full-screen, camera-app layout in the journal skin. Tap to focus and flash, each shown only where the device supports it. No other extras. |

---

## 1. The name

### Behaviour

- No stored name → the app opens on **entry no. 00, "who's this?"**: one field, one button. This happens before anything else, including on a `/s/CODE` link.
- Stored name → the app opens on home. The name fills every place that used to ask for it:
  - The Start screen's `your name` field is gone (see §5).
  - The Join form from home asks only for the code.
  - A `/s/CODE` link joins directly (runs today's `doJoin` with the stored name, read-before-write unchanged).
  - Pass the phone prefills person 1.
- **Change it:** home header shows `hi faraz · not you?`. Tapping `not you?` reopens entry 00 with the field prefilled and a back arrow.
- Changing the stored name **does not rename you on splits already open**. Those keep their per-split identity (`hissa:me:CODE`), because the name is the storage key and renaming would orphan your claims. `not {name}?` on a split changes only that split, as today.

```
entry no. 00                    entry no. 01
                                split a bill
who's this?                     hi faraz · not you?

your name                       [ take a pic          ]
_______________                 [ enter manually      ]
                                [ join a split        ]
[ that's me → ]
                                still open  KQF4 →  kolachi · sara's turn →
                                how it works →
```

### Storage

`hissa:name` holds the display name as a JSON string. Derive the identity with `identityOf()` each time; don't store the key.

> **Bites:** `cache.sweep()` deletes any `hissa:*` value with an `at` older than 24h. The name, the remembered steps, and the `with items` toggle must be stored **without** an `at`, or they vanish the next day. Add a test.

---

## 2. Landing redirect

In `index.html`'s existing inline head script (it already runs before paint for the theme):

```js
if (localStorage.getItem("hissa:name") && !/[?&]about\b/.test(location.search)) location.replace("/app");
```

- The target is **`/app`**, not `/app.html`. `cleanUrls` 308s `/app.html`, and chaining a 308 after a JS redirect costs a round trip.
- Crawlers have no localStorage, so nothing changes for SEO. `?about` isn't linked externally, and the canonical tag already points at `/`.
- App home gets a quiet `how it works →` link to `/?about`.
- `how-it-works.html` is never redirected.
- Wrap it in the existing `try`. A blocked-storage browser just sees the landing page.

---

## 3. Tax, discount, tip, service charge

### 3.1 The model: steps

Every adjustment sits on a **step**. Step 1's percentages are of the subtotal. Step 2's are of the running total after step 1, and so on. Rows on one step share a base. A flat amount ignores its base but still moves the running total for later steps.

```ts
type Kind = "service" | "gst" | "discount" | "tip";          // discount is the only negative
type Steps = Kind[][];                                        // ordered groups, e.g. [["gst"], ["discount", "tip"]]

run = subtotal
for (group of steps) {
  base = run
  for (k of group) amt[k] = mode[k] === "pct" ? round(base * val[k] / 100) : cents(val[k])
  run += Σ sign(k) * amt[k]
}
total = run
```

- Today's rule is exactly `[["gst"], ["discount", "tip"]]`, so every existing `money.test.ts` case must pass unchanged under the default.
- **Only active rows** (value > 0) take part. `normalise(steps, active)` drops empty kinds and empty groups. A newly filled kind goes where the remembered steps put it, or into the last step if they don't mention it.
- Rounding is per row, as today.
- GST stays %-only. Service, discount and tip are flat or %.
- Total never goes negative. Clamp it at 0 and let the existing `heads up` sticky say so.

**This replaces the CLAUDE.md invariant "Order of operations at bill level"**. Update that section and spec §3.1 when this ships. The per-person rule (`personTotal = round(total × subShare / subtotal)`) is **unchanged**, so the split screen, the server and every open link are unaffected.

### 3.2 The UI: the "worked out" line

Chosen after an adversarial review rejected per-row step tags (not discoverable, rows re-sorting under the thumb, blind cycling, and most taps changing nothing).

**The key fact:** percentages multiply, so order *within* a chain doesn't change the total. Three % rows have only **5** distinct outcomes, not 13. So people pick an **outcome**, never a structure.

- The rows stay in a **fixed order** (service, gst, discount, tip) and never move.
- The service row is hidden unless Gemini found one, or someone taps a small `+ service charge` link under the rows.
- The totals sticky shows each % row's base: `discount 10% of 3,480  − 348`. The maths is visible instead of configured.
- One handwritten line with a dashed underline sits between the rows and the total: `worked out: gst first, then discount & tip ▾`.
- Tapping it opens an inline radio list in place, not a modal:
  - Each option is a full-width target of at least 44px, with its sentence and its total.
  - Picking an option closes the list.
  - Only distinct totals are listed. Among arrangements with the same total, the one with the fewest steps represents them, with canonical kind order to break ties.
  - At most 4 are visible, in this order: the one matching the bill (`✓ bill`), then the current one, then by fewest steps. The rest sit under `more ways (n)`.
- The line **doesn't show** when there's only one distinct outcome: 0–1 active rows, or only flat amounts.
- When the photo gave a printed total, a small line under the total says `the bill says Rs 3,402 ✓` (or without the ✓ when it differs).

```
subtotal ............... Rs 3,000
service 10% ............   + 300
gst 16% ................   + 480
discount 10% of 3,780 ..   − 378
- - - - - - - - - - - - - - - - -
worked out: service & gst on the
  food, then discount  ▾
- - - - - - - - - - - - - - - - -
total .................. Rs 3,402
the bill says Rs 3,402 ✓

── tapped open ──
(•) service & gst, then discount   3,402 ✓ bill
( ) all on the food ..........     3,480
( ) one after another ........     3,531
( ) service first, then the rest   3,436
    more ways (3)
```

**Sentences** are generated, never hand-written per case:
- One step: `all on the food`.
- Otherwise: `{step 1} on the food, then {step 2}, then {step 3}`, with names joined by ` & `.
- When every step is one row: `one after another`, adding `: gst → discount → tip` only if a flat row makes the order matter.

### 3.3 Auto-detect

Gemini's schema changes (see §8). It returns each adjustment with its printed % and/or amount, a `step`, and `printedTotal`. The server passes them through, and the client decides with the same `compute()` the editor uses. Keeping it in one place makes it testable.

1. Apply the LLM's steps. If `|total − printedTotal| ≤ 100` minor units (Rs 1), use them.
2. Otherwise run through every arrangement (75 at most, for 4 rows) and take the closest one within Rs 1. On a tie, prefer the LLM's, then fewest steps.
3. Otherwise use the LLM's steps and raise the existing `heads up` sticky: `the bill says Rs 3,400 and no way of working it out gets there. check the extras.`
4. No printed total → use the LLM's steps.

The "suspect" check on line sums vs printed subtotal stays as it is.

### 3.4 Remembering

- `hissa:steps` stores the arrangement over all four kinds, e.g. `[["service","gst"],["discount","tip"]]`.
- It's written whenever a bill leaves the editor for a split, whether the arrangement was picked or detected. So "last time's order" means the last bill you actually split.
- Manual bills start from it, falling back to `[["service","gst"],["discount","tip"]]`.
- Photo bills start from detection.

---

## 4. Wording

- `src/screens/Split.tsx:157`: `learned →` → **`fyi →`** ("other people's taps land within about five seconds").
- `how-it-works.html:129`: `data-label="learned"` → **`data-label="note"`**.

No other `learned` exists in the UI. The other `→` labels (`why`, `heads up`, `can`, `expires`…) stay.

---

## 5. The chooser (replaces Start)

`tap to split` on the editor opens **entry no. 06, "how are you splitting?"**. `split equally` stays where it is.

```
entry no. 06
how are you splitting?

what was it
kolachi_______________

[ share the link               ]
  everyone taps on their own phone
  recommended for 5 or more

[ pass the phone               ]
  one phone goes round the table
  recommended for under 5
```

- **Bill name:** prefilled with `place` from extraction. Otherwise, or on manual bills, it's `{weekday} {meal}` by local time: breakfast 05–11, lunch 11–16, chai 16–19, dinner 19–05, e.g. `saturday dinner`. It's editable, and cleared means the fallback is used again.
- The server's `randCode(3)` fallback for `billName` becomes the constant `"the bill"`. The client always sends a name.
- **share the link** runs today's `openSplit` with the stored name as host.
- **pass the phone** goes to §6.
- The "recommended" hints are static. The app doesn't know the head count yet.

---

## 6. Pass the phone

Everything is **local**: no code, no server, no polling. It reuses `spread`, `shareOf`, `cutsFor` and `paletteFor` on a `BillMeta` built from `compute(bill)` with `code: ""`.

### 6.1 Entry no. 07: who's at the table

```
entry no. 07
who's at the table

        [ − ]   3   [ + ]

1  faraz____________
2  sara_____________
3  _________________
   two saras → add an initial

[ start → faraz goes first ]
```

- The stepper and the inputs are one list. `+` adds an empty input and focuses it, and Enter in an input moves to the next one or adds one. `−` removes the last input.
- The minimum is 1, and there's **no maximum**. `paletteFor` repeats colours past 8, which is acceptable.
- Row 1 is prefilled with the stored name and stays editable.
- Every name is required, so `start` is disabled until all are filled.
- Names that normalise the same (`Sara` / `sara `) get an inline scrawl, `two saras → add an initial`, and block `start`. Identity is the normalised name here too.

### 6.2 Entry no. 08: turns

**Handoff card** for every person except the first, who is already holding the phone:

```
        it's sara's turn

   pass the phone to sara

       [ i'm sara → ]
```

**Turn screen:** the same item list as the live split. Extract it from `Split.tsx` into a shared `ItemList` rather than copying it.
- Whole-row tap targets, and the `×N` stepper on your own chip.
- Earlier people's chips are visible and read-only, so shared plates show.
- The bottom bar reads `sara's hissa Rs 640` plus `done → pass to ali`. The last person's bar says `done → see the tally`.
- The back arrow goes to the previous person's turn. From person 1 it goes to entry 07, with names and claims kept.

### 6.3 Entry no. 09: the tally

```
entry no. 09
kolachi

who owes what
● faraz ................ Rs 1,120
● sara ................. Rs   640
● ali .................. Rs 1,546
- - - - - - - - - - - - - - - - -
nobody's claimed  Rs 0   [share leftovers]
tap a name to redo their turn

[ with items ✓ ]
[ share as image ]   [ copy ]
```

- The leftovers toggle is the same rule as live (split among people who claimed something).
- Tapping a name reopens that turn with no handoff card. Its bar says `done → back to the tally`.
- The primary action is sharing (§7).

### 6.4 Persistence and resume

- `hissa:round` holds `{ meta, people, turn, splitUnclaimed, at }` and is written on every tap.
- It **has** an `at`, so `sweep()` clears it after 24h for free.
- Home shows one stub next to the "still open" codes, `kolachi · sara's turn →` (or `kolachi · tally →`), which resumes. There's one round at a time, and starting a new one replaces it.

---

## 7. Sharing the result

At the end of **every** split type:

| Where | Content |
|---|---|
| Equal split | `3 people · Rs 1,102 each` plus `1 pays Rs 1,103` when it doesn't divide. No names, so no `with items`. |
| Pass the phone tally | Everyone's total. |
| Live link split | A snapshot of "who owes what", placed under that list. Anyone can share it at any time. Adds `nobody's claimed Rs X` when that's above 0. |

**One toggle, `with items`**, next to the buttons. It changes both the text and the image, and is remembered in `hissa:withItems` (no `at`). Per-person lines come from `cutsFor`: extend `spread()` to also return `cuts[lineId][key]`, and don't recompute. Shared portions show as a fraction of the line (`½ ⅓ ¼ ⅔ ¾`, else `2/5`). Leftovers show as a `leftovers · Rs X` line.

**Text:** plain lines that paste cleanly into WhatsApp, with no tables and no alignment tricks.

```
kolachi · sat 26 sep
faraz — Rs 1,120
  biryani ½ · Rs 450
  chai · Rs 100
sara — Rs 640
ali — Rs 1,546
total Rs 3,306

split with hissa · hissa.itisamzia.dev
```

**Image:** a totals card drawn on a `<canvas>`, with no new dependency.
- It's always the **light** palette, whatever the viewer's theme, because it's going to someone else's chat.
- It shows the bill name and date, each person with their colour dot and a Courier Prime amount, a dashed rule, the total, and a `split with hissa` footer. With items, each person's lines appear under their name.
- It's 1080px wide and as tall as its content.
- Await `document.fonts.load()` for the three faces before drawing.

**Buttons:**
- `share as image` uses `navigator.share({ files: [png], text })` when `navigator.canShare({ files })` passes, and otherwise downloads the PNG.
- `copy` always copies the text. It reuses `copy()` from `share.ts`.

> **Bites:** iOS Safari drops the share sheet when the gesture's user activation has expired, and waiting for fonts plus `toBlob` inside the tap can use it up. **Pre-render the PNG** whenever the result or the toggle changes (debounced), so the tap calls `share()` straight away.

---

## 7a. Full-screen camera

Replaces the sheet layout of `Capture.tsx` (entry 02) while the camera is live. The blocked states (denied, unavailable) keep today's sheet with the sticky note and the `open my camera` fallback, because there's no video to fill the screen.

```
┌─────────────────────────────┐
│ [✕]                 [flash] │   paper stubs, hard offset shadow
│                             │
│   ╭─                   ─╮   │   pencil-stroke corner marks (SVG)
│     fit the whole bill,     │   taped scrawl note, fades after ~1.5s
│       top to bottom         │
│              (◌)            │   hand-drawn focus ring where you tapped
│   ╰─                   ─╯   │
│                             │
│ [upload]      ( ● )         │   upload stub · paper shutter
└─────────────────────────────┘
```

**Layout**
- A `.cam` layer, `position: fixed; inset: 0; height: 100dvh`, padded with `env(safe-area-inset-*)`. The video uses `object-fit: cover`. Lock body scroll while it's mounted.
- The Fullscreen API isn't used: iPhone Safari only allows it on `<video>`, and it brings up the native player.
- Everything drawn over the video uses existing primitives (`.stub`, `.shutter`, `.sticky.tape`, `--paper`, `--shadow-hard`). The corner marks and focus ring are paper-coloured strokes with a soft ink shadow so they read on any scene. No new colours.
- The theme toggle and the page head are hidden on this screen. `✕` is the back action.
- `prefers-reduced-motion`: no fade, and no ring animation (it appears, then disappears).

**Tap to focus**
- A pointer-down on the video, not on a control, always draws the ring at the tap point.
- It asks the camera to refocus only when `track.getCapabilities().focusMode` includes `single-shot` (Chrome Android): `applyConstraints({ advanced: [{ pointsOfInterest: [{ x, y }], focusMode: "single-shot" }] })`, then back to `continuous` after ~3s.
- `x, y` are normalised to the **video frame**, not the element. `object-fit: cover` crops the frame, so map through the crop with a pure helper `frameCoords(tap, rect, videoW, videoH)` that has its own unit test.
- iOS already autofocuses continuously, so the ring there is feedback only, which is honest enough since the camera really is focusing.

**Flash**
- The stub renders **only** when `getCapabilities().torch` is true. Some Android devices fill in capabilities late, so read them on `loadedmetadata` and once more ~500ms later.
- It toggles with `applyConstraints({ advanced: [{ torch: on }] })` and `aria-pressed`.
- The torch goes off with the track, and `stop()` already runs on every exit path. Keep it that way.

**Unchanged:** `playsInline` + `muted`, `facingMode: { ideal: "environment" }`, the shutter drawing the frame straight to a canvas and JPEG, the file input as fallback only, and tracks stopped on leave and on unmount. Hide any control the device doesn't support; never show a dead button.

**Not in scope:** zoom, crop-to-visible, grid lines.

---

## 8. Data and API changes

**`/api/extract` response schema:**

```ts
{
  currency, place /* restaurant name, "" if none */, items,
  adjustments: [{ kind: "service"|"gst"|"discount"|"tip", pct: NUMBER, amount: NUMBER, step: INTEGER }],
  printedSubtotal, printedTotal
}
```

Prompt additions:
- `step` is 1 if computed on the subtotal, 2 if computed on the amount after step 1, and so on.
- A service charge is its own kind, never a tip.
- Report a tip only if one is printed.
- `place` is the business name from the header.

The server clamps and passes `adjustments`, `printedTotal` and `place` through, still computing `suspect`. The old `gstPct`/`discount`/`tip` fields **stay for one release**, derived from `adjustments`. The service worker is `autoUpdate`, so an installed v1 app can still be running after v2 deploys and would break on a response without them. Remove them in a follow-up once v2 has been live a week.

**`DraftBill`** replaces `gst`/`discount`/`tip` with `adj: Record<Kind, { mode, val }>`, plus `steps: Steps` and `printedTotal?: number`.

**`BillMeta` / `POST /api/bill`:**
- Add `serviceAmt` (clamped like the others, `?? 0` when read, so already-open bills are unaffected).
- `billName` falls back to `"the bill"`.
- No other stored shape changes. Members still never re-derive pricing.

**localStorage:**

| Key | Value | `at`? |
|---|---|---|
| `hissa:name` | display name | **no** |
| `hissa:steps` | last arrangement | **no** |
| `hissa:withItems` | boolean | **no** |
| `hissa:round` | the pass-the-phone round | yes, swept at 24h |
| `hissa:me:CODE`, `hissa:bill:CODE` | unchanged | unchanged |

---

## 9. Screen map

```
first visit ─→ 00 who's this? ─┐
                               ▼
/ (landing) ─ name stored ─→ 01 home ──┬─ take a pic → 02 capture → 03 preview ─┐
                                       ├─ enter manually ───────────────────────┤
                                       ├─ join a split → code only ─→ live split │
                                       └─ carry on stub ─→ 08 / 09               ▼
                                                                         04 editor
                                              split equally ← ───────────┤
                                                   05 equal [share]      │ tap to split
                                                                         ▼
                                                                  06 how are you splitting?
                                                   share the link ←──────┴──→ pass the phone
                                                 live split [share]           07 who's at the table
                                                                              08 turns (handoff → tap) × n
                                                                              09 tally [share]
/s/CODE ─ name stored ─→ auto-join ─→ live split
```

---

## 10. Build order

Each phase ships on its own and leaves the app working.

1. **Identity and entry.**
   - Entry 00, the home header, `hissa:name`, the Start name field removed, join from home asks only for the code, auto-join on `/s/CODE`, the landing redirect and `?about`, and the `fyi`/`note` labels.
   - Tests: name survives `sweep`, auto-join reads before writing (extend the existing test), and `index.html`'s script targets `/app` and honours `?about`.
2. **Steps maths.**
   - `money.ts`: `apply(steps)`, `normalise`, `outcomes()` (enumerate, dedupe, rank, cap), `sentence(steps)`, `detect(llmSteps, printedTotal)`.
   - Tests: every existing compute case under the default; all-on-subtotal; one after another; flats making order matter; 3 % rows → exactly 5 outcomes; 4 rows capped at 4 plus `more`; detect accepts within Rs 1, searches otherwise, and flags when nothing matches; total clamped at 0.
3. **Editor and extraction.**
   - The new schema and prompt, the `serviceAmt` pass-through, the "worked out" line and list, `+ service charge`, `the bill says`, and `hissa:steps`.
   - Check against 5–10 real receipts on a preview deployment.
4. **Chooser and bill name.** Entry 06, `dayMeal()`, `place` prefill, server fallback. Test: `dayMeal` buckets.
5. **Pass the phone.**
   - Extract `ItemList` from `Split.tsx`, then add entries 07–09, `hissa:round`, and the home resume stub.
   - Tests: duplicate-name detection, and that the tally equals `spread`/`shareOf` for the same claims (sum of shares = total when nothing's loose).
6. **Sharing.**
   - `spread()` returns `cuts`, then add `summary()` → `text()` / `drawCard()`, the `with items` toggle, and buttons on equal, tally and the live split.
   - Tests: text format with and without items, fraction glyphs, equal-split wording.
   - Manually test the share sheet on iOS Safari and Android Chrome, and the download fallback on desktop.
7. **Full-screen camera** (§7a). `useCamera` exposes `caps`, `focusAt(x, y)` and `setTorch(on)`. Rebuild the `Capture` layout. Test: `frameCoords` for portrait and landscape crops. Manually test tap-to-focus and flash on Android Chrome, and on iOS Safari check that no dead controls show and there's no fullscreen video hijack.
8. **Docs.** CLAUDE.md: the order-of-operations invariant, screen count, test count, and new "things that bit". README if it lists screens.

## 11. Budget

App JS is 17 KB gz today against a 60 KB ceiling. The estimate is **+6–8 KB** in total: steps and outcomes ~1 KB, pass the phone ~3 KB, canvas card and text ~2 KB, full-screen camera ~1 KB, entry 00 and the chooser <1 KB. There are **no new dependencies**, so html-to-image and similar libraries are ruled out. The landing critical path grows by one inline line. Fonts are unchanged.

> **Check:** the font files are subsets. Before relying on `½ ⅓ ¼ ⅔ ¾ ✓ ●` in Courier Prime or Caveat, confirm those glyphs are in `hissa-ledger.woff2` / `hissa-scrawl.woff2`. Otherwise fall back to `1/2` and draw the dot and tick as canvas paths.

## 12. Explicitly not in v2

- Converting a pass-the-phone round into a live link split.
- Reordering turns, or skipping a person.
- Flat GST.
- A bill-breakdown block (tax, discount, tip) in the shared text or image.
- Editing a bill after a split opens. It stays frozen.
