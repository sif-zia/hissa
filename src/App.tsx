import { useCallback, useEffect, useState } from "preact/hooks";
import { useLocation, useRoute } from "wouter-preact";

import { Home } from "./screens/Home";
import { Capture } from "./screens/Capture";
import { Preview } from "./screens/Preview";
import { Editor } from "./screens/Editor";
import { EqualSplit } from "./screens/EqualSplit";
import { Start } from "./screens/Start";
import { Join } from "./screens/Join";
import { Split } from "./screens/Split";
import { Toast } from "./ui";

import { compute, type DraftBill } from "./lib/money";
import { identityOf, uid, type Identity } from "./lib/identity";
import type { Claims } from "./lib/split";
import type { Shot } from "./lib/image";
import { createBill, extract, fetchBill, putClaims, setSplitUnclaimed, ApiError } from "./lib/api";
import { loadMe, saveMe, forgetMe, sweep } from "./lib/cache";
import { share, buzz } from "./lib/share";
import { useBillSync } from "./hooks/useBillSync";

type Screen = "home" | "camera" | "preview" | "editor" | "equal" | "start" | "join";

const blank = (): DraftBill => ({
  currency: "Rs",
  priceMode: "total",
  items: [{ id: uid(), name: "", qty: "1", price: "" }],
  gst: "",
  discount: { mode: "flat", val: "" },
  tip: { mode: "flat", val: "" },
});

export function App() {
  const [, navigate] = useLocation();
  const [onSplit, params] = useRoute("/s/:code");
  const code = onSplit ? (params?.code ?? "").toUpperCase() : null;

  const [screen, setScreen] = useState<Screen>("home");
  const [bill, setBill] = useState<DraftBill | null>(null);
  const [shot, setShot] = useState<Shot | null>(null);
  const [suspect, setSuspect] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [heads, setHeads] = useState(2);

  const [me, setMe] = useState<Identity | null>(null);
  const [mine, setMine] = useState<Claims>({});

  const [hostName, setHostName] = useState("");
  const [billName, setBillName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinName, setJoinName] = useState("");

  const sync = useBillSync(code);

  useEffect(() => { sweep(); }, []);

  const flash = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2000);
  }, []);

  /* --- landing on /s/CODE: remember who I am, or ask --------------------- */

  useEffect(() => {
    if (!code) {
      setMe(null);
      setMine({});
      return;
    }
    const known = loadMe(code);
    if (known) {
      setMe(known);
    } else {
      setJoinCode(code);
      setScreen("join");
    }
  }, [code]);

  // Adopt my own claims from the server the first time they arrive, so a
  // reload or a second device picks up where I left off.
  const serverMine = me && sync.state?.people.find((p) => p.key === me.key);
  useEffect(() => {
    if (serverMine) setMine(serverMine.claims);
    // Only on identity change: after that, local optimistic state wins.
  }, [me?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  /* --- flows ------------------------------------------------------------- */

  const readShot = async () => {
    if (!shot) return;
    setBusy(true);
    setErr("");
    try {
      const out = await extract(shot.base64);
      setSuspect(Boolean(out.suspect));
      const items = out.items.map((i) => ({
        id: uid(),
        name: i.name,
        qty: String(i.qty || 1),
        price: String(i.price || 0),
      }));
      setBill({
        currency: out.currency || "Rs",
        priceMode: "total",
        items: items.length ? items : blank().items,
        gst: out.gstPct ? String(out.gstPct) : "",
        discount: { mode: "flat", val: out.discount ? String(out.discount) : "" },
        tip: { mode: "flat", val: out.tip ? String(out.tip) : "" },
      });
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
    const who = identityOf(hostName);
    if (!who.name) { setErr("Put your name in first."); return; }
    setBusy(true);
    setErr("");
    try {
      const t = compute(bill);
      const out = await createBill({
        billName,
        currency: bill.currency,
        lines: t.lines,
        subtotal: t.subtotal,
        gstPct: Number(bill.gst) || 0,
        gstAmt: t.gstAmt,
        discountAmt: t.discountAmt,
        tipAmt: t.tipAmt,
        total: t.total,
        host: { name: who.name, slug: who.slug },
      });
      saveMe(out.meta.code, who);
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

  const doJoin = async () => {
    const c = joinCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    const who = identityOf(joinName);
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
      setMe(who);
      setMine(existing?.claims ?? {});
      setScreen("home");
      navigate(`/s/${c}`);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : `No split found with code ${c}.`);
    }
    setBusy(false);
  };

  /** "Not you?" — drop this device's identity and ask again. */
  const changeName = () => {
    if (!code) return;
    forgetMe(code);
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
    const next = { ...mine };
    if (next[lineId]) delete next[lineId];
    else next[lineId] = 1;
    buzz();
    setMine(next);
    void pushClaims(next);
  };

  const bump = (lineId: string, delta: number) => {
    const next = { ...mine };
    const v = (next[lineId] ?? 0) + delta;
    if (v <= 0) delete next[lineId];
    else next[lineId] = Math.min(v, 20);
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

  const goHome = () => {
    setBill(null); setShot(null); setErr(""); setSuspect(false);
    setHostName(""); setBillName(""); setJoinCode(""); setJoinName("");
    setScreen("home");
    navigate("/");
  };

  /* --- render ------------------------------------------------------------ */

  const t = bill ? compute(bill) : null;

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
          onShare={async () => {
            const how = await share(sync.state!.meta.code, sync.state!.meta.billName);
            if (how !== "failed") flash(how === "shared" ? "shared" : "link copied");
          }}
          onRefresh={sync.refresh}
          live={sync.live}
          refreshing={sync.refreshing}
          stale={sync.stale}
          error={sync.error || err}
          onBack={goHome}
          onChangeName={changeName}
        />
        <Toast message={toast} />
      </>
    );
  }

  if (code && me && !sync.state) {
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
          onCamera={() => { setErr(""); setScreen("camera"); }}
          onManual={() => { setErr(""); setBill(blank()); setScreen("editor"); }}
          onJoin={() => { setErr(""); setScreen("join"); }}
          onResume={(c) => navigate(`/s/${c}`)}
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
          onEqual={() => setScreen("equal")}
          onStart={() => { setErr(""); setScreen("start"); }}
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
        />
      )}

      {screen === "start" && (
        <Start
          hostName={hostName} setHostName={setHostName}
          billName={billName} setBillName={setBillName}
          onGo={openSplit} onBack={() => setScreen("editor")}
          busy={busy} error={err}
        />
      )}

      {screen === "join" && (
        <Join
          code={joinCode} setCode={setJoinCode}
          name={joinName} setName={setJoinName}
          onGo={doJoin} onBack={goHome}
          busy={busy} error={err}
        />
      )}

      <Toast message={toast} />
    </>
  );
}
