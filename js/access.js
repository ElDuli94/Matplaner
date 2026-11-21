// Familier, roller, invitasjoner og forespørsler.
// Sikkerheten håndheves av databasereglene (database.rules.json) – dette er bare klienten.
//
// Datamodell:
//   admins/{uid}: true
//   users/{uid}: { email, family, role: "owner" | "member", joined }
//   families/{fid}/info: { name, createdAt }
//   families/{fid}/members/{uid}: { email, role }
//   families/{fid}/items/{id}: { name, cat, checked, t }      (kun familiens medlemmer)
//   families/{fid}/learned/{slug}: cat                         (kun familiens medlemmer)
//   invites/{token}: { email, family, familyName, role, createdAt, expires, createdBy, usedBy? }
//   requests/{uid}: { email, at }
import { loadDatabase } from "./firebase.js";
import { storage, randomCode } from "./util.js";

const INVITE_DAYS = 14;
const lower = (s) => String(s || "").trim().toLowerCase();
const db = () => loadDatabase();

/** Hvem er brukeren? { admin, family, familyName, role }. Faller tilbake på sist kjente svar uten nett. */
export async function getAccess(user) {
  const cacheKey = `shop:access:${user.uid}`;
  try {
    const fb = await db();
    const [a, u] = await Promise.all([
      fb.get(fb.ref(fb.db, `admins/${user.uid}`)),
      fb.get(fb.ref(fb.db, `users/${user.uid}`)),
    ]);
    const profile = u.val();
    let familyName = null;
    if (profile?.family) {
      const info = await fb.get(fb.ref(fb.db, `families/${profile.family}/info/name`));
      familyName = info.val();
    }
    const access = { admin: a.val() === true, family: profile?.family || null, role: profile?.role || null, familyName };
    storage.set(cacheKey, access);
    return access;
  } catch (err) {
    console.warn("Kunne ikke sjekke tilgang:", err);
    return storage.get(cacheKey, { admin: false, family: null, role: null, familyName: null });
  }
}

/* ---------- Invitasjoner ---------- */
export const inviteLink = (token) => `${location.origin}${location.pathname}?invitasjon=${token}`;

export async function getInvite(token) {
  const fb = await db();
  const snap = await fb.get(fb.ref(fb.db, `invites/${token}`));
  return snap.exists() ? snap.val() : null;
}

export async function createInvite({ email, family, familyName, role = "member" }, by) {
  const fb = await db();
  const token = randomCode(24);
  const now = Date.now();
  const invite = { email: lower(email), family, familyName: familyName || "", role, createdAt: now, expires: now + INVITE_DAYS * 864e5, createdBy: by.uid };
  await fb.set(fb.ref(fb.db, `invites/${token}`), invite);
  return { id: token, ...invite };
}

export async function deleteInvite(token) { const fb = await db(); await fb.remove(fb.ref(fb.db, `invites/${token}`)); }

/** Invitasjoner til én familie (familieansvarlig). */
export async function familyInvites(fid) {
  const fb = await db();
  const snap = await fb.get(fb.query(fb.ref(fb.db, "invites"), fb.orderByChild("family"), fb.equalTo(fid)));
  return Object.entries(snap.val() || {}).map(([id, v]) => ({ id, ...v })).filter((i) => !i.usedBy).sort((a, b) => b.createdAt - a.createdAt);
}

/** Bruk invitasjonen: blir medlem av familien (atomisk). */
export async function claimInvite(token, invite, user) {
  const fb = await db();
  const email = lower(user.email);
  await fb.update(fb.ref(fb.db), {
    [`users/${user.uid}`]: { email, family: invite.family, role: invite.role, joined: Date.now(), invite: token },
    [`families/${invite.family}/members/${user.uid}`]: { email, role: invite.role, invite: token },
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

/** Alt admin trenger: familier (navn + medlemmer), brukere, invitasjoner og forespørsler. Ikke handlelister. */
export async function loadAdminData() {
  const fb = await db();
  const [users, inv, req, idx] = await Promise.all([
    fb.get(fb.ref(fb.db, "users")),
    fb.get(fb.ref(fb.db, "invites")),
    fb.get(fb.ref(fb.db, "requests")),
    fb.get(fb.ref(fb.db, "familyIndex")),
  ]);
  const toList = (snap) => Object.entries(snap.val() || {}).map(([id, v]) => ({ id, ...v }));
  const families = toList(idx).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const allUsers = toList(users);
  for (const f of families) f.members = allUsers.filter((u) => u.family === f.id).sort((a, b) => (b.role === "owner") - (a.role === "owner") || a.email.localeCompare(b.email));
  const placed = new Set(allUsers.map((u) => u.id));
  return {
    families,
    invites: toList(inv).filter((i) => !i.usedBy).sort((a, b) => b.createdAt - a.createdAt),
    requests: toList(req).filter((r) => !placed.has(r.id)).sort((a, b) => (a.at || 0) - (b.at || 0)),
  };
}

export async function createFamily(name) {
  const fb = await db();
  const fid = randomCode(10);
  const now = Date.now();
  await fb.update(fb.ref(fb.db), {
    [`families/${fid}/info`]: { name: name.trim(), createdAt: now },
    [`familyIndex/${fid}`]: { name: name.trim(), createdAt: now },
  });
  return fid;
}

export async function renameFamily(fid, name) {
  const fb = await db();
  await fb.update(fb.ref(fb.db), { [`families/${fid}/info/name`]: name.trim(), [`familyIndex/${fid}/name`]: name.trim() });
}

/** Sletter familien og handlelisten. Medlemmene blir stående uten familie (må plasseres på nytt). */
export async function deleteFamily(fid, members) {
  const fb = await db();
  const updates = { [`families/${fid}`]: null, [`familyIndex/${fid}`]: null };
  for (const m of members) updates[`users/${m.id}`] = null;
  await fb.update(fb.ref(fb.db), updates);
}

/** Plasser / flytt en bruker til en familie med gitt rolle. */
export async function placeUser(uid, email, fid, role, fromFid = null) {
  const fb = await db();
  const updates = {
    [`users/${uid}`]: { email: lower(email), family: fid, role, joined: Date.now() },
    [`families/${fid}/members/${uid}`]: { email: lower(email), role },
    [`requests/${uid}`]: null,
  };
  if (fromFid && fromFid !== fid) updates[`families/${fromFid}/members/${uid}`] = null;
  await fb.update(fb.ref(fb.db), updates);
}

export async function setRole(uid, fid, role) {
  const fb = await db();
  await fb.update(fb.ref(fb.db), { [`users/${uid}/role`]: role, [`families/${fid}/members/${uid}/role`]: role });
}

/** Fjern et medlem fra familien (admin eller familieansvarlig). Kontoen må plasseres på nytt for å få tilgang. */
export async function removeMember(uid, fid) {
  const fb = await db();
  await fb.update(fb.ref(fb.db), { [`users/${uid}`]: null, [`families/${fid}/members/${uid}`]: null });
}

export async function denyRequest(uid) { const fb = await db(); await fb.remove(fb.ref(fb.db, `requests/${uid}`)); }

/* ---------- Familieansvarlig / medlem ---------- */
export async function familyMembers(fid) {
  const fb = await db();
  const snap = await fb.get(fb.ref(fb.db, `families/${fid}/members`));
  return Object.entries(snap.val() || {}).map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => (b.role === "owner") - (a.role === "owner") || a.email.localeCompare(b.email));
}
