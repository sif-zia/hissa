import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { useLocation, useRoute } from "wouter-preact";

import { Home } from "./screens/Home";
import { Name } from "./screens/Name";
import { Capture } from "./screens/Capture";
import { Preview } from "./screens/Preview";
import { Editor } from "./screens/Editor";
import { EqualSplit } from "./screens/EqualSplit";
import { Chooser } from "./screens/Chooser";
import { Join } from "./screens/Join";
import { Table } from "./screens/Table";
import { Turn } from "./screens/Turn";
import { Tally } from "./screens/Tally";
import { loadRound, saveRound, seat, type Round } from "./lib/round";
import { Split } from "./screens/Split";
import { Toast } from "./ui";

import { compute, noAdj, num, type DraftBill } from "./lib/money";
import { draftFrom, rememberedSteps, rememberSteps } from "./lib/reading";
import { identityOf, uid, dayMeal, type Identity } from "./lib/identity";
import { toggleClaim, bumpClaim, type Claims } from "./lib/split";
import type { Shot } from "./lib/image";
import { createBill, extract, fetchBill, putClaims, setSplitUnclaimed, ApiError } from "./lib/api";
import { loadMe, saveMe, forgetMe, sweep, loadName, saveName } from "./lib/cache";
import { share, copy, buzz } from "./lib/share";
import { useBillSync } from "./hooks/useBillSync";

type Screen = "home" | "camera" | "preview" | "editor" | "equal" | "choose" | "join" | "table" | "turn" | "tally";

const blank = (): DraftBill => ({
  currency: "Rs",
  priceMode: "total",
  items: [{ id: uid(), name: "", qty: "1", price: "" }],
  adj: noAdj(),
  steps: rememberedSteps(),
});

