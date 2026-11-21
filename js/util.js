// Små hjelpefunksjoner.

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

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

export const fmtDate = (ms) => new Date(ms).toLocaleDateString("nb-NO", { day: "numeric", month: "short" });

/** Stor forbokstav: "melk" -> "Melk" */
export const capitalize = (s) => s.charAt(0).toLocaleUpperCase("nb-NO") + s.slice(1);

export const storage = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* privat modus e.l. */ }
  },
};
