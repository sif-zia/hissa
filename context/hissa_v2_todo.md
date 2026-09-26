# Hissa v2 — shipping checklist

The execution list for `hissa_v2_plan.md`. Section numbers (§) refer to that plan. Work top to bottom: each phase leaves the app working and ends with green tests and a commit. Tick boxes as you go.

**Standing rules for every phase** (from CLAUDE.md, the ones most likely to be broken):
- Money stays integer minor units. Floats only at parse time.
- Never write another member's storage key.
- Nothing prefixed `VITE_`.
- Every amount uses `.amt`.
- Screens compose from `journal.css`, never inventing a colour, shadow or rotation.
- Everything flattens under `prefers-reduced-motion`.
- No new runtime dependencies. Check bundle size at the end of each phase.

---

## Phase 0 — Prep

- [x] Branch `v2` from `master`.
- [ ] Baseline, and write the numbers down in the PR description:
  - [x] `pnpm test` is green (79 tests).
  - [x] `pnpm build` passes.
  - [x] Gzipped size of the app JS chunk(s) and of the landing HTML+CSS: `gzip -c dist/assets/*.js | wc -c` per file. _baseline: app JS 17.91 KB gz; landing HTML 3.01 KB + CSS 3.82 KB gz_
- [ ] Vercel: `vercel env ls` shows `GEMINI_API_KEY` and the Upstash URL/token (`UPSTASH_REDIS_REST_*` or `KV_REST_API_*`; `api/_lib/redis.ts` accepts either) for **Preview** as well as Production. Add any that are missing, or preview deploys can't be tested end to end. _GEMINI_API_KEY is Production-only; Upstash vars cover all envs. Add Gemini to Preview in Phase 10_
- [x] Font glyph check (§11). Confirm `½ ⅓ ¼ ⅔ ¾ ✓ ● ⚡` exist in `public/fonts/hissa-ledger*.woff2` and `hissa-scrawl.woff2`. _fonts.sh subsets include ✓ → — × but not ½ ⅓ ¼ ● ·. No rebuild: shares write 1/2, and the image draws dots and ticks as shapes_
  - [x] If they're missing, either add them via `tools/fonts.sh`, keeping the fonts total ≤ 64 KB (it's already over the 45 KB target; don't grow it), or plan to fall back to `1/2` and canvas paths. Record which.
- [ ] Receipt set for extraction checks: 8–10 real bill photos in a **gitignored** folder (`tools/receipts/`, added to `.gitignore`; photos are never committed). For each, note the printed subtotal, total and the true arrangement. Cover at least:
  - [ ] GST only
  - [ ] GST + service charge
  - [ ] discount before tax
  - [ ] discount after tax
  - [ ] a flat discount
  - [ ] a printed tip
  - [ ] no tax at all
  - [ ] a long bill (20+ lines)
  - [ ] a crumpled or low-light photo
- [x] Decide how production deploys happen (git integration vs `vercel --prod`) by checking the project's Git settings in the dashboard. Record it here: `vercel --prod` (CLI). _every deploy so far is CLI `vercel --prod`, with no git integration_

---

## Phase 1 — Identity and entry (§1, §2, §4)

### Code
- [x] `src/lib/cache.ts`: `loadName()` / `saveName()` on `hissa:name`, a JSON string with **no `at`**.
- [x] New `src/screens/Name.tsx`, entry no. 00 "who's this?":
  - [x] one `Write` field, `maxLength={24}`, `autoComplete="given-name"`, autofocus
  - [x] a `that's me →` button, disabled while the field is blank
  - [x] a back arrow only when changing an existing name
- [x] `App.tsx`: no stored name → render `Name` before anything, **including on `/s/CODE`**. After saving, carry on to where the user was going: home, or the join for that code.
- [ ] `Home.tsx`:
  - [x] header line `hi {name} · not you?`, where `not you?` opens `Name` prefilled
  - [x] a quiet `how it works →` link to `/?about`
