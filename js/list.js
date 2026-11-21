// Familiens løpende handleliste, synkronisert i sanntid via Firebase.
// En lokal kopi gjør at listen vises med en gang og kan leses uten nett.
import { loadDatabase } from "./firebase.js";
import { storage, slug, capitalize } from "./util.js";
import { guessCategory } from "./categories.js";

export class FamilyList {
  constructor(fid) {
    this.fid = fid;
    this.localKey = `shop:list:${fid}`;
    const cached = storage.get(this.localKey, {});
    this.items = cached.items || {};
    this.learned = cached.learned || {};
    this.status = "connecting"; // connecting | online | offline
    this.listeners = new Set();
    this.unsubs = [];
    this.connect();
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(this); }
  save() { storage.set(this.localKey, { items: this.items, learned: this.learned }); }

  async connect() {
    try {
      const fb = await loadDatabase();
      this.fb = fb;
      this.base = `families/${this.fid}`;
      this.unsubs.push(fb.onValue(fb.ref(fb.db, `${this.base}/items`), (s) => {
        this.items = s.val() || {};
        this.save(); this.emit();
      }, (err) => { console.warn("Ingen tilgang til listen:", err); this.status = "offline"; this.emit(); }));
      this.unsubs.push(fb.onValue(fb.ref(fb.db, `${this.base}/learned`), (s) => {
        this.learned = s.val() || {};
        this.save();
      }, () => {}));
      this.unsubs.push(fb.onValue(fb.ref(fb.db, ".info/connected"), (s) => {
        this.status = s.val() ? "online" : "offline";
        this.emit();
      }));
    } catch (err) {
      console.warn("Kunne ikke koble til databasen:", err);
      this.status = "offline"; this.emit();
    }
  }

  disconnect() { this.unsubs.forEach((u) => u()); this.unsubs = []; this.listeners.clear(); }

  /** Oppdaterer lokalt med en gang og sender til skyen. */
  write(updates) {
    for (const [path, value] of Object.entries(updates)) {
      const [bucket, key, field] = path.split("/");
      const target = bucket === "items" ? this.items : this.learned;
      if (field) { if (target[key]) target[key][field] = value; }
      else if (value === null) delete target[key];
      else target[key] = value;
    }
    this.save(); this.emit();
    if (this.fb) this.fb.update(this.fb.ref(this.fb.db, this.base), updates).catch((e) => console.warn("Synk feilet", e));
  }

  /** Legg til vare. Finnes den allerede (uavhuket), skjer ingenting; er den avhuket, settes den tilbake. */
  add(rawName) {
    const name = capitalize(rawName.trim().replace(/\s+/g, " ")).slice(0, 80);
    if (!name) return null;
    const existing = Object.entries(this.items).find(([, it]) => slug(it.name) === slug(name));
    if (existing) {
      const [id, it] = existing;
      if (it.checked) this.write({ [`items/${id}/checked`]: false, [`items/${id}/t`]: Date.now() });
      return { id, duplicate: !it.checked };
    }
    const id = `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    this.write({ [`items/${id}`]: { name, cat: guessCategory(name, this.learned), checked: false, t: Date.now() } });
    return { id, duplicate: false };
  }

  setChecked(id, on) { if (this.items[id]) this.write({ [`items/${id}/checked`]: !!on, [`items/${id}/ct`]: on ? Date.now() : null }); }

  /** Endre navn og/eller avdeling. Avdelingen huskes for neste gang familien legger til samme vare. */
  edit(id, { name, cat }) {
    const it = this.items[id]; if (!it) return;
    const updates = {};
    if (name && name.trim() && name.trim() !== it.name) updates[`items/${id}/name`] = capitalize(name.trim()).slice(0, 80);
    if (cat && cat !== it.cat) {
      updates[`items/${id}/cat`] = cat;
      updates[`learned/${slug(name || it.name)}`] = cat;
    }
    if (Object.keys(updates).length) this.write(updates);
  }

  remove(id) { this.write({ [`items/${id}`]: null }); }

  clearChecked() {
    const updates = {};
    for (const [id, it] of Object.entries(this.items)) if (it.checked) updates[`items/${id}`] = null;
    if (Object.keys(updates).length) this.write(updates);
    return Object.keys(updates).length;
  }

  /** Tøm hele listen. */
  clearAll() {
    const updates = {};
    for (const id of Object.keys(this.items)) updates[`items/${id}`] = null;
    if (Object.keys(updates).length) this.write(updates);
    return Object.keys(updates).length;
  }

  /** Gjenopprett varer (angre). */
  restore(entries) {
    const updates = {};
    for (const [id, it] of entries) updates[`items/${id}`] = it;
    if (Object.keys(updates).length) this.write(updates);
  }
}
