// Små hjelpefunksjoner: escaping, formatering av mengder og datoer.

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

export const DAY_NAMES = ["Søndag", "Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag"];
const MONTHS = ["jan.", "feb.", "mars", "april", "mai", "juni", "juli", "aug.", "sep.", "okt.", "nov.", "des."];

/** Tolker "YYYY-MM-DD" som lokal dato (ikke UTC). */
export function parseDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const dayName = (iso) => DAY_NAMES[parseDate(iso).getDay()];
export const shortDate = (iso) => { const d = parseDate(iso); return `${d.getDate()}. ${MONTHS[d.getMonth()]}`; };
export function rangeLabel(start, end) {
  const a = parseDate(start), b = parseDate(end);
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}.–${b.getDate()}. ${MONTHS[b.getMonth()]}`
    : `${shortDate(start)} – ${shortDate(end)}`;
}

export function formatTime(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} t ${m} min` : `${h} t`;
}

const FRACTIONS = [[0.25, "¼"], [0.5, "½"], [0.75, "¾"], [1 / 3, "⅓"], [2 / 3, "⅔"]];

const MEASURED = new Set(["g", "ml", "dl", "ss", "ts", "kg", "l"]);

/** Runder en mengde fornuftig ut fra enheten. I handlelisten rundes stykkvarer opp. */
export function roundAmount(value, unit, shop = false) {
  if (!MEASURED.has(unit)) return shop ? Math.max(1, Math.ceil(value - 0.05)) : Math.max(0.5, Math.round(value * 2) / 2);
  if (unit === "g" || unit === "ml") {
    if (value >= 1000) return Math.round(value / 50) * 50;
    if (value >= 100) return Math.round(value / 10) * 10;
    return Math.max(5, Math.round(value / 5) * 5);
  }
  if (unit === "dl" || unit === "ss" || unit === "ts") return Math.max(0.25, Math.round(value * 4) / 4);
  return Math.round(value * 2) / 2;
}

export function formatNumber(n) {
  const whole = Math.floor(n + 1e-9);
  const frac = n - whole;
  if (frac < 0.01) return String(whole);
  for (const [v, sym] of FRACTIONS) {
    if (Math.abs(frac - v) < 0.02) return whole ? `${whole}${sym}` : sym;
  }
  return n.toLocaleString("nb-NO", { maximumFractionDigits: 1 });
}

/** "1000 g" -> "1 kg", "15 dl" -> "1,5 l" */
export function formatAmount(amount, unit, shop = false) {
  if (amount == null) return "";
  let v = roundAmount(amount, unit, shop);
  let u = unit;
  if (u === "g" && v >= 1000) { v = v / 1000; u = "kg"; return `${v.toLocaleString("nb-NO", { maximumFractionDigits: 2 })} ${u}`; }
  if (u === "dl" && v >= 10) { v = v / 10; u = "l"; return `${v.toLocaleString("nb-NO", { maximumFractionDigits: 2 })} ${u}`; }
  return `${formatNumber(v)} ${u}`;
}

/** Trygg nøkkel for Firebase/localStorage. */
export function slug(s) {
  return String(s).toLowerCase()
    .replace(/æ/g, "ae").replace(/ø/g, "o").replace(/å/g, "a")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";
}

export function randomCode(len = 12) {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export const storage = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* privat modus e.l. */ }
  },
};
