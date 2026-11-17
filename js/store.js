// Lagring av handlelisten.
// - Uten Firebase: lagres i nettleseren (localStorage) på denne enheten.
// - Med Firebase + familiekode: synkroniseres i sanntid mellom alle i familien.
import { firebaseConfig } from "./firebase-config.js";
import { storage, randomCode } from "./util.js";

const FB_VERSION = "10.12.2";
const FAMILY_KEY = "matplan:family";

export const isCloudConfigured = () => !!(firebaseConfig && firebaseConfig.databaseURL);
export const getFamilyCode = () => storage.get(FAMILY_KEY, null);
export function setFamilyCode(code) {
  const clean = String(code || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  storage.set(FAMILY_KEY, clean.length >= 10 ? clean : null);
  return getFamilyCode();
}
export const newFamilyCode = () => setFamilyCode(randomCode(12));

let fbPromise = null;
function loadFirebase() {
  if (!fbPromise) {
    const base = `https://www.gstatic.com/firebasejs/${FB_VERSION}`;
    fbPromise = Promise.all([
      import(`${base}/firebase-app.js`),
      import(`${base}/firebase-database.js`),
    ]).then(([app, db]) => {
      const fbApp = app.initializeApp(firebaseConfig);
      return { db: db.getDatabase(fbApp), ...db };
    });
  }
  return fbPromise;
}

/** Handlelisten for én uke. */
export class ListStore {
  constructor(weekId) {
    this.weekId = weekId;
    this.localKey = `matplan:list:${weekId}`;
    this.state = normalize(storage.get(this.localKey, {}));
    this.listeners = new Set();
    this.status = "local"; // local | connecting | online | offline
    this.remote = null;
    this.unsubscribers = [];
    this.connect();
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(this.state, this.status); }

  async connect() {
    const code = getFamilyCode();
    if (!isCloudConfigured() || !code) { this.status = "local"; this.emit(); return; }
    this.status = "connecting"; this.emit();
    try {
      const fb = await loadFirebase();
      const path = `households/${code}/lists/${this.weekId}`;
      this.remote = { fb, ref: fb.ref(fb.db, path) };

      // Første gang familien kobler til: last opp det som allerede er huket av lokalt.
      const snap = await fb.get(this.remote.ref);
      if (!snap.exists() && (Object.keys(this.state.checked).length || Object.keys(this.state.custom).length)) {
        await fb.set(this.remote.ref, this.state);
      }

      this.unsubscribers.push(fb.onValue(this.remote.ref, (s) => {
        this.state = normalize(s.val() || {});
        storage.set(this.localKey, this.state);
        this.emit();
      }));
      this.unsubscribers.push(fb.onValue(fb.ref(fb.db, ".info/connected"), (s) => {
        this.status = s.val() ? "online" : "offline";
        this.emit();
      }));
    } catch (err) {
      console.warn("Kunne ikke koble til Firebase:", err);
      this.status = "offline";
      this.remote = null;
      this.emit();
    }
  }

  disconnect() { this.unsubscribers.forEach((u) => u()); this.unsubscribers = []; this.listeners.clear(); }

  /** Oppdaterer lokalt med en gang (rask respons) og sender til skyen. */
  patch(updates) {
    for (const [path, value] of Object.entries(updates)) {
      const [bucket, key, field] = path.split("/");
      if (field) {
        if (this.state[bucket][key]) this.state[bucket][key][field] = value;
      } else if (value === null) delete this.state[bucket][key];
      else this.state[bucket][key] = value;
    }
    storage.set(this.localKey, this.state);
    this.emit();
    if (this.remote) {
      this.remote.fb.update(this.remote.ref, updates).catch((e) => console.warn("Synk feilet", e));
    }
  }

  isChecked(key) { return !!this.state.checked[key]; }
  setChecked(key, on) { this.patch({ [`checked/${key}`]: on ? true : null }); }

  addCustom(name) {
    const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    this.patch({ [`custom/${id}`]: { name: name.slice(0, 80), checked: false, t: Date.now() } });
  }
  setCustomChecked(id, on) { this.patch({ [`custom/${id}/checked`]: !!on }); }
  removeCustom(id) { this.patch({ [`custom/${id}`]: null }); }

  reset() {
    const updates = {};
    for (const k of Object.keys(this.state.checked)) updates[`checked/${k}`] = null;
    for (const [id, c] of Object.entries(this.state.custom)) if (c.checked) updates[`custom/${id}`] = null;
    if (Object.keys(updates).length) this.patch(updates);
  }
}

function normalize(s) {
  return { checked: { ...(s.checked || {}) }, custom: { ...(s.custom || {}) } };
}
