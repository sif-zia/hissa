/**
 * The result as a card image: a page of the journal, drawn on a canvas.
 * Always the light palette — it is going into somebody else's chat, where
 * the sharer's dark theme means nothing. Constants mirror journal.css.
 */

import { fmt } from "./money";
import type { Summary } from "./summary";

const PAPER = "#f3ecda";
const RULE = "rgba(120, 106, 84, 0.16)";
const INK = "#2b2925";
const INK_2 = "#55503f";
const INK_3 = "#837b66";
const ROSE = "#b4697c";
const EDGE = "#e2d7bd";

const HAND = '"Shantell Sans", "Comic Sans MS", sans-serif';
const SCRAWL = '"Caveat", cursive';
const LEDGER = '"Courier Prime", ui-monospace, monospace';

const W = 1080;
const PAD = 84;
const PITCH = 64; // the notebook's ruling, doubled for a 2x-ish canvas

/** Every face the card uses, loaded before the first stroke. */
async function fontsReady(): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load(`700 60px ${HAND}`),
      document.fonts.load(`400 40px ${HAND}`),
      document.fonts.load(`500 40px ${SCRAWL}`),
      document.fonts.load(`400 38px ${LEDGER}`),
      document.fonts.load(`700 40px ${LEDGER}`),
    ]);
  } catch {
    // Fall back to whatever the system has; a card in Georgia beats no card.
  }
}

type Op = (x: CanvasRenderingContext2D, y: number) => void;

export async function drawCard(s: Summary): Promise<Blob> {
  await fontsReady();
  const m = (c: number) => fmt(c, s.currency, true);

  // Lay out first, so the canvas is exactly as tall as what is on it.
  const ops: [number, Op][] = [];
  const at = (h: number, op: Op) => ops.push([h, op]);
  const right = (x: CanvasRenderingContext2D, text: string, y: number) => {
    x.textAlign = "right";
    x.fillText(text, W - PAD, y);
    x.textAlign = "left";
  };
  const dashed = (x: CanvasRenderingContext2D, y: number) => {
    x.strokeStyle = "rgba(43, 41, 37, 0.32)";
    x.lineWidth = 3;
    x.setLineDash([12, 9]);
    x.beginPath();
    x.moveTo(PAD, y);
    x.lineTo(W - PAD, y);
    x.stroke();
    x.setLineDash([]);
  };

  at(136, (x, y) => {
    x.fillStyle = INK;
    x.font = `700 60px ${HAND}`;
    x.fillText(s.title, PAD, y + 100, W - PAD * 2 - 260);
    x.fillStyle = INK_3;
    x.font = `400 30px ${LEDGER}`;
    right(x, s.date.toUpperCase(), y + 96);
  });
  at(40, (x, y) => dashed(x, y + 20));

  for (const r of s.rows) {
    at(PITCH, (x, y) => {
      let tx = PAD;
      if (r.colour) {
        x.fillStyle = r.colour;
        x.beginPath();
        x.arc(PAD + 10, y + 36, 10, 0, Math.PI * 2);
        x.fill();
        tx = PAD + 36;
      }
      x.fillStyle = INK;
      x.font = `400 42px ${HAND}`;
      x.fillText(r.name, tx, y + 48, W - PAD * 2 - 380);
      x.font = `700 40px ${LEDGER}`;
      right(x, m(r.amt), y + 48);
    });
    for (const i of r.items ?? []) {
      at(50, (x, y) => {
        x.fillStyle = INK_2;
        x.font = `500 38px ${SCRAWL}`;
        x.fillText(`${i.name}${i.frac ? ` ${i.frac}` : ""}`, PAD + 36, y + 36, W - PAD * 2 - 380);
        x.fillStyle = INK_3;
        x.font = `400 32px ${LEDGER}`;
        right(x, m(i.amt), y + 36);
      });
    }
  }

  at(40, (x, y) => dashed(x, y + 20));
  at(PITCH + 8, (x, y) => {
    x.fillStyle = INK;
    x.font = `700 44px ${HAND}`;
    x.fillText("total", PAD, y + 50);
    x.font = `700 46px ${LEDGER}`;
    right(x, m(s.total), y + 50);
  });
  if (s.note) {
    at(56, (x, y) => {
      x.fillStyle = ROSE;
      x.font = `500 40px ${SCRAWL}`;
      x.fillText(s.note!, PAD, y + 40, W - PAD * 2);
    });
  }
  at(110, (x, y) => {
    x.fillStyle = ROSE;
    x.font = `500 40px ${SCRAWL}`;
    right(x, "split with hissa", y + 70);
  });

  const H = ops.reduce((h, [dh]) => h + dh, 0) + 40;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d");
  if (!x) throw new Error("no canvas context");

  // Paper, its ruling, and the margin line — the same sheet as the app.
  x.fillStyle = PAPER;
  x.fillRect(0, 0, W, H);
  x.fillStyle = RULE;
  for (let y = PITCH - 2; y < H; y += PITCH) x.fillRect(0, y, W, 2);
  x.fillStyle = "rgba(198, 122, 138, 0.42)";
  x.fillRect(52, 0, 3, H);
  x.strokeStyle = EDGE;
  x.lineWidth = 2;
  x.strokeRect(1, 1, W - 2, H - 2);

  let y = 0;
  for (const [h, op] of ops) {
    op(x, y);
    y += h;
  }

  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("no image"))), "image/png"));
}
