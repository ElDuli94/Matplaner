// Lagring av handlelisten.
// Innloggede brukere deler én liste per uke i Firebase (sanntid).
// En lokal kopi lagres også, slik at listen vises med en gang og fungerer uten nett.
import { loadDatabase } from "./firebase.js";
import { getUser } from "./auth.js";
import { storage } from "./util.js";

/** Handlelisten for én uke. */
export class ListStore {
  constructor(weekId) {
    this.weekId = weekId;
    this.localKey = `matplan:list:${weekId}`;
    this.state = normalize(storage.get(this.localKey, {}));
    this.listeners = new Set();
    this.status = "connecting"; // connecting | online | offline
    this.remote = null;
    this.unsubscribers = [];
    this.connect();
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(this.state, this.status); }

  async connect() {
    if (!getUser()) { this.status = "offline"; this.emit(); return; }
    try {
      const fb = await loadDatabase();
      this.remote = { fb, ref: fb.ref(fb.db, `family/lists/${this.weekId}`) };

      this.unsubscribers.push(fb.onValue(this.remote.ref, (s) => {
        this.state = normalize(s.val() || {});
        storage.set(this.localKey, this.state);
        this.emit();
      }, (err) => {
        console.warn("Ingen tilgang til handlelisten:", err);
        this.status = "offline"; this.emit();
      }));
      this.unsubscribers.push(fb.onValue(fb.ref(fb.db, ".info/connected"), (s) => {
        this.status = s.val() ? "online" : "offline";
        this.emit();
      }));
    } catch (err) {
      console.warn("Kunne ikke koble til databasen:", err);
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

  setChecked(key, on) { this.patch({ [`checked/${key}`]: on ? true : null }); }

  addCustom(name) {
    const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    this.patch({ [`custom/${id}`]: { name: name.slice(0, 80), checked: false, t: Date.now() } });
  }
  setCustomChecked(id, on) {
    if (this.state.custom[id]) this.patch({ [`custom/${id}/checked`]: !!on });
  }
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
