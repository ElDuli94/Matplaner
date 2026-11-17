// Tilgangsstyring: administrator, medlemmer, invitasjoner og forespørsler.
// Selve sikkerheten håndheves av databasereglene (database.rules.json).
import { loadDatabase } from "./firebase.js";
import { storage, randomCode } from "./util.js";

const INVITE_DAYS = 14;

async function db() { return loadDatabase(); }
const lower = (s) => String(s || "").trim().toLowerCase();

/** Er brukeren admin og/eller medlem? Faller tilbake på sist kjente svar uten nett. */
export async function getAccess(user) {
  const cacheKey = `matplan:access:${user.uid}`;
  try {
    const fb = await db();
    const [a, m] = await Promise.all([
      fb.get(fb.ref(fb.db, `admins/${user.uid}`)),
      fb.get(fb.ref(fb.db, `members/${user.uid}`)),
    ]);
    const access = { admin: a.val() === true, member: m.exists() };
    storage.set(cacheKey, access);
    return access;
  } catch (err) {
    console.warn("Kunne ikke sjekke tilgang:", err);
    return storage.get(cacheKey, { admin: false, member: false });
  }
}

/* ---------- Invitasjoner ---------- */
export async function getInvite(token) {
  const fb = await db();
  const snap = await fb.get(fb.ref(fb.db, `invites/${token}`));
  return snap.exists() ? snap.val() : null;
}

export async function createInvite(email, admin) {
  const fb = await db();
  const token = randomCode(24);
  const now = Date.now();
  const invite = { email: lower(email), createdAt: now, expires: now + INVITE_DAYS * 864e5, createdBy: admin.uid };
  await fb.set(fb.ref(fb.db, `invites/${token}`), invite);
  return { token, ...invite };
}

export function inviteLink(token) {
  return `${location.origin}${location.pathname}?invitasjon=${token}`;
}

/** Gjør innlogget bruker til medlem ved hjelp av invitasjonen (atomisk). */
export async function claimInvite(token, user) {
  const fb = await db();
  await fb.update(fb.ref(fb.db), {
    [`members/${user.uid}`]: { email: lower(user.email), joined: Date.now(), invite: token },
    [`invites/${token}/usedBy`]: user.uid,
    [`requests/${user.uid}`]: null,
  });
}

/* ---------- Forespørsler (selvregistrerte) ---------- */
export async function requestAccess(user) {
  const fb = await db();
  const r = fb.ref(fb.db, `requests/${user.uid}`);
  const snap = await fb.get(r);
  if (!snap.exists()) await fb.set(r, { email: lower(user.email), at: Date.now() });
}

/* ---------- Administrator ---------- */
export async function becomeAdmin(user) {
  const fb = await db();
  await fb.update(fb.ref(fb.db), { [`admins/${user.uid}`]: true, [`requests/${user.uid}`]: null });
}

export async function loadAdminData() {
  const fb = await db();
  const [inv, mem, req] = await Promise.all([
    fb.get(fb.ref(fb.db, "invites")),
    fb.get(fb.ref(fb.db, "members")),
    fb.get(fb.ref(fb.db, "requests")),
  ]);
  const toList = (snap) => Object.entries(snap.val() || {}).map(([id, v]) => ({ id, ...v }));
  const memberIds = new Set(Object.keys(mem.val() || {}));
  return {
    invites: toList(inv).filter((i) => !i.usedBy).sort((a, b) => b.createdAt - a.createdAt),
    members: toList(mem).sort((a, b) => (a.joined || 0) - (b.joined || 0)),
    requests: toList(req).filter((r) => !memberIds.has(r.id)).sort((a, b) => (a.at || 0) - (b.at || 0)),
  };
}

export async function approveRequest(uid, email) {
  const fb = await db();
  await fb.update(fb.ref(fb.db), {
    [`members/${uid}`]: { email: lower(email), joined: Date.now(), approved: true },
    [`requests/${uid}`]: null,
  });
}
export async function denyRequest(uid) { const fb = await db(); await fb.remove(fb.ref(fb.db, `requests/${uid}`)); }
export async function deleteInvite(token) { const fb = await db(); await fb.remove(fb.ref(fb.db, `invites/${token}`)); }
export async function removeMember(uid) { const fb = await db(); await fb.remove(fb.ref(fb.db, `members/${uid}`)); }