- [x] `/s/CODE` with a stored name and no `hissa:me:CODE`: run the existing `doJoin` logic with the stored name (read before write, same `adopted` ref handling). No join form.
- [x] `Join.tsx` (from home): remove the name field, so it asks for the code only and uses the stored name. _the name field stays only for the `not {name}?` switch, which needs a name for that one split_
- [x] `not {name}?` on the split is unchanged: it changes only that split's identity, not `hissa:name`.
- [x] `index.html` inline head script: the redirect line from §2, inside the existing `try`, targeting **`/app`**. Leave `how-it-works.html` alone.
- [ ] Labels:
  - [x] `src/screens/Split.tsx:157`: `learned →` → `fyi →`
  - [x] `how-it-works.html:129`: `data-label="learned"` → `data-label="note"`

### Unit tests
- [x] `hissa:name`, `hissa:steps` and `hissa:withItems` survive `sweep()` with the clock moved forward 25h. Stub `localStorage` and `Date.now`.
- [x] `hissa:round` **is** swept after 24h.
- [x] Reading `index.html` as text: the redirect targets `/app` (not `/app.html`), checks `about`, and sits inside a `try`.
- [ ] If the join logic moves out of `App.tsx`, keep a test that joining with an existing record does **not** write empty claims (regression: "Joining wiped your claims"). _it stayed in `App.tsx`, so the existing guard stands_

### Manual check (`pnpm dev`)
- [ ] Fresh profile: `/app.html` → name screen → home shows `hi …`. Reload: no ask.
- [ ] Change name via `not you?`. The new name shows. Open splits keep their old identity.
- [ ] `/` with a name → lands on the app. `/?about` stays on the landing page. Without a name, `/` stays on the landing page.

- [ ] Commit: "Ask for a name once; skip the landing for returning users".

---

## Phase 2 — Steps maths (§3.1–3.4, pure `src/lib/money.ts`)

### Code
- [x] Types: `Kind`, `Steps`, and `adj: Record<Kind, { mode: AmountMode; val: string }>` on `DraftBill` in place of `gst` / `discount` / `tip`. GST mode is fixed to `pct`. Add `steps: Steps` and `printedTotal?: number` (minor units).
- [x] `active(bill)`: the kinds with a value above 0.
- [x] `normalise(steps, active)`: drop inactive kinds and empty groups, and put a newly active kind where the remembered steps place it, else in the last group.
- [x] `apply(subtotal, adj, steps)`: returns per-kind `{ amt, base }`, clamps the total at ≥ 0, and rounds per row.
- [x] `compute(bill)` goes through `apply`. `Totals` gains `serviceAmt` and `bases`.
- [x] `arrangements(kinds)`: every ordered set partition (1, 3, 13 and 75 for 1–4 kinds).
- [x] `outcomes(bill, printedTotal?)`:
  - [x] Enumerate, compute each total, and dedupe by total. The representative is the one with the fewest groups, ties broken by canonical kind order (service, gst, discount, tip).
  - [x] Rank: bill match (within 100 minor units) first, then the current arrangement, then fewest groups.
  - [x] Return `{ visible: max 4, more: rest }`.
- [x] `sentence(steps, adj)`:
  - [x] one group → `all on the food`
  - [x] otherwise `{g1} on the food, then {g2}, then {g3}`, with names joined by ` & `
  - [x] all groups of one → `one after another`, adding `: a → b → c` only when a flat row makes the order matter
- [x] `detect(bill, llmSteps, printedTotal)`: the three-step rule from §3.3. Returns `{ steps, matched: boolean }`.
- [x] Default steps: `[["service","gst"],["discount","tip"]]`.

### Unit tests (`tests/money.test.ts`, extend it)
- [x] **Every existing compute case passes unchanged** under the default steps. This is the regression net for today's rule.
- [x] All on the subtotal: 3000 + 16% gst + 10% discount + 5% tip = 3330.
- [x] Gst first, then discount & tip = 3306.
- [x] One after another gives the same total regardless of order when all rows are %.
- [x] A flat discount makes order matter: two arrangements give different totals.
- [x] Three % rows → exactly 5 distinct outcomes. Four % rows → `visible.length === 4` and `more.length > 0`.
- [x] 0 or 1 active rows, or only flat amounts → one outcome, so the UI line hides.
- [x] `normalise` drops empty groups and places a newly filled kind correctly.
- [ ] `detect`:
  - [x] accepts the LLM's steps within Rs 1
  - [x] finds the right arrangement when the LLM is wrong
  - [x] returns `matched: false` with the LLM's steps when nothing fits
  - [x] uses the LLM's steps when there's no printed total
