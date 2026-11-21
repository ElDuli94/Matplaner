import { esc, storage, fmtDate } from "./util.js";
import { CATEGORIES, CAT_BY_ID } from "./categories.js";
import { FamilyList } from "./list.js";
import { initAuth, getUser, signIn, signUp, signOut, resetPassword, errorText } from "./auth.js";
import {
  getAccess, getInvite, createInvite, inviteLink, claimInvite, deleteInvite, familyInvites, requestAccess,
  becomeAdmin, loadAdminData, createFamily, renameFamily, deleteFamily, placeUser, setRole, removeMember,
  denyRequest, familyMembers,
} from "./access.js";

const app = document.getElementById("app");
const settingsDialog = document.getElementById("settings");
const editDialog = document.getElementById("editSheet");
const toastEl = document.getElementById("toast");

const state = {
  access: { admin: false, family: null, role: null, familyName: null },
  list: null,
  pendingInvite: null,
  hideChecked: storage.get("shop:hideChecked", false),
};

/* ================= Tema ================= */
function applyTheme(theme) {
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}
applyTheme(storage.get("shop:theme", "auto"));

/* ================= Ruting ================= */
function currentRoute() {
  const p = location.hash.replace(/^#\/?/, "").split("/")[0];
  if (p === "familie") return "family";
  if (p === "admin") return "admin";
  return "list";
}

function render() {
  const route = currentRoute();
  document.querySelectorAll("[data-tab]").forEach((a) => {
    const on = a.dataset.tab === route;
    a.classList.toggle("active", on);
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  if (route === "admin" && state.access.admin) renderAdmin();
  else if (route === "family") renderFamily();
  else renderList();
}

window.addEventListener("hashchange", () => {
  if (!getUser() || document.body.classList.contains("locked")) return;
  render();
  window.scrollTo({ top: 0 });
  app.focus({ preventScroll: true });
});

/* ================= Handleliste ================= */
function remainingCount() {
  if (!state.list) return 0;
  return Object.values(state.list.items).filter((it) => it && it.name && !it.checked).length;
}
function updateBadge() {
  const n = remainingCount();
  document.querySelectorAll("[data-badge]").forEach((b) => { b.textContent = n; b.hidden = n === 0; });
}

function noFamilyHTML() {
  return `
    <section class="page">
      <div class="empty">
        <div class="big">🏠</div>
        <h2>Du er ikke med i en familie ennå</h2>
        <p>${state.access.admin ? "Som administrator kan du opprette en familie og legge deg selv til." : "Be administrator om å legge deg til i en familie."}</p>
        ${state.access.admin ? `<p style="margin-top:14px"><a class="btn btn-primary" href="#/admin">Gå til Admin</a></p>` : ""}
      </div>
    </section>`;
}

function renderList() {
  document.title = "Handleliste – Istrefi Shopping";
  if (!state.access.family) { app.innerHTML = noFamilyHTML(); return; }
  app.innerHTML = `
    <section class="page list-page">
      <div class="list-head">
        <div>
          <div class="eyebrow">${esc(state.access.familyName || "Familien")}</div>
          <h1 class="page-title">Handleliste</h1>
        </div>
        <span class="sync-state" id="syncState"></span>
      </div>
      <form class="add-form sticky-add" id="addForm" autocomplete="off">
        <label class="visually-hidden" for="addInput">Legg til vare</label>
        <input id="addInput" type="text" placeholder="Legg til vare …" enterkeyhint="done" maxlength="80" autocapitalize="sentences">
        <button class="btn btn-primary add-btn" type="submit" aria-label="Legg til">＋</button>
      </form>
      <div id="listBody"></div>
    </section>`;

  const input = app.querySelector("#addInput");
  app.querySelector("#addForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const res = state.list.add(input.value);
    if (res?.duplicate) toast("Står allerede på listen");
    input.value = "";
    input.focus();
  });

  const body = app.querySelector("#listBody");
  body.addEventListener("change", (e) => {
    const id = e.target.dataset.check; if (!id) return;
    state.list.setChecked(id, e.target.checked);
    if (e.target.checked && navigator.vibrate) navigator.vibrate(8);
  });
  body.addEventListener("click", (e) => {
    const ed = e.target.closest("[data-edit]");
    if (ed) { openEdit(ed.dataset.edit); return; }
    if (e.target.closest("#clearBtn")) {
      const removed = Object.entries(state.list.items).filter(([, it]) => it.checked).map(([id, it]) => [id, { ...it }]);
      const n = state.list.clearChecked();
      if (n) toast(`${n} ${n === 1 ? "vare" : "varer"} fjernet`, { label: "Angre", fn: () => state.list.restore(removed) });
    }
    if (e.target.closest("#clearAllBtn")) {
      const all = Object.entries(state.list.items).filter(([, it]) => it && it.name).map(([id, it]) => [id, { ...it }]);
      if (!all.length || !confirm(`Tømme hele handlelisten (${all.length} ${all.length === 1 ? "vare" : "varer"})? Dette gjelder for hele familien.`)) return;
      state.list.clearAll();
      toast("Handlelisten er tømt", { label: "Angre", fn: () => state.list.restore(all) });
    }
    if (e.target.closest("#hideBtn")) {
      state.hideChecked = !state.hideChecked;
      storage.set("shop:hideChecked", state.hideChecked);
      renderListBody();
    }
  });
  renderListBody();
}

function renderListBody() {
  const body = app.querySelector("#listBody");
  if (!body || !state.list) return;

  const s = state.list.status;
  const sync = app.querySelector("#syncState");
  const labels = { connecting: "Kobler til …", online: "Synkronisert", offline: "Frakoblet – synker senere" };
  sync.className = `sync-state ${s}`;
  sync.innerHTML = `<span class="sync-dot"></span>${labels[s]}`;

  const entries = Object.entries(state.list.items).filter(([, it]) => it && it.name);
  const open = entries.filter(([, it]) => !it.checked);
  const done = entries.filter(([, it]) => it.checked).sort((a, b) => (b[1].ct || 0) - (a[1].ct || 0));

  if (!entries.length) {
    body.innerHTML = `<div class="empty"><div class="big">🛒</div><h2>Listen er tom</h2><p>Skriv inn en vare over – den sorteres automatisk etter avdeling.</p></div>`;
    return;
  }

  const row = ([id, it]) => `
    <li class="item ${it.checked ? "is-checked" : ""}">
      <label class="check-hit">
        <input type="checkbox" data-check="${esc(id)}" ${it.checked ? "checked" : ""} aria-label="${esc(it.name)}">
        <span class="box round" aria-hidden="true"></span>
      </label>
      <button class="item-name" type="button" data-edit="${esc(id)}">${esc(it.name)}</button>
    </li>`;

  const groups = CATEGORIES.map((c) => ({ ...c, items: open.filter(([, it]) => (CAT_BY_ID[it.cat] ? it.cat : "annet") === c.id) }))
    .filter((g) => g.items.length);
  for (const g of groups) g.items.sort((a, b) => a[1].name.localeCompare(b[1].name, "nb"));

  body.innerHTML = `
    ${open.length ? `<p class="list-count"><b>${open.length}</b> ${open.length === 1 ? "vare" : "varer"} igjen</p>` : `<div class="all-done">🎉 Alt er i kurven!</div>`}
    <div class="groups">
      ${groups.map((g) => `
        <section class="group">
          <h2 class="group-head"><span aria-hidden="true">${g.icon}</span>${esc(g.name)}<span class="group-count">${g.items.length}</span></h2>
          <ul class="items">${g.items.map(row).join("")}</ul>
        </section>`).join("")}
    </div>
    ${done.length ? `
      <section class="group basket">
        <div class="basket-head">
          <h2 class="group-head"><span aria-hidden="true">🧺</span>I kurven<span class="group-count">${done.length}</span></h2>
          <div class="row">
            <button class="btn btn-sm btn-ghost" type="button" id="hideBtn">${state.hideChecked ? "Vis" : "Skjul"}</button>
            <button class="btn btn-sm" type="button" id="clearBtn">Fjern avhukede</button>
          </div>
        </div>
        ${state.hideChecked ? "" : `<ul class="items">${done.map(row).join("")}</ul>`}
      </section>` : ""}
    <div class="list-footer">
      <button class="btn btn-ghost danger" type="button" id="clearAllBtn">🗑 Tøm hele listen</button>
    </div>`;
}

/* ---------- Rediger vare ---------- */
function openEdit(id) {
  const it = state.list?.items[id]; if (!it) return;
  let cat = CAT_BY_ID[it.cat] ? it.cat : "annet";
  editDialog.innerHTML = `
    <form class="sheet-body" id="editForm">
      <div class="sheet-head"><h2 id="editTitle">Rediger vare</h2><button class="btn btn-sm btn-ghost" type="button" data-close>Avbryt</button></div>
      <label class="field"><span>Navn</span><input id="editName" type="text" maxlength="80" value="${esc(it.name)}"></label>
      <div class="field"><span>Avdeling</span>
        <div class="cat-grid" role="radiogroup" aria-label="Avdeling">
          ${CATEGORIES.map((c) => `<button type="button" class="cat-btn ${c.id === cat ? "on" : ""}" data-cat="${esc(c.id)}" role="radio" aria-checked="${c.id === cat}"><span aria-hidden="true">${c.icon}</span>${esc(c.name)}</button>`).join("")}
        </div>
        <small class="muted">Appen husker avdelingen neste gang dere legger til denne varen.</small>
      </div>
      <div class="row space">
        <button class="btn btn-ghost danger" type="button" id="deleteItem">🗑 Slett</button>
        <button class="btn btn-primary" type="submit">Lagre</button>
      </div>
    </form>`;
  const q = (s) => editDialog.querySelector(s);
  editDialog.querySelectorAll("[data-cat]").forEach((b) => b.addEventListener("click", () => {
    cat = b.dataset.cat;
    editDialog.querySelectorAll("[data-cat]").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", x === b); });
  }));
  q("[data-close]").addEventListener("click", () => editDialog.close());
  q("#deleteItem").addEventListener("click", () => {
    const copy = { ...it };
    state.list.remove(id); editDialog.close();
    toast(`«${it.name}» slettet`, { label: "Angre", fn: () => state.list.restore([[id, copy]]) });
  });
  q("#editForm").addEventListener("submit", (e) => {
    e.preventDefault();
    state.list.edit(id, { name: q("#editName").value, cat });
    editDialog.close();
  });
  editDialog.showModal();
}
editDialog.addEventListener("click", (e) => { if (e.target === editDialog) editDialog.close(); });

/* ================= Familie ================= */
function inviteMailto(invite) {
  const link = inviteLink(invite.id);
  const subject = "Invitasjon til Istrefi Shopping";
  const body = `Hei!\n\nDu er invitert til ${invite.familyName ? `«${invite.familyName}» i ` : ""}Istrefi Shopping – vår felles handleliste.\n\nTrykk på lenken for å lage konto:\n${link}\n\nLenken gjelder i 14 dager.\n`;
  return `mailto:${encodeURIComponent(invite.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function shareInvite(invite) {
  const url = inviteLink(invite.id);
  if (navigator.share) {
    try { await navigator.share({ title: "Invitasjon til Istrefi Shopping", text: "Du er invitert til handlelisten vår:", url }); } catch { /* avbrutt */ }
  } else {
    try { await navigator.clipboard.writeText(url); toast("Lenke kopiert"); } catch { prompt("Kopier lenken:", url); }
  }
}

function inviteReadyHTML(inv) {
  return `
    <div class="invite-ready">
      <p><strong>Invitasjon klar for ${esc(inv.email)}</strong></p>
      <div class="row">
        <a class="btn btn-primary btn-sm" href="${esc(inviteMailto(inv))}">📧 Send på e-post</a>
        <button class="btn btn-sm" type="button" data-share-new>📤 Del lenke</button>
      </div>
    </div>`;
}

const validEmail = (s) => /^\S+@\S+\.\S+$/.test(s);
const roleLabel = (r) => (r === "owner" ? "👑 Ansvarlig" : "Medlem");
const adminItem = (title, sub, actions) => `<li class="admin-item"><div><strong>${esc(title)}</strong><span class="muted">${esc(sub)}</span></div><div class="row">${actions}</div></li>`;
const actBtn = (act, d, label, cls = "", extra = "") => `<button class="btn btn-sm ${cls}" type="button" data-act="${act}" data-id="${esc(d.id)}" data-email="${esc(d.email || "")}" ${extra}>${label}</button>`;

function renderFamily() {
  document.title = "Familie – Istrefi Shopping";
  const a = state.access;
  if (!a.family) { app.innerHTML = noFamilyHTML(); return; }
  const canManage = a.role === "owner" || a.admin;
  app.innerHTML = `
    <section class="page">
      <div class="page-head"><div>
        <div class="eyebrow">Din familie</div>
        <h1 class="page-title">${esc(a.familyName || "Familien")}</h1>
        <p class="lead">${canManage ? "Du kan invitere og fjerne medlemmer i familien." : "Alle her deler den samme handlelisten."}</p>
      </div></div>
      <div class="admin-grid">
        ${canManage ? `<section class="panel">
          <h2>✉️ Inviter til familien</h2>
          <p class="muted">De får en lenke for å lage konto og kommer rett inn i ${esc(a.familyName || "familien")}.</p>
          <form class="add-form" id="famInviteForm" autocomplete="off">
            <label class="visually-hidden" for="famInviteEmail">E-post</label>
            <input id="famInviteEmail" type="email" inputmode="email" autocapitalize="off" placeholder="navn@eksempel.no" required>
            <button class="btn btn-primary" type="submit">Lag</button>
          </form>
          <div id="famNewInvite"></div>
        </section>` : ""}
        <div id="famLists" class="stack"><div class="loading"><div class="spinner"></div></div></div>
      </div>
    </section>`;

  app.querySelector("#famInviteForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = app.querySelector("#famInviteEmail");
    if (!validEmail(input.value.trim())) { toast("Skriv inn en gyldig e-postadresse"); return; }
    try {
      const inv = await createInvite({ email: input.value, family: a.family, familyName: a.familyName, role: "member" }, getUser());
      input.value = "";
      const box = app.querySelector("#famNewInvite");
      box.innerHTML = inviteReadyHTML(inv);
      box.querySelector("[data-share-new]").addEventListener("click", () => shareInvite(inv));
      loadFamilyLists();
    } catch (err) { toast(errorText(err)); }
  });

  app.querySelector("#famLists").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-act]"); if (!b) return;
    const { act, id, email } = b.dataset;
    try {
      if (act === "remove" && confirm(`Fjerne ${email} fra familien? De mister tilgangen til handlelisten.`)) { await removeMember(id, a.family); toast(`${email} er fjernet`); }
      if (act === "share") await shareInvite({ id, email });
      if (act === "delinv" && confirm(`Slette invitasjonen til ${email}?`)) await deleteInvite(id);
      loadFamilyLists();
    } catch (err) { toast(errorText(err)); }
  });

  loadFamilyLists();
}

async function loadFamilyLists() {
  const box = app.querySelector("#famLists"); if (!box) return;
  const a = state.access;
  const canManage = a.role === "owner" || a.admin;
  const me = getUser()?.uid;
  let members = [], invites = [];
  try {
    members = await familyMembers(a.family);
    if (a.admin) invites = (await loadAdminData()).invites.filter((i) => i.family === a.family);
    else if (a.role === "owner") invites = await familyInvites(a.family);
  } catch (err) { box.innerHTML = `<p class="muted">${esc(errorText(err))}</p>`; return; }
  box.innerHTML = `
    <section class="panel">
      <h2>👨‍👩‍👧 Medlemmer <span class="group-count">${members.length}</span></h2>
      <ul class="admin-list">${members.map((m) => adminItem(m.email + (m.id === me ? " (deg)" : ""), roleLabel(m.role),
        canManage && m.id !== me ? actBtn("remove", m, "Fjern", "btn-ghost") : "")).join("")}</ul>
    </section>
    ${canManage ? `<section class="panel">
      <h2>📨 Sendte invitasjoner <span class="group-count">${invites.length}</span></h2>
      ${invites.length ? `<ul class="admin-list">${invites.map((i) => adminItem(i.email, i.expires < Date.now() ? "Utløpt" : `Gjelder til ${fmtDate(i.expires)}`,
        `<a class="btn btn-sm" href="${esc(inviteMailto(i))}" aria-label="Send på nytt">📧</a>` + actBtn("share", i, "📤") + actBtn("delinv", i, "Slett", "btn-ghost"))).join("")}</ul>` : `<p class="muted">Ingen ubrukte invitasjoner.</p>`}
    </section>` : ""}`;
}

/* ================= Admin ================= */
let adminCache = null;

function renderAdmin() {
  document.title = "Admin – Istrefi Shopping";
  app.innerHTML = `
    <section class="page">
      <div class="page-head"><div>
        <div class="eyebrow">Kun for administrator</div>
        <h1 class="page-title">Familier</h1>
        <p class="lead">Opprett familier, plasser nye brukere og styr hvem som er med hvor. Du ser ikke andre familiers handlelister.</p>
      </div></div>
      <div class="admin-grid">
        <div class="stack">
          <section class="panel">
            <h2>➕ Ny familie</h2>
            <form class="add-form" id="newFamilyForm" autocomplete="off">
              <label class="visually-hidden" for="newFamilyName">Navn på familien</label>
              <input id="newFamilyName" type="text" placeholder="F.eks. Familien Istrefi" maxlength="40" required>
              <button class="btn btn-primary" type="submit">Opprett</button>
            </form>
          </section>
          <section class="panel">
            <h2>✉️ Inviter</h2>
            <form class="invite-form" id="adminInviteForm" autocomplete="off">
              <input id="adminInviteEmail" type="email" inputmode="email" autocapitalize="off" placeholder="navn@eksempel.no" required aria-label="E-post">
              <select id="adminInviteFamily" aria-label="Familie"></select>
              <select id="adminInviteRole" aria-label="Rolle"><option value="member">Medlem</option><option value="owner">Familieansvarlig</option></select>
              <button class="btn btn-primary" type="submit">Lag invitasjon</button>
            </form>
            <div id="adminNewInvite"></div>
          </section>
        </div>
        <div id="adminLists" class="stack"><div class="loading"><div class="spinner"></div></div></div>
      </div>
    </section>`;

  app.querySelector("#newFamilyForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = app.querySelector("#newFamilyName");
    const name = input.value.trim(); if (!name) return;
    try { await createFamily(name); toast(`«${name}» er opprettet`); input.value = ""; loadAdminLists(); }
    catch (err) { toast(errorText(err)); }
  });

  app.querySelector("#adminInviteForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = app.querySelector("#adminInviteEmail");
    const fid = app.querySelector("#adminInviteFamily").value;
    const role = app.querySelector("#adminInviteRole").value;
    if (!validEmail(email.value.trim())) { toast("Skriv inn en gyldig e-postadresse"); return; }
    if (!fid) { toast("Opprett en familie først"); return; }
    const fam = adminCache?.families.find((f) => f.id === fid);
    try {
      const inv = await createInvite({ email: email.value, family: fid, familyName: fam?.name, role }, getUser());
      email.value = "";
      const box = app.querySelector("#adminNewInvite");
      box.innerHTML = inviteReadyHTML(inv);
      box.querySelector("[data-share-new]").addEventListener("click", () => shareInvite(inv));
      loadAdminLists();
    } catch (err) { toast(errorText(err)); }
  });

  app.querySelector("#adminLists").addEventListener("click", onAdminAction);
  loadAdminLists();
}

async function onAdminAction(e) {
  const b = e.target.closest("button[data-act]"); if (!b) return;
  const { act, id, email, fid } = b.dataset;
  const me = getUser();
  const fam = adminCache?.families.find((f) => f.id === fid);
  const user = fam?.members.find((m) => m.id === id);
  try {
    if (act === "approve") {
      const li = b.closest("li");
      const target = li.querySelector("select[data-fam]").value;
      const role = li.querySelector("select[data-role]").value;
      if (!target) { toast("Opprett en familie først"); return; }
      await placeUser(id, email, target, role);
      toast(`${email} er lagt til`);
    }
    if (act === "deny" && confirm(`Avslå ${email}?`)) await denyRequest(id);
    if (act === "addme") { await placeUser(me.uid, me.email, fid, "owner", state.access.family); await refreshAccess(); toast("Du er lagt til i familien"); }
    if (act === "owner") await setRole(id, fid, user?.role === "owner" ? "member" : "owner");
    if (act === "move") {
      const target = b.closest("li").querySelector("select[data-move]").value;
      if (target && target !== fid) {
        await placeUser(id, email, target, "member", fid);
        toast(`${email} er flyttet`);
        if (id === me.uid) await refreshAccess();
      }
    }
    if (act === "remove" && confirm(`Fjerne ${email} fra «${fam?.name}»? Kontoen må plasseres på nytt for å få tilgang.`)) {
      await removeMember(id, fid);
      if (id === me.uid) await refreshAccess();
    }
    if (act === "rename") {
      const name = prompt("Nytt navn på familien:", fam?.name || "");
      if (name && name.trim()) { await renameFamily(fid, name); if (fid === state.access.family) await refreshAccess(); }
    }
    if (act === "delfam" && confirm(`Slette «${fam?.name}» og handlelisten deres? Medlemmene (${fam?.members.length || 0}) må plasseres på nytt.`)) {
      await deleteFamily(fid, fam?.members || []);
      if (fid === state.access.family) await refreshAccess();
      toast("Familien er slettet");
    }
    if (act === "share") await shareInvite({ id, email });
    if (act === "delinv" && confirm(`Slette invitasjonen til ${email}?`)) await deleteInvite(id);
    loadAdminLists();
  } catch (err) { toast(errorText(err)); }
}

async function loadAdminLists() {
  const box = app.querySelector("#adminLists"); if (!box) return;
  try { adminCache = await loadAdminData(); } catch (err) { box.innerHTML = `<p class="muted">${esc(errorText(err))}</p>`; return; }
  const { families, invites, requests } = adminCache;
  const me = getUser()?.uid;
  const famOptions = (sel) => families.map((f) => `<option value="${esc(f.id)}" ${f.id === sel ? "selected" : ""}>${esc(f.name)}</option>`).join("");

  const sel = app.querySelector("#adminInviteFamily");
  if (sel) sel.innerHTML = families.length ? famOptions(state.access.family) : `<option value="">Ingen familier ennå</option>`;

  const famName = (fid) => families.find((f) => f.id === fid)?.name || "Slettet familie";
  box.innerHTML = `
    ${requests.length ? `<section class="panel highlight">
      <h2>🙋 Venter på plass <span class="group-count">${requests.length}</span></h2>
      <ul class="admin-list">${requests.map((r) => `
        <li class="admin-item wrap">
          <div><strong>${esc(r.email)}</strong><span class="muted">Registrert ${fmtDate(r.at)}</span></div>
          <div class="row">
            <select data-fam aria-label="Familie">${families.length ? famOptions() : `<option value="">Ingen familier</option>`}</select>
            <select data-role aria-label="Rolle"><option value="member">Medlem</option><option value="owner">Ansvarlig</option></select>
            ${actBtn("approve", r, "Legg til", "btn-primary")}${actBtn("deny", r, "Avslå", "btn-ghost")}
          </div>
        </li>`).join("")}</ul>
    </section>` : ""}

    ${families.length ? families.map((f) => `
      <section class="panel family-card">
        <div class="family-head">
          <h2>🏠 ${esc(f.name)} <span class="group-count">${f.members.length}</span></h2>
          <div class="row">
            ${f.members.some((m) => m.id === me) ? `<span class="pill">Din familie</span>` : `<button class="btn btn-sm" type="button" data-act="addme" data-fid="${esc(f.id)}">Legg meg til</button>`}
            <button class="btn btn-sm btn-ghost" type="button" data-act="rename" data-fid="${esc(f.id)}" aria-label="Gi nytt navn">✏️</button>
            <button class="btn btn-sm btn-ghost" type="button" data-act="delfam" data-fid="${esc(f.id)}" aria-label="Slett familie">🗑</button>
          </div>
        </div>
        ${f.members.length ? `<ul class="admin-list">${f.members.map((m) => `
          <li class="admin-item wrap">
            <div><strong>${esc(m.email)}${m.id === me ? " (deg)" : ""}</strong><span class="muted">${roleLabel(m.role)}</span></div>
            <div class="row">
              ${actBtn("owner", m, m.role === "owner" ? "Gjør til medlem" : "Gjør ansvarlig", "", `data-fid="${esc(f.id)}"`)}
              ${families.length > 1 ? `<select data-move aria-label="Flytt til familie">${famOptions(f.id)}</select>${actBtn("move", m, "Flytt", "", `data-fid="${esc(f.id)}"`)}` : ""}
              ${actBtn("remove", m, "Fjern", "btn-ghost", `data-fid="${esc(f.id)}"`)}
            </div>
          </li>`).join("")}</ul>` : `<p class="muted">Ingen medlemmer ennå. Inviter noen, eller legg til folk fra «Venter på plass».</p>`}
      </section>`).join("") : `<section class="panel"><p class="muted">Ingen familier ennå. Opprett den første med skjemaet «Ny familie».</p></section>`}

    <section class="panel">
      <h2>📨 Ubrukte invitasjoner <span class="group-count">${invites.length}</span></h2>
      ${invites.length ? `<ul class="admin-list">${invites.map((i) => adminItem(i.email, `${famName(i.family)} · ${i.role === "owner" ? "ansvarlig" : "medlem"} · ${i.expires < Date.now() ? "utløpt" : `til ${fmtDate(i.expires)}`}`,
        `<a class="btn btn-sm" href="${esc(inviteMailto({ ...i, familyName: famName(i.family) }))}" aria-label="Send på nytt">📧</a>` + actBtn("share", i, "📤") + actBtn("delinv", i, "Slett", "btn-ghost"))).join("")}</ul>` : `<p class="muted">Ingen ubrukte invitasjoner.</p>`}
    </section>`;
}

/* ================= Innstillinger ================= */
function openSettings() {
  const theme = storage.get("shop:theme", "auto");
  const a = state.access;
  settingsDialog.innerHTML = `
    <div class="sheet-body">
      <div class="sheet-head"><h2 id="settingsTitle">Innstillinger</h2><button class="btn btn-sm btn-ghost" type="button" data-close>Ferdig</button></div>
      <div class="setting">
        <h3>👤 Konto</h3>
        <p>Logget inn som <strong>${esc(getUser()?.email || "")}</strong>${a.familyName ? ` · ${esc(a.familyName)} (${a.role === "owner" ? "ansvarlig" : "medlem"})` : ""}${a.admin ? " · administrator" : ""}.</p>
        <div class="row"><button class="btn btn-sm" type="button" id="logoutBtn">Logg ut</button></div>
      </div>
      <div class="setting">
        <h3>Utseende</h3>
        <div class="segmented" role="group" aria-label="Tema">
          ${[["auto", "Auto"], ["light", "Lyst"], ["dark", "Mørkt"]].map(([v, l]) => `<button type="button" data-theme-btn="${v}" class="${theme === v ? "active" : ""}">${l}</button>`).join("")}
        </div>
      </div>
      <div class="setting">
        <h3>📱 Legg til på hjemskjermen</h3>
        <p>På iPhone: trykk på Del-knappen i Safari og velg «Legg til på Hjem-skjerm». Da åpnes Istrefi Shopping som en egen app.</p>
      </div>
    </div>`;
  const q = (s) => settingsDialog.querySelector(s);
  q("[data-close]").addEventListener("click", () => settingsDialog.close());
  settingsDialog.querySelectorAll("[data-theme-btn]").forEach((b) => b.addEventListener("click", () => {
    storage.set("shop:theme", b.dataset.themeBtn); applyTheme(b.dataset.themeBtn);
    settingsDialog.querySelectorAll("[data-theme-btn]").forEach((x) => x.classList.toggle("active", x === b));
  }));
  q("#logoutBtn").addEventListener("click", async () => { if (confirm("Vil du logge ut?")) await signOut(); });
  settingsDialog.showModal();
}
settingsDialog.addEventListener("click", (e) => { if (e.target === settingsDialog) settingsDialog.close(); });
document.getElementById("settingsBtn").addEventListener("click", openSettings);

/* ================= Innlogging, registrering og tilgang ================= */
function authShell(inner, foot = "🔒 Kun for inviterte. Nye kontoer må godkjennes av administrator.") {
  document.body.classList.add("locked");
  if (settingsDialog.open) settingsDialog.close();
  if (editDialog.open) editDialog.close();
  app.innerHTML = `
    <section class="login">
      <div class="login-card">
        <div class="login-logo" aria-hidden="true"><img src="icons/icon.svg" alt="" width="72" height="72"></div>
        ${inner}
      </div>
      ${foot ? `<p class="login-foot">${foot}</p>` : ""}
    </section>`;
}

const passwordFields = (confirm) => `
  <label class="field"><span>Passord</span>
    <input id="password" type="password" autocomplete="${confirm ? "new-password" : "current-password"}" required minlength="6"></label>
  ${confirm ? `<label class="field"><span>Gjenta passord</span>
    <input id="password2" type="password" autocomplete="new-password" required minlength="6"></label>` : ""}
  <label class="check-row remember">
    <input type="checkbox" id="remember" ${storage.get("shop:remember", true) ? "checked" : ""}>
    <span class="box" aria-hidden="true"></span>
    <span class="label">Husk meg på denne enheten</span>
  </label>`;

function renderLogin(mode = "login", message = "") {
  const register = mode === "register";
  document.title = register ? "Opprett konto – Istrefi Shopping" : "Logg inn – Istrefi Shopping";
  authShell(`
    <h1 class="wordmark">Istrefi<span>Shopping</span></h1>
    <p class="login-sub">${register ? "Opprett en konto. Administrator plasserer deg i riktig familie." : "Familiens felles handleliste"}</p>
    <form id="authForm" novalidate>
      <label class="field"><span>E-post</span>
        <input id="email" type="email" autocomplete="username" inputmode="email" autocapitalize="off" spellcheck="false" required value="${esc(storage.get("shop:lastEmail", ""))}"></label>
      ${passwordFields(register)}
      <p class="login-msg" id="loginMsg" role="alert">${esc(message)}</p>
      <button class="btn btn-primary btn-block" type="submit" id="submitBtn">${register ? "Opprett konto" : "Logg inn"}</button>
    </form>
    ${register ? "" : `<button class="btn btn-ghost btn-sm" type="button" id="forgotBtn">Glemt passord?</button>`}
    <p class="login-switch">${register ? `Har du allerede konto? <button type="button" class="link-btn" id="switchBtn">Logg inn</button>` : `Ny her? <button type="button" class="link-btn" id="switchBtn">Opprett konto</button>`}</p>`);
  hideSplash();

  const email = app.querySelector("#email");
  const msg = app.querySelector("#loginMsg");
  (email.value ? app.querySelector("#password") : email).focus();
  app.querySelector("#switchBtn").addEventListener("click", () => renderLogin(register ? "login" : "register"));
  bindAuthForm((em, pw, rem) => (register ? signUp(em, pw, rem) : signIn(em, pw, rem)), register, register ? "Oppretter konto …" : "Logger inn …");
  app.querySelector("#forgotBtn")?.addEventListener("click", async () => {
    msg.classList.remove("ok");
    if (!email.value.trim()) { msg.textContent = "Skriv inn e-postadressen din først."; email.focus(); return; }
    try {
      await resetPassword(email.value);
      msg.textContent = "Hvis adressen har en konto, er det sendt en e-post med lenke for nytt passord.";
      msg.classList.add("ok");
    } catch (err) { msg.textContent = errorText(err); }
  });
}

function bindAuthForm(action, confirm, busyText) {
  const form = app.querySelector("#authForm");
  const email = app.querySelector("#email");
  const password = app.querySelector("#password");
  const password2 = app.querySelector("#password2");
  const msg = app.querySelector("#loginMsg");
  const btn = app.querySelector("#submitBtn");
  const label = btn.textContent;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = ""; msg.classList.remove("ok");
    if (!email.value.trim() || !password.value) { msg.textContent = "Fyll inn e-post og passord."; return; }
    if (confirm && password.value.length < 6) { msg.textContent = "Passordet må ha minst 6 tegn."; return; }
    if (confirm && password.value !== password2.value) { msg.textContent = "Passordene er ikke like."; password2.focus(); return; }
    btn.disabled = true; btn.textContent = busyText;
    try {
      const remember = app.querySelector("#remember")?.checked ?? true;
      storage.set("shop:remember", remember);
      await action(email.value, password.value, remember);
      storage.set("shop:lastEmail", email.value.trim());
    } catch (err) {
      msg.textContent = errorText(err);
      btn.disabled = false; btn.textContent = label;
    }
  });
}

async function renderInvite(token, mode = "register") {
  authShell(`<div class="spinner" aria-hidden="true"></div><p class="login-sub">Henter invitasjonen …</p>`, "");
  let invite = null;
  try { invite = await getInvite(token); } catch { /* ugyldig / uten nett */ }

  if (!invite || invite.usedBy || invite.expires < Date.now()) {
    state.pendingInvite = null; storage.set("shop:invite", null);
    authShell(`
      <h1>Invitasjonen gjelder ikke</h1>
      <p class="login-sub">${!invite ? "Lenken er ugyldig eller slettet." : invite.usedBy ? "Invitasjonen er allerede brukt." : "Invitasjonen har gått ut på dato."} Be om en ny invitasjon, eller logg inn hvis du allerede har konto.</p>
      <button class="btn btn-primary btn-block" type="button" id="toLogin">Til innlogging</button>`);
    app.querySelector("#toLogin").addEventListener("click", () => renderLogin());
    hideSplash();
    return;
  }

  const register = mode === "register";
  document.title = "Invitasjon – Istrefi Shopping";
  authShell(`
    <h1>Du er invitert! 🎉</h1>
    <p class="login-sub">${invite.familyName ? `Bli med i handlelisten til <strong>${esc(invite.familyName)}</strong>. ` : ""}${register ? "Lag et passord for å komme i gang." : "Logg inn for å godta invitasjonen."}</p>
    <form id="authForm" novalidate>
      <label class="field"><span>E-post</span>
        <input id="email" type="email" autocomplete="username" value="${esc(invite.email)}" readonly></label>
      ${passwordFields(register)}
      <p class="login-msg" id="loginMsg" role="alert"></p>
      <button class="btn btn-primary btn-block" type="submit" id="submitBtn">${register ? "Opprett konto" : "Logg inn"}</button>
    </form>
    <p class="login-switch">${register ? `Har du allerede konto? <button type="button" class="link-btn" id="switchBtn">Logg inn</button>` : `Ny bruker? <button type="button" class="link-btn" id="switchBtn">Opprett konto</button>`}</p>`,
  "🔒 Invitasjonen gjelder bare for denne e-postadressen.");
  hideSplash();
  app.querySelector("#password").focus();
  app.querySelector("#switchBtn").addEventListener("click", () => renderInvite(token, register ? "login" : "register"));
  bindAuthForm(async (em, pw, rem) => {
    try { await (register ? signUp(em, pw, rem) : signIn(em, pw, rem)); }
    catch (err) { if (err?.code === "auth/email-already-in-use") renderInvite(token, "login"); throw err; }
  }, register, register ? "Oppretter konto …" : "Logger inn …");
}

function renderPending(user, rulesProblem = false) {
  document.title = "Venter på godkjenning – Istrefi Shopping";
  authShell(`
    <h1>Venter på godkjenning</h1>
    <p class="login-sub">Kontoen <strong>${esc(user.email)}</strong> er opprettet. Administrator må legge deg til i en familie før du ser handlelisten.</p>
    <p class="login-msg" id="loginMsg" role="alert">${rulesProblem ? "Får ikke kontakt med databasen som forventet. Sjekk at de nyeste databasereglene er publisert i Firebase." : ""}</p>
    <button class="btn btn-primary btn-block" type="button" id="recheckBtn">Sjekk igjen</button>
    <button class="btn btn-ghost btn-sm" type="button" id="logoutBtn2">Logg ut</button>
    <button class="link-btn small" type="button" id="adminBtn">Er du administrator?</button>`, "");
  hideSplash();
  app.querySelector("#recheckBtn").addEventListener("click", () => onAuthChange(user));
  app.querySelector("#logoutBtn2").addEventListener("click", () => signOut());
  app.querySelector("#adminBtn").addEventListener("click", async () => {
    const msg = app.querySelector("#loginMsg");
    msg.textContent = "Sjekker …";
    try { await becomeAdmin(user); onAuthChange(user); }
    catch (err) {
      console.warn(err);
      msg.textContent = "Kunne ikke gjøre kontoen til administrator. Enten er de nye databasereglene ikke publisert, eller så er det allerede registrert en administrator (en annen konto-ID) i databasen.";
    }
  });
}

/** Hent tilgang på nytt (f.eks. etter at admin har endret egen familie) og koble til riktig liste. */
async function refreshAccess() {
  state.access = await getAccess(getUser());
  connectList();
  applyChrome();
}

function connectList() {
  const fid = state.access.family;
  if (state.list?.fid === fid) return;
  state.list?.disconnect();
  state.list = fid ? new FamilyList(fid) : null;
  state.list?.onChange(() => { updateBadge(); if (currentRoute() === "list") renderListBody(); });
  updateBadge();
}

function applyChrome() {
  document.querySelectorAll("[data-admin-only]").forEach((el) => { el.hidden = !state.access.admin; });
  document.getElementById("brandFamily").textContent = state.access.familyName || "";
}

let authSeq = 0;
async function onAuthChange(user) {
  const seq = ++authSeq;
  if (!user) {
    state.list?.disconnect(); state.list = null;
    state.access = { admin: false, family: null, role: null, familyName: null };
    updateBadge();
    if (state.pendingInvite) renderInvite(state.pendingInvite); else renderLogin();
    return;
  }
  authShell(`<div class="spinner" aria-hidden="true"></div><p class="login-sub">Logger inn …</p>`, "");
  try {
    if (state.pendingInvite) {
      const token = state.pendingInvite;
      state.pendingInvite = null; storage.set("shop:invite", null);
      try {
        const invite = await getInvite(token);
        if (!invite) throw new Error("ugyldig");
        await claimInvite(token, invite, user);
        toast(`Velkommen til ${invite.familyName || "handlelisten"}! 🎉`);
      } catch (err) { console.warn("Kunne ikke bruke invitasjonen", err); toast("Invitasjonen gjelder ikke for denne kontoen"); }
    }
    const access = await getAccess(user);
    if (seq !== authSeq) return;
    state.access = access;
    if (access.admin || access.family) {
      document.body.classList.remove("locked");
      connectList();
      applyChrome();
      render();
      hideSplash();
    } else {
      requestAccess(user).catch(() => {});
      renderPending(user, access.rulesProblem);
    }
  } catch (err) { showLoadError(err); }
}

function showLoadError(err) {
  console.error(err);
  hideSplash();
  app.innerHTML = `<section class="page"><div class="empty"><div class="big">📡</div><p>Kunne ikke laste. Sjekk nettet og prøv igjen.</p><p style="margin-top:12px"><button class="btn" onclick="location.reload()">Prøv igjen</button></p></div></section>`;
}

/* ================= Lasteskjerm ================= */
const SPLASH_MIN_MS = 1900; // lang nok til at animasjonen rekker å vises
function hideSplash() {
  const el = document.getElementById("splash");
  if (!el || el.dataset.done) return;
  el.dataset.done = "1";
  const wait = Math.max(0, SPLASH_MIN_MS - performance.now());
  setTimeout(() => {
    el.classList.add("hide");
    setTimeout(() => el.remove(), 600);
  }, wait);
}

/* ================= Diverse ================= */
let toastTimer;
function toast(msg, action = null) {
  toastEl.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button" class="toast-action">${esc(action.label)}</button>` : ""}`;
  if (action) toastEl.querySelector(".toast-action").addEventListener("click", () => { action.fn(); toastEl.classList.remove("show"); });
  toastEl.classList.add("show");
  toastEl.style.pointerEvents = action ? "auto" : "none";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), action ? 5000 : 2600);
}

const topbar = document.querySelector(".topbar");
window.addEventListener("scroll", () => topbar.classList.toggle("scrolled", window.scrollY > 4), { passive: true });

/* ================= Oppstart ================= */
async function init() {
  const params = new URLSearchParams(location.search);
  const token = params.get("invitasjon");
  if (token && /^[a-z0-9]{10,64}$/.test(token)) storage.set("shop:invite", token);
  if (params.has("invitasjon")) history.replaceState(null, "", location.pathname + location.hash);
  state.pendingInvite = storage.get("shop:invite", null);

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  try {
    const user = await initAuth(onAuthChange);
    onAuthChange(user);
  } catch (err) { showLoadError(err); }
}

init();
