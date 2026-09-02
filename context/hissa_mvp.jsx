import React, { useState, useEffect, useRef, useCallback } from "react";

/**
 * Split — snap a bill, tap what you ate, settle up.
 *
 * Storage (all shared: true):
 *   bs:v1:<CODE>:meta        one key, written by the host, toggled by anyone
 *   bs:v1:<CODE>:c:<slug>    one key per person, only that person writes it
 */

const NS = "bs:v1:";
const MODEL = "claude-sonnet-4-6";

const PAPER = "#FAF7F0";
const INK = "#1B1815";
const FADE = "#7A7168";
const RULE = "#D8D0C3";
const STAGE = "#26221D";
const WARN = "#9B3030";
const OK = "#1F6B52";

const CHIPS = ["#A8431B", "#1F6B52", "#2E4D8F", "#8A2B5E", "#6C5A16", "#356B7C", "#6E3A96", "#9B3030"];
const mono = 'ui-monospace, "SF Mono", Menlo, Consolas, "Courier New", monospace';
const sans = '"Helvetica Neue", Helvetica, Arial, system-ui, sans-serif';
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const uid = () => Math.random().toString(36).slice(2, 9);
const rand = (n) => Array.from({ length: n }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join("");
const nameKey = (s) => s.trim().toLowerCase().replace(/\s+/g, " ");
const slugOf = (s) => nameKey(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "x";
const colorFor = (k) => {
  let h = 0;
  for (let i = 0; i < k.length; i += 1) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  return CHIPS[h % CHIPS.length];
};
const num = (v) => {
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const cents = (v) => Math.round(num(v) * 100);

function fmt(c, cur, dec) {
  const v = (c || 0) / 100;
  const s = dec ? Math.abs(v).toFixed(2) : Math.round(Math.abs(v)).toString();
  const [w, f] = s.split(".");
  const ww = w.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${v < 0 ? "-" : ""}${cur} ${f ? `${ww}.${f}` : ww}`;
}

/* ---------- bill maths ---------- */

function priceOf(it, mode) {
  return mode === "each" ? cents(it.price) * Math.max(num(it.qty), 0) : cents(it.price);
}

function compute(bill) {
  const lines = bill.items
    .filter((i) => i.name.trim() || num(i.price) > 0)
    .map((i) => ({ id: i.id, name: i.name.trim() || "Item", qty: num(i.qty) || 1, amt: Math.round(priceOf(i, bill.priceMode)) }));
  const subtotal = lines.reduce((s, l) => s + l.amt, 0);
  const gstAmt = Math.round((subtotal * num(bill.gst)) / 100);
  const afterGst = subtotal + gstAmt;
  const discountAmt = bill.discount.mode === "pct"
    ? Math.round((afterGst * num(bill.discount.val)) / 100)
    : cents(bill.discount.val);
  const tipAmt = bill.tip.mode === "pct"
    ? Math.round((afterGst * num(bill.tip.val)) / 100)
    : cents(bill.tip.val);
  return { lines, subtotal, gstAmt, discountAmt, tipAmt, total: afterGst - discountAmt + tipAmt };
}

function shareOf(meta, subShare) {
  if (!meta.subtotal) return 0;
  return Math.round((meta.total * subShare) / meta.subtotal);
}

/* ---------- image helpers ---------- */

function shrink(file, max) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const data = c.toDataURL("image/jpeg", 0.75);
      resolve({ preview: data, base64: data.split(",")[1] });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad image")); };
    img.src = url;
  });
}

function grab(video, max) {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new Error("no frame");
  const scale = Math.min(1, max / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
  const data = c.toDataURL("image/jpeg", 0.75);
  return { preview: data, base64: data.split(",")[1] };
}

const READ_PROMPT = `You are reading a photo of a restaurant or shop bill.
Return ONLY a JSON object, no prose and no markdown fences:
{"currency":"Rs","items":[{"name":"Shish Tawook Wrap","qty":7,"price":6790}],"gstPct":8,"discount":0,"tip":0}
Rules:
- "price" is the LINE TOTAL for that row (quantity times unit rate), not the unit rate.
- Copy item names as printed. Skip subtotal, tax, discount and total rows from the items list.
- "gstPct" is the tax percentage. If the bill shows more than one rate, use the lower one. If none, use 0.
- "currency" is a short symbol such as Rs, $, PKR, AED.
- Numbers must be plain numbers with no commas or currency symbols.`;

async function readBill(base64) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
          { type: "text", text: READ_PROMPT },
        ],
      }],
    }),
  });
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  return JSON.parse(clean.slice(start, end + 1));
}

/* ---------- clipboard ---------- */

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (e2) {
      return false;
    }
  }
}

function linkFor(code) {
  try {
    const l = window.location;
    if (l.protocol === "http:" || l.protocol === "https:") {
      return `${l.origin}${l.pathname}#s=${code}`;
    }
  } catch (e) {
    // sandboxed
  }
  return `Join my split, code ${code}`;
}

/* ================= app ================= */

export default function Split() {
  const [screen, setScreen] = useState("home");
  const [bill, setBill] = useState(null);
  const [shot, setShot] = useState(null);
  const [camState, setCamState] = useState("starting");
  const [reading, setReading] = useState(false);
  const [err, setErr] = useState("");

  const [heads, setHeads] = useState("2");
  const [meta, setMeta] = useState(null);
  const [me, setMe] = useState(null);
  const [mine, setMine] = useState({});
  const [others, setOthers] = useState([]);
  const [toast, setToast] = useState("");

  const [hostName, setHostName] = useState("");
  const [billName, setBillName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinName, setJoinName] = useState("");

  const fileRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const meRef = useRef(null);
  const metaRef = useRef(null);
  meRef.current = me;
  metaRef.current = meta;

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 1800); };

  const blank = () => ({
    currency: "Rs",
    priceMode: "total",
    items: [{ id: uid(), name: "", qty: "1", price: "" }],
    gst: "",
    discount: { mode: "flat", val: "" },
    tip: { mode: "flat", val: "" },
  });

  /* ---------- shared state sync ---------- */

  const pull = useCallback(async (code, myKey) => {
    const m = await window.storage.get(`${NS}${code}:meta`, true);
    if (!m || !m.value) throw new Error("no bill");
    const parsed = JSON.parse(m.value);
    const listed = await window.storage.list(`${NS}${code}:c:`, true);
    const raw = (listed && listed.keys) || [];
    const keys = raw.map((k) => (typeof k === "string" ? k : k && k.key)).filter(Boolean);
    const rows = [];
    for (const k of keys) {
      if (myKey && k === myKey) continue;
      try {
        const r = await window.storage.get(k, true);
        if (r && r.value) {
          const v = JSON.parse(r.value);
          if (v && v.name) rows.push({ key: nameKey(v.name), name: v.name, claims: v.claims || {} });
        }
      } catch (e) { /* removed mid-read */ }
    }
    return { parsed, rows };
  }, []);

  const sync = useCallback(async () => {
    const m = metaRef.current;
    if (!m) return;
    try {
      const mk = meRef.current ? `${NS}${m.code}:c:${meRef.current.slug}` : null;
      const { parsed, rows } = await pull(m.code, mk);
      setMeta(parsed);
      setOthers(rows);
      setErr("");
    } catch (e) {
      setErr("Lost touch with the split. It will retry.");
    }
  }, [pull]);

  useEffect(() => {
    if (screen !== "split") return undefined;
    const t = setInterval(sync, 7000);
    return () => clearInterval(t);
  }, [screen, sync]);

  useEffect(() => {
    try {
      const h = window.location.hash || "";
      const m = h.match(/s=([A-Z0-9]{4,8})/i);
      if (m) { setJoinCode(m[1].toUpperCase()); setScreen("join"); }
    } catch (e) { /* sandboxed */ }
  }, []);

  const pushClaims = useCallback(async (claims) => {
    const m = metaRef.current;
    const p = meRef.current;
    if (!m || !p) return;
    try {
      await window.storage.set(`${NS}${m.code}:c:${p.slug}`, JSON.stringify({ name: p.name, claims, at: Date.now() }), true);
    } catch (e) {
      setErr("That tap did not save. Tap it again.");
    }
  }, []);

  /* ---------- camera ---------- */

  const stopCam = useCallback(() => {
    const s2 = streamRef.current;
    if (s2) {
      s2.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    if (screen !== "camera") return undefined;
    let dead = false;
    (async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCamState("unavailable");
        return;
      }
      try {
        const s2 = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } },
          audio: false,
        });
        if (dead) { s2.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s2;
        if (videoRef.current) {
          videoRef.current.srcObject = s2;
          try { await videoRef.current.play(); } catch (e) { /* autoplay guard */ }
        }
        setCamState("live");
      } catch (e) {
        setCamState(e && e.name === "NotAllowedError" ? "denied" : "unavailable");
      }
    })();
    return () => { dead = true; stopCam(); };
  }, [screen, stopCam]);

  useEffect(() => stopCam, [stopCam]);

  function openCamera() {
    setErr("");
    setCamState("starting");
    setScreen("camera");
  }

  function snap() {
    if (!videoRef.current) return;
    try {
      setShot(grab(videoRef.current, 1400));
      setErr("");
      setScreen("preview");
    } catch (e) {
      setErr("Could not capture that frame. Hold steady and try again.");
    }
  }

  /* ---------- flows ---------- */

  async function onShot(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      const s = await shrink(f, 1400);
      setShot(s);
      setScreen("preview");
      setErr("");
    } catch (e2) {
      setErr("Could not open that photo. Try another one.");
    }
  }

  async function useShot() {
    setReading(true);
    setErr("");
    try {
      const out = await readBill(shot.base64);
      const items = (out.items || []).slice(0, 40).map((i) => ({
        id: uid(),
        name: String(i.name || "").slice(0, 60),
        qty: String(i.qty || 1),
        price: String(i.price || 0),
      }));
      setBill({
        currency: (out.currency || "Rs").slice(0, 4),
        priceMode: "total",
        items: items.length ? items : blank().items,
        gst: out.gstPct ? String(out.gstPct) : "",
        discount: { mode: "flat", val: out.discount ? String(out.discount) : "" },
        tip: { mode: "flat", val: out.tip ? String(out.tip) : "" },
      });
      setScreen("editor");
    } catch (e) {
      setErr("Could not read that bill. Enter the lines by hand, it is quicker than a retake.");
      setBill(blank());
      setScreen("editor");
    }
    setReading(false);
  }

  async function makeCode() {
    for (let i = 0; i < 6; i += 1) {
      const c = rand(4);
      try {
        const hit = await window.storage.get(`${NS}${c}:meta`, true);
        if (!hit || !hit.value) return c;
      } catch (e) {
        return c;
      }
    }
    return rand(6);
  }

  async function startSplit() {
    const nm = hostName.trim().replace(/\s+/g, " ").slice(0, 24);
    if (!nm) { setErr("Put your name in first."); return; }
    setReading(true);
    setErr("");
    const c = compute(bill);
    const code = await makeCode();
    const doc = {
      code,
      billName: billName.trim().slice(0, 40) || rand(3),
      currency: bill.currency,
      lines: c.lines,
      subtotal: c.subtotal,
      gstAmt: c.gstAmt,
      gstPct: num(bill.gst),
      discountAmt: c.discountAmt,
      tipAmt: c.tipAmt,
      total: c.total,
      splitUnclaimed: false,
      at: Date.now(),
    };
    try {
      await window.storage.set(`${NS}${code}:meta`, JSON.stringify(doc), true);
      const identity = { key: nameKey(nm), name: nm, slug: slugOf(nm) };
      await window.storage.set(`${NS}${code}:c:${identity.slug}`, JSON.stringify({ name: nm, claims: {}, at: Date.now() }), true);
      meRef.current = identity;
      metaRef.current = doc;
      setMe(identity);
      setMeta(doc);
      setMine({});
      setOthers([]);
      setScreen("split");
      const ok = await copy(linkFor(code));
      flash(ok ? `Invite copied, code ${code}` : `Your code is ${code}`);
    } catch (e) {
      setErr("Could not open the split. Check your connection and try again.");
    }
    setReading(false);
  }

  async function joinSplit() {
    const code = joinCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    const nm = joinName.trim().replace(/\s+/g, " ").slice(0, 24);
    if (!code || !nm) { setErr("Both the code and your name are needed."); return; }
    setReading(true);
    setErr("");
    try {
      const identity = { key: nameKey(nm), name: nm, slug: slugOf(nm) };
      const { parsed, rows } = await pull(code, `${NS}${code}:c:${identity.slug}`);
      let claims = {};
      try {
        const own = await window.storage.get(`${NS}${code}:c:${identity.slug}`, true);
        if (own && own.value) claims = JSON.parse(own.value).claims || {};
      } catch (e) { /* first time on this split */ }
      meRef.current = identity;
      metaRef.current = parsed;
      setMe(identity);
      setMeta(parsed);
      setMine(claims);
      setOthers(rows);
      await window.storage.set(`${NS}${code}:c:${identity.slug}`, JSON.stringify({ name: nm, claims, at: Date.now() }), true);
      setScreen("split");
    } catch (e) {
      setErr(`No split found with code ${code}.`);
    }
    setReading(false);
  }

  async function toggleUnclaimed() {
    const next = { ...meta, splitUnclaimed: !meta.splitUnclaimed };
    setMeta(next);
    metaRef.current = next;
    try {
      await window.storage.set(`${NS}${meta.code}:meta`, JSON.stringify(next), true);
    } catch (e) {
      setErr("Could not save that change for the group.");
    }
  }

  function tap(lineId) {
    const next = { ...mine };
    if (next[lineId]) delete next[lineId];
    else next[lineId] = 1;
    setMine(next);
    pushClaims(next);
  }

  function bump(lineId, d) {
    const next = { ...mine };
    const v = (next[lineId] || 0) + d;
    if (v <= 0) delete next[lineId];
    else next[lineId] = Math.min(v, 20);
    setMine(next);
    pushClaims(next);
  }

  function reset() {
    stopCam();
    setBill(null); setShot(null); setMeta(null); setMe(null); setMine({}); setOthers([]);
    setHostName(""); setBillName(""); setJoinCode(""); setJoinName(""); setErr("");
    metaRef.current = null; meRef.current = null;
    setScreen("home");
  }

  /* ---------- styles ---------- */

  const css = `
    .stage{background:${STAGE};min-height:100%;padding:18px 12px 130px;font-family:${sans};-webkit-font-smoothing:antialiased}
    .slip{max-width:520px;margin:0 auto;background:${PAPER};color:${INK};box-shadow:0 18px 44px rgba(0,0,0,.42);position:relative}
    .slip:before,.slip:after{content:"";display:block;height:9px;background:repeating-linear-gradient(-45deg,${PAPER} 0 7px,transparent 7px 14px)}
    .slip:before{transform:scaleY(-1)}
    .pad{padding:0 20px}
    .row{display:flex;justify-content:space-between;gap:12px}
    .num{font-family:${mono};font-variant-numeric:tabular-nums}
    .dash{border:none;border-top:1px dashed ${RULE};margin:0}
    .h1{font-size:25px;margin:0;font-weight:600;letter-spacing:-.02em}
    .sub{color:${FADE};font-size:14px;line-height:1.55}
    .big{width:100%;text-align:left;border:1px solid ${RULE};background:#fff;padding:16px;font:inherit;color:inherit;cursor:pointer;display:block;margin-bottom:10px}
    .big:hover{border-color:${INK}}
    .big b{display:block;font-size:17px;font-weight:600;margin-bottom:3px}
    .field{width:100%;box-sizing:border-box;border:1px solid ${RULE};background:#fff;padding:11px;font-size:16px;color:${INK};font-family:${sans}}
    .field:focus{outline:2px solid ${INK};outline-offset:-1px}
    .mono{font-family:${mono}}
    .go{width:100%;border:none;background:${INK};color:${PAPER};padding:14px;font-size:15px;cursor:pointer;font-family:${sans}}
    .go:disabled{opacity:.35;cursor:default}
    .alt{background:none;border:1px solid ${INK};color:${INK}}
    .mini{border:1px solid ${RULE};background:#fff;color:${FADE};padding:5px 9px;font-size:12px;cursor:pointer;font-family:${sans}}
    .mini.on{background:${INK};color:${PAPER};border-color:${INK}}
    .item{width:100%;text-align:left;background:none;border:none;padding:12px 20px;cursor:pointer;display:block;font:inherit;color:inherit}
    .item.on{background:rgba(168,67,27,.075);box-shadow:inset 3px 0 0 #A8431B}
    .chip{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:#fff;padding:3px 8px;border-radius:11px}
    .step{border:none;background:rgba(255,255,255,.28);color:#fff;width:17px;height:17px;border-radius:50%;font-size:13px;line-height:1;cursor:pointer;padding:0;display:inline-flex;align-items:center;justify-content:center;font-family:${mono}}
    .bar{position:fixed;left:0;right:0;bottom:0;background:${INK};color:${PAPER};padding:12px 16px calc(12px + env(safe-area-inset-bottom))}
    .barIn{max-width:520px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;gap:12px}
    .ghost{background:none;border:1px solid rgba(250,247,240,.35);color:${PAPER};padding:7px 12px;font-size:13px;cursor:pointer;font-family:${sans}}
    .view{width:100%;display:block;background:#000;aspect-ratio:3/4;object-fit:cover}
    .shutter{width:68px;height:68px;border-radius:50%;border:3px solid ${INK};background:${PAPER};cursor:pointer;padding:0;box-shadow:inset 0 0 0 3px ${PAPER}, inset 0 0 0 6px ${INK}}
    .shutter:disabled{opacity:.35;cursor:default}
    .toast{position:fixed;left:50%;transform:translateX(-50%);bottom:96px;background:${INK};color:${PAPER};padding:9px 16px;font-size:14px;box-shadow:0 6px 20px rgba(0,0,0,.4)}
    .back{background:none;border:none;color:${FADE};font-size:14px;cursor:pointer;padding:0;font-family:${sans};text-decoration:underline}
  `;

  const Head = ({ title, note, onBack }) => (
    <div className="pad" style={{ paddingTop: 20 }}>
      {onBack ? <button className="back" onClick={onBack}>Back</button> : null}
      <h1 className="h1" style={{ marginTop: onBack ? 10 : 0 }}>{title}</h1>
      {note ? <p className="sub" style={{ margin: "8px 0 0" }}>{note}</p> : null}
      {err ? <p style={{ color: WARN, fontSize: 14, margin: "10px 0 0" }}>{err}</p> : null}
    </div>
  );

  /* ---------- screens ---------- */

  if (screen === "home") {
    return (
      <div className="stage"><style>{css}</style>
        <div className="slip">
          <Head title="Split a bill" note="Three ways in. Pick one and you are two taps from a number." />
          <div className="pad" style={{ padding: "20px", paddingBottom: 26 }}>
            <button className="big" onClick={openCamera}>
              <b>Take a pic</b><span className="sub">Snap the receipt and the lines fill themselves in</span>
            </button>
            <button className="big" onClick={() => { setBill(blank()); setErr(""); setScreen("editor"); }}>
              <b>Enter manually</b><span className="sub">Type the items yourself</span>
            </button>
            <button className="big" onClick={() => { setErr(""); setScreen("join"); }}>
              <b>Join a split</b><span className="sub">Someone sent you a code</span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onShot} />
          </div>
        </div>
      </div>
    );
  }

  if (screen === "camera") {
    return (
      <div className="stage"><style>{css}</style>
        <div className="slip">
          <Head title="Frame the bill" note="Fill the frame with the receipt, top to bottom." onBack={reset} />
          <div className="pad" style={{ padding: 20 }}>
            {camState === "denied" || camState === "unavailable" ? (
              <div style={{ border: `1px solid ${RULE}`, padding: 18, background: "#fff" }}>
                <p style={{ fontSize: 15, margin: 0 }}>
                  {camState === "denied"
                    ? "Camera access was turned down. Allow it in your browser settings, or use your phone camera app instead."
                    : "No camera available here. Use your phone camera app or pick a photo instead."}
                </p>
                <button className="go" style={{ marginTop: 14 }} onClick={() => fileRef.current && fileRef.current.click()}>
                  Open camera app or gallery
                </button>
              </div>
            ) : (
              <div style={{ position: "relative", background: "#000" }}>
                <video ref={videoRef} className="view" playsInline muted autoPlay />
                {camState === "starting" ? (
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: PAPER, fontSize: 14 }}>
                    Waking the camera
                  </div>
                ) : null}
              </div>
            )}
            {camState === "live" || camState === "starting" ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginTop: 18 }}>
                <button className="shutter" onClick={snap} disabled={camState !== "live"} aria-label="Take the photo" />
                <button className="back" onClick={() => fileRef.current && fileRef.current.click()}>
                  Pick a photo instead
                </button>
              </div>
            ) : null}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onShot} />
          </div>
        </div>
      </div>
    );
  }

  if (screen === "preview") {
    return (
      <div className="stage"><style>{css}</style>
        <div className="slip">
          <Head title="Is it readable?" note="Every line and the totals should be in frame and in focus." />
          <div className="pad" style={{ padding: 20 }}>
            <img src={shot.preview} alt="Bill" style={{ width: "100%", display: "block", border: `1px solid ${RULE}` }} />
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button className="go alt" onClick={openCamera} disabled={reading}>Retake</button>
              <button className="go" onClick={useShot} disabled={reading}>{reading ? "Reading the bill" : "Next"}</button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onShot} />
          </div>
        </div>
      </div>
    );
  }

  if (screen === "editor") {
    const c = compute(bill);
    const setItem = (id, k, v) => setBill({ ...bill, items: bill.items.map((i) => (i.id === id ? { ...i, [k]: v } : i)) });
    return (
      <div className="stage"><style>{css}</style>
        <div className="slip">
          <Head title="Check the lines" note="Fix anything that came out wrong, then choose how to split." onBack={reset} />
          <div className="pad" style={{ paddingTop: 16 }}>
            <div className="row" style={{ alignItems: "center", marginBottom: 12 }}>
              <input className="field mono" style={{ width: 74 }} value={bill.currency} maxLength={4}
                onChange={(e) => setBill({ ...bill, currency: e.target.value })} />
              <div style={{ display: "flex", gap: 6 }}>
                <button className={bill.priceMode === "total" ? "mini on" : "mini"} onClick={() => setBill({ ...bill, priceMode: "total" })}>Line total</button>
                <button className={bill.priceMode === "each" ? "mini on" : "mini"} onClick={() => setBill({ ...bill, priceMode: "each" })}>Price each</button>
              </div>
            </div>
          </div>
          <hr className="dash" />
          <div className="pad" style={{ paddingTop: 12 }}>
            {bill.items.map((it) => (
              <div key={it.id} style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
                <input className="field" style={{ flex: "1 1 auto", minWidth: 0 }} placeholder="Item" value={it.name}
                  onChange={(e) => setItem(it.id, "name", e.target.value)} />
                <input className="field mono" style={{ width: 52 }} inputMode="numeric" value={it.qty}
                  onChange={(e) => setItem(it.id, "qty", e.target.value)} />
                <input className="field mono" style={{ width: 88 }} inputMode="decimal" placeholder="0" value={it.price}
                  onChange={(e) => setItem(it.id, "price", e.target.value)} />
                <button className="mini" style={{ padding: "9px 8px" }} aria-label="Remove line"
                  onClick={() => setBill({ ...bill, items: bill.items.filter((x) => x.id !== it.id) })}>×</button>
              </div>
            ))}
            <button className="mini" onClick={() => setBill({ ...bill, items: [...bill.items, { id: uid(), name: "", qty: "1", price: "" }] })}>
              Add a line
            </button>
          </div>

          <div className="pad" style={{ paddingTop: 18 }}>
            <hr className="dash" style={{ marginBottom: 14 }} />
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
              <span style={{ width: 78, fontSize: 15 }}>GST</span>
              <input className="field mono" style={{ width: 84 }} inputMode="decimal" placeholder="0" value={bill.gst}
                onChange={(e) => setBill({ ...bill, gst: e.target.value })} />
              <span className="sub">% on {fmt(c.subtotal, bill.currency)}</span>
            </div>
            {["discount", "tip"].map((k) => (
              <div key={k} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                <span style={{ width: 78, fontSize: 15, textTransform: "capitalize" }}>{k}</span>
                <input className="field mono" style={{ width: 84 }} inputMode="decimal" placeholder="0" value={bill[k].val}
                  onChange={(e) => setBill({ ...bill, [k]: { ...bill[k], val: e.target.value } })} />
                <button className={bill[k].mode === "flat" ? "mini on" : "mini"} onClick={() => setBill({ ...bill, [k]: { ...bill[k], mode: "flat" } })}>{bill.currency}</button>
                <button className={bill[k].mode === "pct" ? "mini on" : "mini"} onClick={() => setBill({ ...bill, [k]: { ...bill[k], mode: "pct" } })}>%</button>
              </div>
            ))}
            <p className="sub" style={{ margin: "4px 0 0", fontSize: 13 }}>Discount and tip apply after GST.</p>
          </div>

          <div className="pad" style={{ paddingTop: 18, paddingBottom: 24 }}>
            <hr className="dash" style={{ marginBottom: 12 }} />
            {[["Subtotal", c.subtotal], [`GST ${num(bill.gst) || 0}%`, c.gstAmt], ["Discount", -c.discountAmt], ["Tip", c.tipAmt]]
              .filter(([, v], i) => i < 2 || v !== 0)
              .map(([l, v]) => (
                <div className="row num" key={l} style={{ fontSize: 14, color: FADE, padding: "3px 0" }}>
                  <span>{l}</span><span>{fmt(v, bill.currency, true)}</span>
                </div>
              ))}
            <div className="row num" style={{ fontSize: 19, fontWeight: 600, paddingTop: 8 }}>
              <span>Total</span><span>{fmt(c.total, bill.currency, true)}</span>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="go alt" onClick={() => { setErr(""); setScreen("equal"); }} disabled={!c.subtotal}>Split equally</button>
              <button className="go" onClick={() => { setErr(""); setScreen("start"); }} disabled={!c.subtotal}>Tap to split</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "equal") {
    const c = compute(bill);
    const n = Math.max(1, Math.round(num(heads)) || 1);
    const base = Math.floor(c.total / n);
    const extra = c.total - base * n;
    return (
      <div className="stage"><style>{css}</style>
        <div className="slip">
          <Head title="Split equally" note="How many people are on this bill?" onBack={() => setScreen("editor")} />
          <div className="pad" style={{ padding: 20 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button className="go alt" style={{ width: 54 }} onClick={() => setHeads(String(Math.max(1, n - 1)))}>−</button>
              <input className="field mono" style={{ textAlign: "center", fontSize: 22 }} inputMode="numeric" value={heads}
                onChange={(e) => setHeads(e.target.value)} />
              <button className="go alt" style={{ width: 54 }} onClick={() => setHeads(String(n + 1))}>+</button>
            </div>
            <div style={{ textAlign: "center", padding: "26px 0 6px" }}>
              <div className="sub">Each person pays</div>
              <div className="num" style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-.02em" }}>
                {fmt(base + (extra ? 1 : 0), bill.currency, true)}
              </div>
              {extra ? (
                <div className="sub" style={{ marginTop: 6 }}>
                  {extra} of the {n} pay {fmt(base + 1, bill.currency, true)}, the rest pay {fmt(base, bill.currency, true)}
                </div>
              ) : null}
            </div>
            <hr className="dash" style={{ margin: "14px 0" }} />
            <div className="row num" style={{ fontSize: 14, color: FADE }}>
              <span>Bill total</span><span>{fmt(c.total, bill.currency, true)}</span>
            </div>
            <button className="go alt" style={{ marginTop: 20 }} onClick={reset}>Start another bill</button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "start") {
    return (
      <div className="stage"><style>{css}</style>
        <div className="slip">
          <Head title="Open the split" note="Your name is how the group sees your taps. The bill name is optional." onBack={() => setScreen("editor")} />
          <div className="pad" style={{ padding: 20 }}>
            <input className="field" style={{ marginBottom: 10 }} placeholder="Your name" value={hostName} maxLength={24}
              onChange={(e) => setHostName(e.target.value)} />
            <input className="field" placeholder="Bill name, optional" value={billName} maxLength={40}
              onChange={(e) => setBillName(e.target.value)} />
            <button className="go" style={{ marginTop: 14 }} onClick={startSplit} disabled={reading || !hostName.trim()}>
              {reading ? "Opening" : "Open split and copy invite"}
            </button>
            <p className="sub" style={{ marginTop: 12, fontSize: 13 }}>
              The invite lands on your clipboard, and the code stays on screen for anyone who prefers typing it.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "join") {
    return (
      <div className="stage"><style>{css}</style>
        <div className="slip">
          <Head title="Join a split" note="Enter the code from the person who opened the bill." onBack={reset} />
          <div className="pad" style={{ padding: 20 }}>
            <input className="field mono" style={{ marginBottom: 10, fontSize: 22, letterSpacing: ".18em", textTransform: "uppercase" }}
              placeholder="CODE" value={joinCode} maxLength={8} onChange={(e) => setJoinCode(e.target.value)} />
            <input className="field" placeholder="Your name" value={joinName} maxLength={24}
              onChange={(e) => setJoinName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && joinSplit()} />
            <button className="go" style={{ marginTop: 14 }} onClick={joinSplit} disabled={reading}>
              {reading ? "Looking" : "Join"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- the split ---------- */

  const cur = meta.currency;
  const everyone = [{ key: me.key, name: me.name, claims: mine, isMe: true }]
    .concat(others.filter((o) => o.key !== me.key));

  const byLine = {};
  meta.lines.forEach((l) => {
    byLine[l.id] = everyone.filter((p) => (p.claims[l.id] || 0) > 0).map((p) => ({ ...p, n: p.claims[l.id] }));
  });

  const subShare = {};
  everyone.forEach((p) => { subShare[p.key] = 0; });
  let loose = 0;
  meta.lines.forEach((l) => {
    const cl = byLine[l.id];
    if (!cl.length) { loose += l.amt; return; }
    const units = cl.reduce((s, x) => s + x.n, 0);
    let done = 0;
    cl.forEach((x, i) => {
      const cut = i === cl.length - 1 ? l.amt - done : Math.round((l.amt * x.n) / units);
      done += cut;
      subShare[x.key] += cut;
    });
  });

  const active = everyone.filter((p) => Object.keys(p.claims).length > 0);
  if (meta.splitUnclaimed && loose > 0 && active.length > 0) {
    const per = Math.floor(loose / active.length);
    const rem = loose - per * active.length;
    active.forEach((p, i) => { subShare[p.key] += per + (i < rem ? 1 : 0); });
    loose = 0;
  }

  const myTotal = shareOf(meta, subShare[me.key] || 0);
  const looseTotal = shareOf(meta, loose);

  return (
    <div className="stage"><style>{css}</style>
      <div className="slip">
        <div className="pad" style={{ paddingTop: 20 }}>
          <div className="row" style={{ alignItems: "baseline" }}>
            <div>
              <h1 className="h1" style={{ fontSize: 21 }}>{meta.billName}</h1>
              <div className="sub" style={{ fontSize: 13, marginTop: 3 }}>{me.name}, tap what you had</div>
            </div>
            <button className="mini" onClick={reset}>Leave</button>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="mini" onClick={async () => flash(await copy(linkFor(meta.code)) ? "Link copied" : "Copy blocked, read the code out")}>
              Copy link
            </button>
            <button className="mini mono" onClick={async () => flash(await copy(meta.code) ? "Code copied" : meta.code)}>
              {meta.code}
            </button>
          </div>
          {err ? <p style={{ color: WARN, fontSize: 13, margin: "10px 0 0" }}>{err}</p> : null}
        </div>

        <div className="pad" style={{ marginTop: 16 }}>
          <hr className="dash" />
        </div>

        {meta.lines.map((l) => {
          const cl = byLine[l.id];
          const on = (mine[l.id] || 0) > 0;
          return (
            <div key={l.id}>
              <button className={on ? "item on" : "item"} onClick={() => tap(l.id)}>
                <div className="row" style={{ alignItems: "baseline" }}>
                  <span style={{ fontSize: 16 }}>{l.name}</span>
                  <span className="num" style={{ fontSize: 15, whiteSpace: "nowrap" }}>{fmt(l.amt, cur)}</span>
                </div>
                <div className="row" style={{ alignItems: "flex-end", marginTop: 7 }}>
                  <span style={{ display: "flex", gap: 5, flexWrap: "wrap", minHeight: 22 }}>
                    {cl.length === 0
                      ? <span className="sub" style={{ fontSize: 13 }}>Nobody yet</span>
                      : cl.map((c2) => (
                        <span key={c2.key} className="chip" style={{ background: c2.isMe ? INK : colorFor(c2.key) }}>
                          {c2.isMe ? "You" : c2.name}
                          {c2.isMe ? (
                            <>
                              <span className="step" role="button" tabIndex={0}
                                onClick={(e) => { e.stopPropagation(); bump(l.id, -1); }}>−</span>
                              <span className="num">×{c2.n}</span>
                              <span className="step" role="button" tabIndex={0}
                                onClick={(e) => { e.stopPropagation(); bump(l.id, 1); }}>+</span>
                            </>
                          ) : c2.n > 1 ? <span className="num">×{c2.n}</span> : null}
                        </span>
                      ))}
                  </span>
                  <span className="num sub" style={{ fontSize: 12 }}>{l.qty > 1 ? `qty ${l.qty}` : ""}</span>
                </div>
              </button>
              <hr className="dash" />
            </div>
          );
        })}

        <div className="pad" style={{ paddingTop: 14 }}>
          <div className="row" style={{ alignItems: "center" }}>
            <span style={{ fontSize: 15, color: loose > 0 ? WARN : OK }}>
              {loose > 0 ? `Unclaimed ${fmt(looseTotal, cur, true)}` : "Everything is claimed"}
            </span>
            <button className={meta.splitUnclaimed ? "mini on" : "mini"} onClick={toggleUnclaimed}>
              {meta.splitUnclaimed ? "Sharing leftovers" : "Share leftovers"}
            </button>
          </div>
          <p className="sub" style={{ fontSize: 13, margin: "8px 0 0" }}>
            Turn that on and anything nobody taps is divided equally between everyone who tapped.
          </p>
        </div>

        <div className="pad" style={{ paddingTop: 18, paddingBottom: 26 }}>
          <hr className="dash" style={{ marginBottom: 12 }} />
          {[["Subtotal", meta.subtotal], [`GST ${meta.gstPct || 0}%`, meta.gstAmt], ["Discount", -meta.discountAmt], ["Tip", meta.tipAmt]]
            .filter(([, v], i) => i < 2 || v !== 0)
            .map(([l, v]) => (
              <div className="row num" key={l} style={{ fontSize: 13, color: FADE, padding: "2px 0" }}>
                <span>{l}</span><span>{fmt(v, cur, true)}</span>
              </div>
            ))}
          <div className="row num" style={{ fontSize: 15, paddingTop: 6, marginBottom: 12 }}>
            <span>Bill total</span><span>{fmt(meta.total, cur, true)}</span>
          </div>
          <hr className="dash" style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 15, marginBottom: 8 }}>
            {active.length === 0 ? "Nobody has tapped yet" : `${active.length} ${active.length === 1 ? "person" : "people"} in`}
          </div>
          {active.map((p) => (
            <div className="row" key={p.key} style={{ padding: "6px 0", alignItems: "baseline" }}>
              <span style={{ fontSize: 15 }}>
                <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: p.isMe ? INK : colorFor(p.key), marginRight: 8 }} />
                {p.isMe ? `${p.name} (you)` : p.name}
              </span>
              <span className="num" style={{ fontSize: 15 }}>{fmt(shareOf(meta, subShare[p.key] || 0), cur, true)}</span>
            </div>
          ))}
        </div>
      </div>

      {toast ? <div className="toast">{toast}</div> : null}

      <div className="bar">
        <div className="barIn">
          <div>
            <div style={{ fontSize: 12, opacity: .65 }}>Your share, tax and tip included</div>
            <div className="num" style={{ fontSize: 26, fontWeight: 600, marginTop: 2 }}>{fmt(myTotal, cur, true)}</div>
          </div>
          <button className="ghost" onClick={sync}>Refresh</button>
        </div>
      </div>
    </div>
  );
}