- [x] A discount above the running total clamps the total to 0.
- [x] All results are integers (no float leaks): assert `Number.isInteger` on every amount.
- [x] `sentence` output for each shape above.

- [ ] Commit: "Model tax, discount, tip and service as steps".

---

## Phase 3 — Editor and extraction (§3.2, §3.3, §8)

### API (`api/extract.ts`)
- [x] Schema: `adjustments[{ kind (enum), pct, amount, step }]`, `printedTotal`, `place`, keeping `printedSubtotal`.
- [ ] Prompt additions:
  - [x] step semantics
  - [x] a service charge is its own kind, never a tip
  - [x] a tip only if one is printed
  - [x] `place` = the business name from the header, or ""
- [ ] Clamp and validate:
  - [x] kind in the enum, max one of each
  - [x] `step` 1–4
  - [x] pct 0–100
  - [x] amounts finite and ≥ 0
  - [x] `place` ≤ 40 characters
- [x] **Keep `gstPct`, `discount` and `tip` in the response**, derived from `adjustments`, for installed v1 clients (§8). Add a `TODO(v2+1w)` comment to remove them.
- [x] `suspect` is unchanged.

### API (`api/bill/index.ts`, `api/_lib/bill.ts`)
- [x] Accept and clamp `serviceAmt`, and store it on the meta.
- [x] `billName` fallback becomes `"the bill"` (drop `randCode(3)`).
- [x] `gstPct`: `clampInt` rounds 17.5 → 18. It's display-only, but store it rounded to 2 decimals instead.
- [x] `src/lib/split.ts` `BillMeta`: `serviceAmt?: number`, read as `?? 0`.

### Client
- [x] `src/lib/api.ts` `extract()` types for the new response.
- [x] `App.tsx` `readShot`: build `adj` from `adjustments`, pick the mode (pct if > 0, else flat amount), run `detect()`, and set `suspect` (a new `stepsMismatch` flag) and `printedTotal`. _moved into a pure `draftFrom()` in `src/lib/reading.ts`. The editor derives the mismatch live from `outcomes()`, so no `stepsMismatch` flag is stored_
- [x] `blank()`: `adj` empty, `steps` from `hissa:steps` or the default.
- [ ] `Editor.tsx`:
  - [x] Rows in fixed order: service (hidden unless active or added via `+ service charge`), gst %, discount flat/%, tip flat/%.
  - [x] Totals sticky: each % row shows `N% of {base}` when its base differs from the subtotal.
  - [x] The `worked out: … ▾` line, only when `outcomes` has 2 or more entries.
  - [x] Its inline radio list: 44px rows, sentence plus `.amt` total, `✓ bill` on the match, and `more ways (n)` expanding the rest. Picking one sets `steps` and closes the list.
  - [x] `the bill says Rs X ✓` under the total when `printedTotal` is known.
  - [x] `heads up` sticky text for a steps mismatch (§3.3 step 3), separate from the subtotal mismatch.
  - [x] Radio semantics: `role="radiogroup"` / `aria-checked`, reachable by keyboard.
- [x] Save `hissa:steps` when a bill leaves the editor for any split (link, pass the phone, equal).

### Unit tests
- [x] `tests/validation.test.ts`: the extract clamping (bad kind dropped, duplicate kinds dropped, step clamped, legacy fields present and consistent). _in `tests/reading.test.ts`, next to the client half_
- [x] `serviceAmt` clamp, and the `"the bill"` fallback. _`clampPct` is tested. The `serviceAmt` clamp is the existing, already-tested `clampInt`, and the fallback is a literal_

### Manual check
- [ ] Manual bill: fill gst only → no line. Add a % discount → the line appears with 2 options. Pick one → the total and `of {base}` update. Next manual bill starts with that arrangement.
- [ ] `vercel dev` with a real key: run 3 receipts from the set and check detection plus `✓ bill`.

- [ ] Commit: "Detect and choose how extras stack; read service charge".

---

## Phase 4 — Chooser and bill name (§5)

- [x] `src/lib/names.ts` (or inside `money.ts` if it stays tiny): `dayMeal(date)` → `saturday dinner`. Buckets: breakfast 05–11, lunch 11–16, chai 16–19, dinner 19–05. _`dayMeal` lives in `src/lib/identity.ts`_
- [x] Replace `Start.tsx` with `Chooser.tsx`, entry no. 06 "how are you splitting?":
  - [x] `what was it` field, prefilled with `place || dayMeal(now)`; cleared means the fallback
  - [x] two `.choice` cards: `share the link` (everyone taps on their own phone · recommended for 5 or more) and `pass the phone` (one phone goes round the table · recommended for under 5)