export function App() {
  const [, navigate] = useLocation();
  const [onSplit, params] = useRoute("/s/:code");
  const code = onSplit ? (params?.code ?? "").toUpperCase() : null;

  const [screen, setScreen] = useState<Screen>("home");
  const [bill, setBill] = useState<DraftBill | null>(null);
  const [shot, setShot] = useState<Shot | null>(null);
  const [suspect, setSuspect] = useState(false);
  const [place, setPlace] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [heads, setHeads] = useState(2);

  const [me, setMe] = useState<Identity | null>(null);
  const [mine, setMineState] = useState<Claims>({});
  /*
   * The latest claims, readable before a re-render. Two quick taps both
   * compute from here; computing from `mine` let the second tap's write
   * (local and to the server) drop the first.
   */
  const mineRef = useRef<Claims>({});
  const setMine = (c: Claims) => {
    mineRef.current = c;
    setMineState(c);
  };

  const [myName, setMyName] = useState(loadName);
  const [renaming, setRenaming] = useState(false);
  const [billName, setBillName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  /** Set only while switching identity on one split; null means "use myName". */
  const [joinName, setJoinName] = useState<string | null>(null);

  const sync = useBillSync(code);

  /* Pass the phone: one round at a time, saved on every tap. */
  const [round, setRound] = useState<Round | null>(loadRound);
  const [seatNames, setSeatNames] = useState<string[]>([]);
  /** Back at the table from turn 1 of a round already under way. */
  const [reseat, setReseat] = useState(false);
  useEffect(() => { if (round) saveRound(round); }, [round]);

  useEffect(() => { sweep(); }, []);

  const flash = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2000);
  }, []);

  /* --- landing on /s/CODE: remember who I am, or ask --------------------- */

  // A stored name means a shared link joins straight in: no form, no typing.
  const autoJoined = useRef<string | null>(null);
  useEffect(() => {
    if (!code) {
      setMe(null);
      setMine({});
      return;
    }
    const known = loadMe(code);
    if (known) {
      setMe(known);
    } else if (myName && autoJoined.current !== code) {
      autoJoined.current = code;
      void doJoin(code, myName);
    } else {
      setJoinCode(code);
      setScreen("join");
    }
    // doJoin is recreated every render; the code and name are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, myName]);

  /*
   * Two ways in, one owner of `mine`.
   *
   * Landing on /s/CODE with a remembered name has to adopt my claims from the
   * server; joining through the form already knows them from the fetch it
   * made. This ref is what stops the second case being clobbered by a poll
   * that was in flight before I identified myself.
   */
  const adopted = useRef<string | null>(null);
  useEffect(() => {
    if (!me || !sync.state) return;
    if (adopted.current === me.key) return;
    adopted.current = me.key;
    setMine(sync.state.people.find((p) => p.key === me.key)?.claims ?? {});
  }, [me, sync.state]);

  /* --- flows ------------------------------------------------------------- */

  const readShot = async () => {
    if (!shot) return;
    setBusy(true);
    setErr("");
    try {
      const out = await extract(shot.base64);
      setSuspect(Boolean(out.suspect));
      setPlace(out.place ?? "");
      // The editor re-derives the fit live, so only the settled bill is kept.
      setBill(draftFrom(out, uid).bill);
      setScreen("editor");
    } catch {
      // Never dead-end on a failed read: typing five lines beats a retake.
      setErr("Couldn't read that one. Type the lines in — it's quicker than another retake.");
      setSuspect(false);
      setBill(blank());
      setScreen("editor");
    }
    setBusy(false);
  };

  const openSplit = async () => {
    if (!bill) return;
    const who = identityOf(myName);
    setBusy(true);
    setErr("");
    try {
      const t = compute(bill);
      const out = await createBill({
        billName: billName.trim() || place || dayMeal(),
        currency: bill.currency,
        lines: t.lines,
        subtotal: t.subtotal,
        gstPct: num(bill.adj.gst.val),
        gstAmt: t.gstAmt,
        serviceAmt: t.serviceAmt,
        discountAmt: t.discountAmt,
        tipAmt: t.tipAmt,
        total: t.total,
        host: { name: who.name, slug: who.slug },
      });
      saveMe(out.meta.code, who);
      adopted.current = who.key;
      setMe(who);
      setMine({});
      navigate(`/s/${out.meta.code}`);
      const how = await share(out.meta.code, out.meta.billName);
      flash(how === "copied" ? `invite copied · ${out.meta.code}` : `your code is ${out.meta.code}`);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Couldn't open the split. Check your connection.");
    }
    setBusy(false);
  };

  const doJoin = async (rawCode: string, rawName: string) => {
    const c = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    const who = identityOf(rawName);
    if (!c || !who.name) { setErr("Both the code and your name are needed."); return; }
    setBusy(true);
    setErr("");
    try {
      // Read before writing. Registering an empty record unconditionally
      // wiped the claims of anyone rejoining — which is exactly what this
      // screen promises will not happen.
      const res = await fetchBill(c);
      const existing = res.changed
        ? res.state.people.find((p) => p.key === who.key)
        : undefined;
      if (!existing) await putClaims(c, { name: who.name, slug: who.slug }, {});

      saveMe(c, who);
      adopted.current = who.key; // this fetch is fresher than any pending poll
      setMe(who);
      setMine(existing?.claims ?? {});
      setJoinName(null);
      setScreen("home");
      navigate(`/s/${c}`);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : `No split found with code ${c}.`);
      // An auto-join that failed lands on the form, so the code can be fixed.
      setJoinCode(c);
      setScreen("join");
    }
    setBusy(false);
  };

  /** "Not you?" — drop this device's identity and ask again. */
  const changeName = () => {
    if (!code) return;
    forgetMe(code);
    adopted.current = null;
    setMe(null);
    setMine({});
    setJoinCode(code);
    setJoinName("");
    setErr("");
    setScreen("join");
  };

  /* --- claiming: optimistic, then reconciled ---------------------------- */

  const pushClaims = useCallback(
    async (next: Claims) => {
      if (!code || !me) return;
      try {
        await putClaims(code, { name: me.name, slug: me.slug }, next);
      } catch {
        setErr("That tap didn't save. Tap it again.");
      }
    },
    [code, me],
  );

  const tap = (lineId: string) => {
    const next = toggleClaim(mineRef.current, lineId);
    buzz();
    setMine(next);
    void pushClaims(next);
  };

  const bump = (lineId: string, delta: number) => {
    const next = bumpClaim(mineRef.current, lineId, delta);
    buzz();
    setMine(next);
    void pushClaims(next);
  };

  const toggleLeftovers = async () => {
    if (!code || !sync.state) return;
    const next = !sync.state.meta.splitUnclaimed;
    sync.patch({ ...sync.state, meta: { ...sync.state.meta, splitUnclaimed: next } });
    try {
      await setSplitUnclaimed(code, next);
    } catch {
      setErr("Couldn't save that for the group.");
      sync.refresh();
    }
  };

  /* --- pass the phone ---------------------------------------------------- */

  const startRound = (names: string[]) => {
    if (reseat && round) {
      setRound({ ...round, people: seat(names, round.people), turn: 0, redo: false });
    } else if (bill) {
      const t = compute(bill);
      setRound({
        meta: {
          code: "",
          billName: billName.trim() || place || dayMeal(),
          currency: bill.currency,
          lines: t.lines,
          subtotal: t.subtotal,
          gstPct: num(bill.adj.gst.val),
          gstAmt: t.gstAmt,
          serviceAmt: t.serviceAmt,
          discountAmt: t.discountAmt,
          tipAmt: t.tipAmt,
          total: t.total,
          splitUnclaimed: false,
          at: Date.now(),
        },
        people: seat(names),
        turn: 0,
        redo: false,
        at: Date.now(),
      });
    }
    setReseat(false);
    setScreen("turn");
  };

  /**
   * Changes the claims of whoever holds the phone. Functional, so two taps
   * landing before a re-render both count instead of the second erasing
   * the first.
   */
  const claimFor = (index: number, change: (c: Claims) => Claims) => {
    buzz();
    setRound((r) => r && {
      ...r,
      people: r.people.map((p, i) => (i === index ? { ...p, claims: change(p.claims) } : p)),
    });
  };

  const goHome = () => {
    setBill(null); setShot(null); setErr(""); setSuspect(false); setPlace("");
    setBillName(""); setJoinCode(""); setJoinName(null);
    setScreen("home");
    navigate("/");
  };

  /* --- render ------------------------------------------------------------ */

  const t = bill ? compute(bill) : null;

  if (!myName || renaming) {
    return (
      <Name
        initial={myName}
        onBack={renaming ? () => setRenaming(false) : undefined}
        onSave={(n) => {
          const clean = identityOf(n).name;
          saveName(clean);
          setMyName(clean);
          setRenaming(false);
        }}
      />
    );
  }

  if (code && me && sync.state) {
    return (
      <>
        <Split
          meta={sync.state.meta}
          people={sync.state.people}
          me={me}
          mine={mine}
          onTap={tap}
          onBump={bump}
          onToggleLeftovers={toggleLeftovers}
          onCopyLink={async () => {
            const how = await share(sync.state!.meta.code, sync.state!.meta.billName);
            if (how !== "failed") flash(how === "shared" ? "shared" : "link copied");
          }}
          onCopyCode={async () => {
            flash((await copy(sync.state!.meta.code)) ? `code copied · ${sync.state!.meta.code}` : `your code is ${sync.state!.meta.code}`);
          }}
          onRefresh={sync.refresh}
          live={sync.live}
          refreshing={sync.refreshing}
          stale={sync.stale}
          error={sync.error || err}
          onBack={goHome}
          onChangeName={changeName}
          flash={flash}
        />
        <Toast message={toast} />
      </>
    );
  }

  // Joining from a link with a stored name: no form to show, just the wait.
  const autoJoining = Boolean(code && !me && busy && autoJoined.current === code);

  if ((code && me && !sync.state) || autoJoining) {
    return (
      <div class="paper">
        <div class="sheet">
          <p class="scrawl dim">{sync.error || "finding that split…"}</p>
          {sync.error ? <button class="btn btn-alt" onClick={goHome}>start over</button> : null}
        </div>
      </div>
    );
  }

  return (
    <>
      {screen === "home" && (
        <Home
          name={myName}
          onRename={() => setRenaming(true)}
          onCamera={() => { setErr(""); setScreen("camera"); }}
          onManual={() => { setErr(""); setBill(blank()); setScreen("editor"); }}
          onJoin={() => { setErr(""); setScreen("join"); }}
          onResume={(c) => navigate(`/s/${c}`)}
          round={round ? {
            label: `${round.meta.billName} · ${
              round.turn === "tally" ? "tally" : `${round.people[round.turn]?.name}'s turn`
            }`,
            open: () => setScreen(round.turn === "tally" ? "tally" : "turn"),
          } : null}
        />
      )}

      {screen === "camera" && (
        <Capture
          onShot={(s) => { setShot(s); setErr(""); setScreen("preview"); }}
          onBack={goHome}
          error={err}
          setError={setErr}
        />
      )}

      {screen === "preview" && shot && (
        <Preview
          shot={shot}
          reading={busy}
          onNext={readShot}
          onRetake={() => { setShot(null); setErr(""); setScreen("camera"); }}
          error={err}
        />
      )}

      {screen === "editor" && bill && (
        <Editor
          bill={bill}
          setBill={setBill}
          suspect={suspect}
          onEqual={() => { rememberSteps(compute(bill).steps); setScreen("equal"); }}
          onStart={() => {
            rememberSteps(compute(bill).steps);
            setErr("");
            setBillName(place || dayMeal());
            setScreen("choose");
          }}
          onBack={goHome}
        />
      )}

      {screen === "equal" && bill && t && (
        <EqualSplit
          total={t.total}
          currency={bill.currency}
          heads={heads}
          setHeads={setHeads}
          onBack={() => setScreen("editor")}
          flash={flash}
        />
      )}

      {screen === "choose" && (
        <Chooser
          billName={billName} setBillName={setBillName}
          fallback={place || dayMeal()}
          onLink={openSplit}
          onPhone={() => { setErr(""); setSeatNames([myName]); setReseat(false); setScreen("table"); }}
          onBack={() => setScreen("editor")}
          busy={busy} error={err}
        />
      )}

      {screen === "table" && (
        <Table
          initial={seatNames}
          onStart={startRound}
          onBack={() => setScreen(reseat ? "turn" : "choose")}
        />
      )}

      {screen === "turn" && round && typeof round.turn === "number" && (
        <Turn
          key={`${round.turn}-${round.redo}`}
          round={round}
          index={round.turn}
          onTap={(id) => claimFor(round.turn as number, (c) => toggleClaim(c, id))}
          onBump={(id, d) => claimFor(round.turn as number, (c) => bumpClaim(c, id, d))}
          onDone={() => {
            const i = round.turn as number;
            const end = round.redo || i >= round.people.length - 1;
            setRound({ ...round, turn: end ? "tally" : i + 1, redo: false });
            window.scrollTo(0, 0);
            if (end) setScreen("tally");
          }}
          onBack={() => {
            const i = round.turn as number;
            if (round.redo) { setRound({ ...round, turn: "tally", redo: false }); setScreen("tally"); }
            else if (i > 0) setRound({ ...round, turn: i - 1 });
            else { setSeatNames(round.people.map((p) => p.name)); setReseat(true); setScreen("table"); }
          }}
        />
      )}

      {screen === "tally" && round && (
        <Tally
          round={round}
          onRedo={(i) => { setRound({ ...round, turn: i, redo: true }); window.scrollTo(0, 0); setScreen("turn"); }}
          onToggleLeftovers={() =>
            setRound({ ...round, meta: { ...round.meta, splitUnclaimed: !round.meta.splitUnclaimed } })}
          onBack={goHome}
          flash={flash}
        />
      )}

      {screen === "join" && (
        <Join
          code={joinCode} setCode={setJoinCode}
          name={joinName ?? undefined}
          setName={joinName === null ? undefined : setJoinName}
          onGo={() => doJoin(joinCode, joinName ?? myName)} onBack={goHome}
          busy={busy} error={err}
        />
      )}

      <Toast message={toast} />
    </>
  );
}