- [x] `openSplit`: host comes from `hissa:name`, and the bill name is always sent.
- [x] Remove `hostName` state and any Start leftovers from `App.tsx`.
- [x] Test: `dayMeal` at the bucket edges (04:59, 05:00, 10:59, 11:00, 15:59, 16:00, 18:59, 19:00, 23:59).
- [ ] Commit: "One chooser after the editor; name bills after the place".

---

## Phase 5 — Pass the phone (§6)

### Code
- [x] Extract `ItemList` (rows, chips, the `×N` stepper on the active person) from `Split.tsx` into `src/ui.tsx` or `src/screens/ItemList.tsx`, then **rewire `Split.tsx` to it first**. The live split must look and behave identically before going further.
- [x] `src/lib/round.ts`:
  - [x] `Round = { meta: BillMeta; people: Person[]; turn: number | "tally"; splitUnclaimed: boolean; at }`
  - [x] `loadRound()` / `saveRound()` / `clearRound()` on `hissa:round` _no `clearRound`: a new round simply replaces the old one_
  - [x] `dupes(names)` → indices whose normalised names collide
- [x] `Table.tsx`, entry no. 07 "who's at the table":
  - [x] the stepper and inputs are one list, minimum 1, no maximum
  - [x] row 1 prefilled with the stored name
  - [x] `+` appends an input and focuses it; Enter moves to the next input or appends one
  - [x] `−` removes the last input
  - [x] every name is required
  - [x] duplicates get the inline scrawl `two saras → add an initial` and block start
  - [x] the button reads `start → {first} goes first`
- [x] `Turn.tsx`, entry no. 08:
  - [x] handoff card `it's {name}'s turn` / `pass the phone to {name}` / `[ i'm {name} → ]` for everyone except person 1
  - [x] then `ItemList`, with earlier people's chips read-only
  - [x] bar: `{name}'s hissa Rs X` + `done → pass to {next}`; for the last person, `done → see the tally`
  - [x] back goes to the previous turn, or to entry 07 from person 1, keeping names and claims
- [x] `Tally.tsx`, entry no. 09:
  - [x] `who owes what` with palette dots
  - [x] `nobody's claimed` + `share leftovers` toggle
  - [x] `tap a name to redo their turn`, which reopens that turn with no handoff card and a bar reading `done → back to the tally`
  - [ ] share block (Phase 6)
- [x] Save the round on every tap and every step.
- [x] Home: one stub `{billName} · {name}'s turn →` / `· tally →` next to `still open`, which resumes.
- [x] Starting a new round replaces the old one. Leaving the tally keeps the round until it's swept, so it can be re-shared.
- [x] Changing the table (entry 07) after claims exist: removing a person drops their claims, and renaming keeps them. Index people by position while on entry 07 and re-key on start. _`seat()` carries claims by position_

### Unit tests
- [x] `dupes`: case, whitespace, and three-way collisions.
- [x] The tally equals `spread` + `shareOf` for fixed claims, and Σ shares = total when nothing's loose and leftovers are off (±n minor units of rounding, bounded by the number of people; assert that bound).
- [x] Leftovers on, with one person claiming nothing: that person pays 0.
- [x] `loadRound` on corrupt JSON returns null.

### Manual check
- [x] 3 people, including a shared plate with ×2 portions. Redo person 2. Reload mid-turn, resume from the home stub, and land on the same turn. _done in Chrome: dupe blocked, handoff on turns 2-3 only, chips carried forward, redo, reload and resume from the stub, tally sum 3,074 = bill_

- [ ] Commit: "Pass the phone".

---

## Phase 6 — Sharing (§7)

### Code
- [x] `spread()` also returns `cuts: Record<lineId, Record<key, number>>` (it already computes them; don't recompute elsewhere).
- [x] `src/lib/summary.ts`:
  - [x] `summary(meta, people, { withItems, splitUnclaimed })` → `{ title, date, rows: [{ name, colour, amt, items?: [{ name, frac, amt }] }], total, loose }` _as `billSummary()`; each person's items end with an `extras` line so they add up to that person's number_
  - [x] `fraction(portions, units)` → `½ ⅓ ¼ ⅔ ¾`, else `a/b`, else "" for whole _always plain `1/2`: the subset fonts carry no ½ glyph_
  - [x] `text(summary)` → the plain-lines format from §7
  - [x] `equalText(total, n, cur)` _as `equalSummary()`, so equal split gets a card too_
- [x] `src/lib/card.ts`:
  - [x] `drawCard(summary)` → `Promise<Blob>`: canvas 1080 wide, height from rows, **light palette constants** (not CSS variables, so the viewer's theme can't leak in)
  - [x] await `document.fonts.load()` for all three faces first
  - [x] dashed rule, dots, `split with hissa` footer
- [x] `src/lib/share.ts`:
  - [x] `shareImage(blob, text, filename)`: `navigator.canShare({ files })` → `navigator.share`, otherwise an `<a download>` fallback, with `AbortError` treated as nothing happening (as in the existing `share()`)
  - [x] `copy` reused for text
- [x] `ShareBlock` component:
  - [x] a `with items` toggle (hidden for equal split), persisted in `hissa:withItems`
  - [x] `share as image` and `copy` buttons
  - [x] toasts: `copied`, `shared`, `saved`
  - [x] **pre-render the PNG** in an effect keyed on the summary and toggle (debounced ~300ms), so the tap never awaits fonts or `toBlob` (the iOS user-activation rule)
- [ ] Place it on:
  - [x] `EqualSplit.tsx`, under the number
  - [x] `Tally.tsx`
  - [x] `Split.tsx`, under `who owes what`, with `nobody's claimed Rs X` in the output when above 0

### Unit tests
- [x] `text()` with and without items, with leftovers shared and with some unclaimed.
- [x] `fraction`: 1/2 → ½, 2/4 → ½, 2/5 → `2/5`, 3/3 → "".
- [x] `equalText` for even and uneven splits.
- [x] The amounts in `text()` equal `shareOf` for each person (no second maths path).

- [ ] Commit: "Share the result as text or an image".

---

## Phase 7 — Full-screen camera (§7a)

### Code
- [ ] `useCamera`:
  - [ ] after play, read `track.getCapabilities?.()` on `loadedmetadata` and again ~500ms later
  - [ ] expose `caps: { focus: boolean; torch: boolean }`
  - [ ] `focusAt(x, y)`: `single-shot` + `pointsOfInterest`, back to `continuous` after 3s, each wrapped in try/catch
  - [ ] `setTorch(on)`
  - [ ] `stop()` still runs on every exit path
- [ ] `src/lib/image.ts` (or a new helper): `frameCoords(tap, rect, videoW, videoH)` mapping a tap through the `object-fit: cover` crop to 0–1 frame coordinates.
- [ ] `Capture.tsx` live state:
  - [ ] a `.cam` fixed layer with safe-area padding and body scroll locked
  - [ ] top: `✕` stub (back) and a flash stub **only if** `caps.torch` (`aria-pressed`)
  - [ ] SVG pencil corner marks
  - [ ] a taped scrawl note that fades after ~1.5s
  - [ ] a focus ring at the tap point on every tap on the video; `focusAt` only if `caps.focus`
  - [ ] bottom: `upload` stub (the existing file input) and the paper shutter
  - [ ] errors as a sticky over the video
  - [ ] hide the theme toggle and page head on this screen
- [ ] Blocked states (denied, unavailable) keep the current sheet layout.
- [ ] `journal.css`: `.cam`, corner marks, focus ring, and the note fade, all from existing tokens. Under `prefers-reduced-motion`: no fade and no ring animation.

### Unit tests
- [ ] `frameCoords`: a portrait element over a landscape frame, a landscape element over a portrait frame, a tap at the centre → (0.5, 0.5), taps at the corners stay within 0–1.

### Manual check
- [ ] Android Chrome: flash toggles the torch, and tap-to-focus visibly refocuses on a near object.
- [ ] iPhone Safari: no flash stub if unsupported, the ring shows, no fullscreen-video takeover, and the camera indicator goes off after leaving.

- [ ] Commit: "Full-screen camera with focus and flash".

---

## Phase 8 — End-to-end tests

Driven through the **Claude-in-Chrome extension** in the user's Chrome, with no Playwright and no new dependency. The trade-off: the pass isn't a committed, re-runnable suite, and there's no WebKit engine. Real iOS Safari is covered by the Phase 10 device matrix. Each flow is recorded as a GIF.

### Setup
- [ ] `vercel dev` running (client + `/api` + real Upstash, and real Gemini from `.env.local`).
- [ ] A fresh tab at a phone-sized window (≈ 390×844) for every flow. Clear `hissa:*` localStorage between flows with the page's JS console.
- [ ] Synthetic receipts: render a receipt in a page canvas, encode it to JPEG, and POST it to `/api/extract` from the page, one per arrangement (gst only; gst + service; discount before tax; discount after tax; flat discount; printed tip). This stands in for the real-photo set until one exists.

### Flows
- [ ] **Name:** first visit asks; reload doesn't; `not you?` changes it; a `/s/CODE` link without a name asks first, then joins.
- [ ] **Landing:** no name → landing page; with a name → `/app`; `/?about` stays; `/how-it-works` never redirects.
- [ ] **Extras (manual bill):**
  - [ ] the worked-out line shows and hides at the right times
  - [ ] picking an option changes the total and the `of {base}` labels
  - [ ] the arrangement is remembered for the next manual bill
  - [ ] `+ service charge` shows the row
- [ ] **Detection (synthetic receipts through real Gemini):**
  - [ ] the schema is accepted (no 400/502)
  - [ ] `✓ bill` shows when the printed total matches
  - [ ] a wrong model stacking gets corrected
  - [ ] the heads-up shows when nothing fits
  - [ ] `place` prefills the chooser
- [ ] **Chooser:** the place prefill, the day + meal fallback, and both cards routing correctly.
- [ ] **Pass the phone:**
  - [ ] 3 people; a duplicate name blocks start
  - [ ] handoff cards for persons 2 and 3 only
  - [ ] earlier chips visible on later turns
  - [ ] the tally sum equals the bill total
  - [ ] redo person 2 and the tally updates
  - [ ] the leftovers toggle
- [ ] **Resume:** reload mid-round → the home stub → the same turn.
- [ ] **Share:**
  - [ ] copy text with and without items (read back from the clipboard); the toggle survives a reload
  - [ ] `share as image` on desktop Chrome falls back to a PNG download; the downloaded card is inspected visually
  - [ ] equal-split text
- [ ] **Link split:** the host opens a split in one tab; a second tab with a different stored name opens `/s/CODE` and is auto-joined with no form; the guest's tap appears for the host within about 5s; the snapshot share includes `nobody's claimed` when above 0.
- [ ] **Camera:**
  - [ ] the `.cam` layer fills the viewport
  - [ ] the shutter → preview (the Mac webcam stands in for the phone camera)
  - [ ] no flash stub (no torch on a webcam)
  - [ ] a tap draws the ring
  - [ ] `✕` returns home
  - [ ] the camera light goes off after leaving
- [ ] **Theme and motion:** light and dark on every new screen. Reduced motion is checked by forcing the media query through DevTools rendering emulation, or noted if the extension can't.

### Gate
- [ ] `pnpm test` is green, and every flow above passes or has a noted, fixed defect.

---

## Phase 9 — Docs

- [ ] `CLAUDE.md`:
  - [ ] Rewrite "Order of operations at bill level" as the steps rule, with the default arrangement.
  - [ ] Screens: name → home → capture → preview → editor → (equal | chooser → link split | table → turns → tally), plus join.
  - [ ] Update the test count.
  - [ ] Add to "Things that bit": the `sweep()` vs un-`at`ed keys issue, and pre-rendering the PNG for iOS share, if either actually bit.
  - [ ] Add the new localStorage keys under the invariants.
  - [ ] Update the budget line with measured numbers.
- [ ] `README.md`: screens, budgets table, and `GEMINI_MODEL` unchanged.
- [ ] `context/hissa_spec.md`: a one-line pointer at §3.1 to `hissa_v2_plan.md` §3 (don't rewrite the spec).
- [ ] `index.html` / `how-it-works.html` copy: mention pass the phone and sharing in "how it goes", and update the JSON-LD `featureList`. The landing page stays zero-JS apart from the inline head script.
- [ ] Commit: "Document v2".

---

## Phase 10 — Preview deployment and verification

- [ ] `pnpm build` passes, and `tsc -b` is clean.
- [ ] Budget check against the Phase 0 baseline:
  - [ ] app JS ≤ 25 KB gz (estimate 23–25)
  - [ ] landing critical path unchanged apart from one inline line
  - [ ] fonts ≤ 64 KB
  - [ ] **no new runtime dependencies** in `package.json`
- [ ] `vercel` (preview) from the `v2` branch, and note the URL.
- [ ] If Deployment Protection blocks automation, use a bypass token for the smoke run rather than turning protection off.
- [ ] **Routing, verified on the deployment and not on `vercel dev`** (CLAUDE.md):
  - [ ] `/s/CODE` rewrite
  - [ ] `/app.html` → `/app` 308
  - [ ] `/` redirect with a name
  - [ ] `/?about`
  - [ ] `/how-it-works`
  - [ ] `noindex` still on the app, and canonical and OG still correct on `/`
- [ ] Re-run the Name, Link split and Detection flows (Phase 8) against the preview URL through the Chrome extension.
- [ ] Real extraction on the preview: run the full receipt set. Record per receipt the items, the subtotal flag, the detected arrangement, `✓ bill` yes/no, and `place`.
  - [ ] **Bar: the arrangement is right on ≥ 8 of 10**, and the heads-up fires on every one that's wrong.
  - [ ] Below the bar, tune the prompt, not the maths.
- [ ] Device matrix, in the browser **and** as an installed PWA:
  - [ ] iPhone Safari (the current iOS version and the one before)
  - [ ] Android Chrome
  - [ ] desktop Chrome, Safari and Firefox (share falls back to download, and the camera works on the webcam or falls back)
  - [ ] Check on each:
    - [ ] light and dark
    - [ ] reduced motion
    - [ ] VoiceOver/TalkBack on the name screen, the worked-out list and the tally
    - [ ] 44px targets on the new controls
- [ ] Share targets: send the image and the text to WhatsApp, iMessage and Slack. The image thumbnail should be legible; the text should have no broken characters (check `½`, `—`, `·`).
- [ ] **v1 client compatibility:**
  - [ ] Before deploying the preview, install the current production PWA on a test phone.
  - [ ] After promoting (Phase 11), photograph a bill *before* it auto-updates. It must still extract, which the legacy fields guarantee.
  - [ ] Reopen it and confirm it picks up v2.
  - [ ] Also open a bill created by v2 in a v1 tab: the totals must display, since `serviceAmt` is additive.
- [ ] Performance on the preview: Lighthouse mobile on `/` and `/app`, CLS 0, and TTFB in line with the README numbers.
- [ ] Commit any fixes, then re-run the smoke run.

---

## Phase 11 — Production

- [ ] Open a PR `v2` → `master` with the plan link, the before/after budgets, the receipt table and the device matrix results. Merge after review.
- [ ] Deploy production using the method recorded in Phase 0 (`vercel --prod`, or the merge if git integration is on).
- [ ] Note the previous production deployment URL first, as the rollback target.
- [ ] Post-deploy on `https://hissa.itisamzia.dev`:
  - [ ] Re-run the Name, Link split and Detection flows against production through the Chrome extension
  - [ ] one real receipt end to end, both split types, share image to a real chat
  - [ ] the v1 compatibility check from Phase 10
- [ ] Watch for 24h: `vercel logs` for 4xx/5xx on `/api/extract` and `/api/bill*`, and Gemini 400/404s (model or schema rejections), and Upstash usage.
- [ ] **Rollback:**
  - [ ] `vercel rollback <previous-url>`.
  - [ ] Data is compatible both ways: v1 ignores `serviceAmt`, and the new localStorage keys are ignored by v1.
  - [ ] Installed PWAs would hold v2 until the service worker updates again, and they keep working against the v1 API only if extract still returns the legacy fields. It does, and the v1 API ignores extra fields.
- [ ] Tag the release: `git tag v2.0.0 && git push --tags`, and bump `package.json` `version` to `2.0.0` in the release commit.

---

## Follow-up (one week after release)

- [ ] Remove the legacy `gstPct` / `discount` / `tip` fields from `/api/extract` (the `TODO(v2+1w)`), and update its validation test.
- [ ] Review the extraction logs for arrangement mismatches reported via the heads-up, and adjust the prompt.
- [ ] Revisit the fonts budget if glyphs were added in Phase 0.
