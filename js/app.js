import { esc, dayName, shortDate, rangeLabel, todayISO, formatTime, formatAmount, storage, slug } from "./util.js";
import { buildShoppingList } from "./shopping.js";
import { ListStore } from "./store.js";
import { initAuth, getUser, signIn, signOut, resetPassword, errorText } from "./auth.js";

const app = document.getElementById("app");
const settingsDialog = document.getElementById("settings");
const toastEl = document.getElementById("toast");

const state = {
  weeks: [],
  weekCache: new Map(),
  week: null,
  store: null,
  servings: storage.get("matplan:servings", 4),
  hideChecked: storage.get("matplan:hideChecked", false),
  closedGroups: new Set(storage.get("matplan:closedGroups", ["basis"])),
  wakeLock: null,
};

/* ---------------- Tema ---------------- */
function applyTheme(theme) {
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}
applyTheme(storage.get("matplan:theme", "auto"));

/* ---------------- Data ---------------- */
async function fetchJSON(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function loadWeek(id) {
  if (!state.weekCache.has(id)) state.weekCache.set(id, fetchJSON(`data/weeks/${id}.json`));
  return state.weekCache.get(id);
}

function pickDefaultWeek(weeks) {
  const today = todayISO();
  const current = weeks.find((w) => w.start <= today && today <= w.end);
  if (current) return current.id;
  const past = weeks.filter((w) => w.start <= today).sort((a, b) => b.start.localeCompare(a.start));
  if (past.length) {
    // Har det kommet en plan for neste uke, vis den i stedet for en gammel uke
    const upcoming = weeks.filter((w) => w.start > today).sort((a, b) => a.start.localeCompare(b.start));
    return (upcoming[0] || past[0]).id;
  }
  return weeks[0].id;
}

async function selectWeek(id) {
  const week = await loadWeek(id);
  if (state.week?.id === week.id) return;
  state.week = week;
  storage.set("matplan:week", id);
  state.store?.disconnect();
  state.store = new ListStore(week.id);
  state.store.onChange(() => {
    updateBadge();
    if (currentRoute().name === "list") renderListBody();
  });
  updateBadge();
}

/* ---------------- Ruting ---------------- */
function currentRoute() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] === "handleliste") return { name: "list" };
  if (parts[0] === "oppskrift" && parts[1]) return { name: "recipe", id: parts[1] };
  if (parts[0] === "uke" && parts[1]) return { name: "week", weekId: parts[1] };
  return { name: "week" };
}

async function render() {
  const route = currentRoute();
  if (route.weekId && state.weeks.some((w) => w.id === route.weekId)) {
    await selectWeek(route.weekId);
  }
  releaseWakeLock();
  document.querySelectorAll("[data-tab]").forEach((a) => {
    a.classList.toggle("active", (a.dataset.tab === "handleliste") === (route.name === "list"));
    if (a.classList.contains("active")) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });

  if (route.name === "list") renderList();
  else if (route.name === "recipe") renderRecipe(route.id);
  else renderWeek();
}

window.addEventListener("hashchange", () => {
  if (!getUser() || !state.week) return;
  render().then(() => { window.scrollTo({ top: 0 }); app.focus({ preventScroll: true }); });
});

/* ---------------- Ukeplan ---------------- */
function weekSelectHTML() {
  if (state.weeks.length < 2) return "";
  const opts = [...state.weeks].sort((a, b) => b.start.localeCompare(a.start))
    .map((w) => `<option value="${esc(w.id)}" ${w.id === state.week.id ? "selected" : ""}>${esc(w.title)} · ${esc(rangeLabel(w.start, w.end))}</option>`).join("");
  return `<label class="visually-hidden" for="weekSelect">Velg uke</label><select id="weekSelect" class="week-select">${opts}</select>`;
}

function renderWeek() {
  const w = state.week;
  const today = todayISO();
  const todayDay = w.days.find((d) => d.date === today);
  document.title = `Matplan – ${w.title}`;

  const hero = todayDay ? (() => {
    const r = w.recipes[todayDay.recipe];
    return `
      <a class="today" href="#/oppskrift/${esc(todayDay.recipe)}" style="--h:${r.hue ?? 30}">
        <div class="today-emoji" aria-hidden="true">${r.emoji}</div>
        <div>
          <div class="today-label">I dag · ${esc(dayName(today))}</div>
          <h2>${esc(r.title)}</h2>
          <div class="today-meta"><span>⏱ ${formatTime(r.time)}</span><span>👨‍🍳 ${esc(r.difficulty)}</span></div>
          <span class="today-cta">Se oppskrift →</span>
        </div>
      </a>` })() : "";

  const cards = w.days.map((d) => {
    const r = w.recipes[d.recipe];
    if (!r) return "";
    const isToday = d.date === today;
    const isPast = d.date < today;
    return `
      <a class="day ${isToday ? "is-today" : ""} ${isPast ? "is-past" : ""}" href="#/oppskrift/${esc(d.recipe)}" style="--h:${r.hue ?? 30}">
        <div class="day-emoji" aria-hidden="true">${r.emoji}</div>
        <div>
          <div class="day-when">${esc(dayName(d.date))} · ${esc(shortDate(d.date))} ${isToday ? '<span class="pill-today">I dag</span>' : ""}</div>
          <h3>${esc(r.title)}</h3>
          <div class="chips">
            <span class="chip chip-accent">⏱ ${formatTime(r.time)}</span>
            ${(r.tags || []).slice(0, 2).map((t) => `<span class="chip">${esc(t)}</span>`).join("")}
          </div>
        </div>
      </a>`;
  }).join("");

  app.innerHTML = `
    <section class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">${esc(rangeLabel(w.start, w.end))}</div>
          <h1 class="page-title">${esc(w.title)}</h1>
          ${w.intro ? `<p class="lead">${esc(w.intro)}</p>` : ""}
        </div>
        ${weekSelectHTML()}
      </div>
      ${hero}
      <div class="days">${cards}</div>
      <div class="week-summary">
        <div>
          <strong>Klar for å handle?</strong>
          <p>Alt du trenger til ${w.days.length} middager for ${state.servings} personer, sortert etter avdeling.</p>
        </div>
        <a class="btn btn-primary" href="#/handleliste">🛒 Åpne handlelisten</a>
      </div>
    </section>`;

  app.querySelector("#weekSelect")?.addEventListener("change", (e) => { location.hash = `#/uke/${e.target.value}`; });
}

/* ---------------- Oppskrift ---------------- */
function cookKey(id) { return `matplan:cook:${state.week.id}:${id}`; }

function renderRecipe(id) {
  const w = state.week;
  const r = w.recipes[id];
  if (!r) { app.innerHTML = `<section class="page"><div class="empty"><div class="big">🤔</div><p>Fant ikke oppskriften.</p><p><a class="btn" href="#/">Til ukeplanen</a></p></div></section>`; return; }

  const idx = w.days.findIndex((d) => d.recipe === id);
  const day = w.days[idx];
  const prev = w.days[idx - 1], next = w.days[idx + 1];
  const cook = storage.get(cookKey(id), { ing: [], steps: [] });
  let servings = state.servings;
  document.title = `${r.title} – Matplan`;

  const ingredientRows = () => {
    const f = servings / (w.baseServings || 4);
    const main = r.ingredients.filter((i) => i.cat !== "basis");
    const basis = r.ingredients.filter((i) => i.cat === "basis");
    const row = (i) => {
      const k = slug(i.name);
      const amt = i.amount != null ? formatAmount(i.amount * f, i.unit || "stk") : "etter smak";
      return `<li><label class="check-row">
        <input type="checkbox" data-ing="${esc(k)}" ${cook.ing.includes(k) ? "checked" : ""}>
        <span class="box" aria-hidden="true"></span>
        <span class="label">${esc(i.name)}${i.note ? `<span class="note">${esc(i.note)}</span>` : ""}</span>
        <span class="amount">${esc(amt)}</span>
      </label></li>`;
    };
    return `<ul class="ingredients">${main.map(row).join("")}</ul>
      ${basis.length ? `<div class="ing-sub">Krydder og basis</div><ul class="ingredients">${basis.map(row).join("")}</ul>` : ""}`;
  };

  const currentStep = () => r.steps.findIndex((_, i) => !cook.steps.includes(i));
  const stepsHTML = () => {
    const cur = currentStep();
    return r.steps.map((s, i) => `
      <li class="step ${cook.steps.includes(i) ? "done" : ""} ${i === cur ? "current" : ""}" data-step="${i}" role="button" tabindex="0" aria-pressed="${cook.steps.includes(i)}">
        <div class="step-num"><span>${i + 1}</span></div>
        <div><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div>
      </li>`).join("");
  };

  const navLink = (d, dir) => {
    if (!d) return "<span></span>";
    const rr = w.recipes[d.recipe];
    return `<a class="btn ${dir}" href="#/oppskrift/${esc(d.recipe)}">${dir === "prev" ? "← " : ""}${esc(dayName(d.date))}: ${esc(rr.title.split(" med ")[0])}${dir === "next" ? " →" : ""}</a>`;
  };

  app.innerHTML = `
    <article class="page">
      <a class="back" href="#/">← Ukeplan</a>
      <header class="recipe-hero" style="--h:${r.hue ?? 30}">
        <div class="hero-top">
          <div class="hero-emoji" aria-hidden="true">${r.emoji}</div>
          <div>
            ${day ? `<div class="day-label">${esc(dayName(day.date))} · ${esc(shortDate(day.date))}</div>` : ""}
            <h1>${esc(r.title)}</h1>
          </div>
        </div>
        <p>${esc(r.description)}</p>
        <div class="hero-stats">
          <span class="hero-stat">⏱ <b>${formatTime(r.time)}</b>${r.activeTime ? ` (aktiv ${formatTime(r.activeTime)})` : ""}</span>
          <span class="hero-stat">👨‍🍳 ${esc(r.difficulty)}</span>
          ${(r.tags || []).map((t) => `<span class="hero-stat">${esc(t)}</span>`).join("")}
        </div>
      </header>

      <div class="recipe-layout">
        <section class="panel panel-ingredients" aria-labelledby="ingTitle">
          <div class="panel-head">
            <h2 id="ingTitle">Ingredienser</h2>
            <div class="stepper" role="group" aria-label="Antall porsjoner">
              <button type="button" data-serv="-1" aria-label="Færre porsjoner">−</button>
              <output id="servOut" aria-live="polite">${servings} pers.</output>
              <button type="button" data-serv="1" aria-label="Flere porsjoner">+</button>
            </div>
          </div>
          <div id="ingList">${ingredientRows()}</div>
        </section>

        <section class="panel" aria-labelledby="stepTitle">
          <div class="panel-head"><h2 id="stepTitle">Fremgangsmåte</h2></div>
          <div class="cook-bar">
            ${"wakeLock" in navigator ? `<button class="btn btn-sm" type="button" id="wakeBtn">🔆 Hold skjermen på</button>` : ""}
            <button class="btn btn-sm btn-ghost" type="button" id="resetCook">Nullstill</button>
            <span class="hint">Trykk på et steg når det er gjort.</span>
          </div>
          <ol class="steps" id="steps">${stepsHTML()}</ol>

          <div class="notes">
            ${r.health ? `<div class="note-card note-health"><h3>💚 Hvorfor sunt</h3><p>${esc(r.health)}</p></div>` : ""}
            ${r.kids ? `<div class="note-card note-kids"><h3>🧒 Barnetips</h3><p>${esc(r.kids)}</p></div>` : ""}
            ${r.tips?.length ? `<div class="note-card note-tips"><h3>💡 Tips</h3><ul>${r.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>` : ""}
          </div>
        </section>
      </div>

      <nav class="recipe-nav" aria-label="Andre dager">${navLink(prev, "prev")}${navLink(next, "next")}</nav>
    </article>`;

  const saveCook = () => storage.set(cookKey(id), cook);
  const ingList = app.querySelector("#ingList");
  const stepsEl = app.querySelector("#steps");

  app.querySelectorAll("[data-serv]").forEach((b) => b.addEventListener("click", () => {
    servings = Math.min(12, Math.max(1, servings + Number(b.dataset.serv)));
    app.querySelector("#servOut").textContent = `${servings} pers.`;
    ingList.innerHTML = ingredientRows();
  }));
  ingList.addEventListener("change", (e) => {
    const k = e.target.dataset.ing; if (!k) return;
    cook.ing = e.target.checked ? [...new Set([...cook.ing, k])] : cook.ing.filter((x) => x !== k);
    saveCook();
  });
  const toggleStep = (el) => {
    const i = Number(el.dataset.step);
    cook.steps = cook.steps.includes(i) ? cook.steps.filter((x) => x !== i) : [...cook.steps, i];
    saveCook();
    stepsEl.innerHTML = stepsHTML();
    stepsEl.querySelector(".current")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
  stepsEl.addEventListener("click", (e) => { const el = e.target.closest("[data-step]"); if (el) toggleStep(el); });
  stepsEl.addEventListener("keydown", (e) => {
    const el = e.target.closest("[data-step]");
    if (el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggleStep(el); }
  });
  app.querySelector("#resetCook").addEventListener("click", () => {
    cook.ing = []; cook.steps = []; saveCook();
    ingList.innerHTML = ingredientRows(); stepsEl.innerHTML = stepsHTML();
  });
  app.querySelector("#wakeBtn")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    if (state.wakeLock) { releaseWakeLock(); return; }
    try {
      state.wakeLock = await navigator.wakeLock.request("screen");
      btn.classList.add("on"); btn.textContent = "🔆 Skjermen holdes på";
      state.wakeLock.addEventListener("release", () => { state.wakeLock = null; btn.classList.remove("on"); btn.textContent = "🔆 Hold skjermen på"; });
    } catch { toast("Kunne ikke holde skjermen på"); }
  });
}

function releaseWakeLock() { state.wakeLock?.release().catch(() => {}); state.wakeLock = null; }

/* ---------------- Handleliste ---------------- */
function listCounts() {
  if (!state.week || !state.store) return { total: 0, done: 0 };
  const groups = buildShoppingList(state.week, state.servings).filter((g) => !g.pantry);
  const st = state.store.state;
  let total = 0, done = 0;
  for (const g of groups) for (const it of g.items) { total++; if (st.checked[it.key]) done++; }
  for (const c of Object.values(st.custom)) { if (!c?.name) continue; total++; if (c.checked) done++; }
  return { total, done };
}

function updateBadge() {
  const { total, done } = listCounts();
  const left = total - done;
  document.querySelectorAll("[data-badge]").forEach((b) => { b.textContent = left; b.hidden = left <= 0; });
}

function renderList() {
  const w = state.week;
  document.title = `Handleliste – ${w.title}`;
  app.innerHTML = `
    <section class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">${esc(w.title)} · ${esc(rangeLabel(w.start, w.end))}</div>
          <h1 class="page-title">Handleliste</h1>
          <p class="lead">Mengder for <strong>${state.servings} personer</strong>, sortert etter avdelingene på Rema 1000.</p>
        </div>
        ${weekSelectHTML()}
      </div>
      <div class="progress-wrap" id="progress"></div>
      <form class="add-form" id="addForm" autocomplete="off">
        <label class="visually-hidden" for="addInput">Legg til vare</label>
        <input id="addInput" type="text" placeholder="Legg til egen vare, f.eks. melk" enterkeyhint="done" maxlength="80">
        <button class="btn btn-primary" type="submit" aria-label="Legg til">＋</button>
      </form>
      <div class="list-tools">
        <button class="btn btn-sm ${state.hideChecked ? "on" : ""}" type="button" id="hideBtn">${state.hideChecked ? "Vis avhuket" : "Skjul avhuket"}</button>
        <button class="btn btn-sm btn-ghost" type="button" id="resetBtn">Nullstill</button>
        <span class="sync-state" id="syncState"></span>
      </div>
      <div id="listBody"></div>
    </section>`;

  app.querySelector("#weekSelect")?.addEventListener("change", async (e) => {
    await selectWeek(e.target.value); renderList();
  });
  app.querySelector("#addForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = app.querySelector("#addInput");
    const name = input.value.trim();
    if (!name) return;
    state.store.addCustom(name);
    input.value = "";
    input.focus();
  });
  app.querySelector("#hideBtn").addEventListener("click", (e) => {
    state.hideChecked = !state.hideChecked;
    storage.set("matplan:hideChecked", state.hideChecked);
    e.currentTarget.classList.toggle("on", state.hideChecked);
    e.currentTarget.textContent = state.hideChecked ? "Vis avhuket" : "Skjul avhuket";
    renderListBody();
  });
  app.querySelector("#resetBtn").addEventListener("click", () => {
    if (confirm("Fjerne alle avhukinger (og egne varer som er huket av)?\nDette gjelder for hele familien.")) state.store.reset();
  });

  const body = app.querySelector("#listBody");
  body.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.key) state.store.setChecked(t.dataset.key, t.checked);
    if (t.dataset.custom) state.store.setCustomChecked(t.dataset.custom, t.checked);
    if (t.checked && navigator.vibrate) navigator.vibrate(8);
  });
  body.addEventListener("click", (e) => {
    const rm = e.target.closest("[data-remove]");
    if (rm) state.store.removeCustom(rm.dataset.remove);
  });
  body.addEventListener("toggle", (e) => {
    const d = e.target; if (!d.dataset?.group) return;
    if (d.open) state.closedGroups.delete(d.dataset.group); else state.closedGroups.add(d.dataset.group);
    storage.set("matplan:closedGroups", [...state.closedGroups]);
  }, true);

  renderListBody();
}

function renderListBody() {
  const body = app.querySelector("#listBody");
  if (!body) return;
  const st = state.store.state;
  const groups = buildShoppingList(state.week, state.servings);

  // Fremdrift
  const { total, done } = listCounts();
  const pct = total ? Math.round((done / total) * 100) : 0;
  app.querySelector("#progress").innerHTML = `
    <div class="progress-top"><span><b>${done}</b> av ${total} varer i kurven</span><span>${pct === 100 ? "🎉 Ferdig!" : `${pct} %`}</span></div>
    <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>`;

  // Synk-status
  const s = state.store.status;
  const sync = app.querySelector("#syncState");
  const labels = { connecting: "Kobler til …", online: "Delt med familien", offline: "Frakoblet – synker senere" };
  sync.className = `sync-state ${s}`;
  sync.innerHTML = `<span class="sync-dot"></span>${labels[s]}`;

  const row = (it) => {
    const checked = !!st.checked[it.key];
    const amount = it.amounts.map(([u, v]) => formatAmount(v, u, true)).join(" + ");
    return `<li class="${checked ? "is-checked" : ""}"><label class="check-row">
      <input type="checkbox" data-key="${esc(it.key)}" ${checked ? "checked" : ""}>
      <span class="box" aria-hidden="true"></span>
      <span class="label">${esc(it.name)}<span class="used-in">${esc(it.days.join(", "))}</span></span>
      <span class="amount">${esc(amount)}</span>
    </label></li>`;
  };

  const customs = Object.entries(st.custom).filter(([, c]) => c && c.name).sort((a, b) => (a[1].t || 0) - (b[1].t || 0));
  const customGroup = customs.length ? `
    <section class="shop-group ${state.hideChecked ? "hide-checked" : ""}">
      <div class="group-head"><span class="group-icon">📝</span>Egne varer<span class="group-count ${customs.every(([, c]) => c.checked) ? "complete" : ""}">${customs.filter(([, c]) => c.checked).length}/${customs.length}</span></div>
      <ul>${customs.map(([id, c]) => `<li class="${c.checked ? "is-checked" : ""}"><label class="check-row">
        <input type="checkbox" data-custom="${esc(id)}" ${c.checked ? "checked" : ""}>
        <span class="box" aria-hidden="true"></span>
        <span class="label">${esc(c.name)}</span>
        <button class="remove-btn" type="button" data-remove="${esc(id)}" aria-label="Fjern ${esc(c.name)}">✕</button>
      </label></li>`).join("")}</ul>
    </section>` : "";

  const groupHTML = groups.map((g) => {
    const n = g.items.filter((it) => st.checked[it.key]).length;
    const open = !state.closedGroups.has(g.id);
    return `
      <details class="shop-group ${state.hideChecked ? "hide-checked" : ""}" data-group="${esc(g.id)}" ${open ? "open" : ""}>
        <summary><span class="group-icon" aria-hidden="true">${g.icon}</span>${esc(g.name)}<span class="group-count ${n === g.items.length ? "complete" : ""}">${n}/${g.items.length}</span></summary>
        ${g.pantry ? `<p class="group-hint">Det meste har dere sikkert hjemme. Huk av det du har, eller kjøp det som mangler.</p>` : ""}
        <ul>${g.items.map(row).join("")}</ul>
      </details>`;
  }).join("");

  body.innerHTML = `<div class="shop-grid">${customGroup}${groupHTML}</div>`;
}

/* ---------------- Innstillinger ---------------- */
function openSettings() {
  renderSettings();
  if (typeof settingsDialog.showModal === "function") settingsDialog.showModal();
  else settingsDialog.setAttribute("open", "");
}

function renderSettings() {
  const theme = storage.get("matplan:theme", "auto");
  const user = getUser();

  settingsDialog.innerHTML = `
    <div class="sheet-body">
      <div class="sheet-head"><h2 id="settingsTitle">Innstillinger</h2><button class="btn btn-sm btn-ghost" type="button" data-close>Ferdig</button></div>
      <div class="setting">
        <h3>Antall personer</h3>
        <p>Brukes i handlelisten og som standard i oppskriftene.</p>
        <div class="row"><div class="stepper" role="group" aria-label="Antall personer">
          <button type="button" data-s="-1" aria-label="Færre">−</button><output id="sOut">${state.servings} pers.</output><button type="button" data-s="1" aria-label="Flere">+</button>
        </div></div>
      </div>
      <div class="setting">
        <h3>Utseende</h3>
        <div class="segmented" role="group" aria-label="Tema">
          ${[["auto", "Auto"], ["light", "Lyst"], ["dark", "Mørkt"]].map(([v, l]) => `<button type="button" data-theme-btn="${v}" class="${theme === v ? "active" : ""}">${l}</button>`).join("")}
        </div>
      </div>
      <div class="setting">
        <h3>📱 Legg til på hjemskjermen</h3>
        <p>På iPhone: trykk på Del-knappen i Safari og velg «Legg til på Hjem-skjerm». Da åpnes Matplan som en egen app.</p>
      </div>
      <div class="setting">
        <h3>👤 Konto</h3>
        <p>Logget inn som <strong>${esc(user?.email || "")}</strong>. Handlelisten deles med alle i familien som er logget inn.</p>
        <div class="row"><button class="btn btn-sm" type="button" id="logoutBtn">Logg ut</button></div>
      </div>
    </div>`;

  const q = (s) => settingsDialog.querySelector(s);
  q("[data-close]").addEventListener("click", () => settingsDialog.close());
  settingsDialog.querySelectorAll("[data-s]").forEach((b) => b.addEventListener("click", () => {
    state.servings = Math.min(12, Math.max(1, state.servings + Number(b.dataset.s)));
    storage.set("matplan:servings", state.servings);
    q("#sOut").textContent = `${state.servings} pers.`;
    updateBadge();
    render();
  }));
  settingsDialog.querySelectorAll("[data-theme-btn]").forEach((b) => b.addEventListener("click", () => {
    storage.set("matplan:theme", b.dataset.themeBtn);
    applyTheme(b.dataset.themeBtn);
    renderSettings();
  }));
  q("#logoutBtn").addEventListener("click", async () => {
    if (!confirm("Vil du logge ut?")) return;
    await signOut();
    // onAuthStateChanged tar oss til innloggingssiden
  });
}

settingsDialog.addEventListener("click", (e) => { if (e.target === settingsDialog) settingsDialog.close(); });
document.getElementById("settingsBtn").addEventListener("click", openSettings);

/* ---------------- Innlogging ---------------- */
function renderLogin(message = "") {
  document.body.classList.add("locked");
  document.title = "Logg inn – Matplan";
  if (settingsDialog.open) settingsDialog.close();
  app.innerHTML = `
    <section class="login">
      <div class="login-card">
        <div class="login-logo" aria-hidden="true"><img src="icons/icon.svg" alt="" width="72" height="72"></div>
        <h1>Matplan</h1>
        <p class="login-sub">Familiens ukesmeny og handleliste</p>
        <form id="loginForm" novalidate>
          <label class="field">
            <span>E-post</span>
            <input id="email" type="email" autocomplete="username" inputmode="email" autocapitalize="off" spellcheck="false" required value="${esc(storage.get("matplan:lastEmail", ""))}">
          </label>
          <label class="field">
            <span>Passord</span>
            <input id="password" type="password" autocomplete="current-password" required>
          </label>
          <p class="login-msg" id="loginMsg" role="alert">${esc(message)}</p>
          <button class="btn btn-primary btn-block" type="submit" id="loginBtn">Logg inn</button>
        </form>
        <button class="btn btn-ghost btn-sm" type="button" id="forgotBtn">Glemt passord?</button>
      </div>
      <p class="login-foot">🔒 Kun for familien. Kontoer opprettes av administrator.</p>
    </section>`;

  const form = app.querySelector("#loginForm");
  const email = app.querySelector("#email");
  const password = app.querySelector("#password");
  const msg = app.querySelector("#loginMsg");
  const btn = app.querySelector("#loginBtn");
  (email.value ? password : email).focus();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = ""; msg.classList.remove("ok");
    if (!email.value.trim() || !password.value) { msg.textContent = "Fyll inn e-post og passord."; return; }
    btn.disabled = true; btn.textContent = "Logger inn …";
    try {
      await signIn(email.value, password.value);
      storage.set("matplan:lastEmail", email.value.trim());
      // onAuthStateChanged starter appen
    } catch (err) {
      msg.textContent = errorText(err);
      btn.disabled = false; btn.textContent = "Logg inn";
      password.select();
    }
  });

  app.querySelector("#forgotBtn").addEventListener("click", async () => {
    msg.classList.remove("ok");
    if (!email.value.trim()) { msg.textContent = "Skriv inn e-postadressen din først."; email.focus(); return; }
    try {
      await resetPassword(email.value);
      msg.textContent = "Hvis adressen har en konto, er det sendt en e-post med lenke for nytt passord.";
      msg.classList.add("ok");
    } catch (err) { msg.textContent = errorText(err); }
  });
}

async function startApp() {
  document.body.classList.remove("locked");
  if (!state.weeks.length) {
    const index = await fetchJSON("data/weeks.json");
    state.weeks = index.weeks;
  }
  const route = currentRoute();
  const id = route.weekId || pickDefaultWeek(state.weeks);
  state.week = null; // ny tilkobling for innlogget bruker
  await selectWeek(id);
  await render();
}

function onAuthChange(user) {
  if (user) startApp().catch(showLoadError);
  else {
    state.store?.disconnect();
    state.store = null; state.week = null;
    updateBadge();
    renderLogin();
  }
}

function showLoadError(err) {
  console.error(err);
  app.innerHTML = `<section class="page"><div class="empty"><div class="big">📡</div><p>Kunne ikke hente matplanen. Sjekk nettet og prøv igjen.</p><p style="margin-top:12px"><button class="btn" onclick="location.reload()">Prøv igjen</button></p></div></section>`;
}

/* ---------------- Diverse ---------------- */
let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
}

const topbar = document.querySelector(".topbar");
window.addEventListener("scroll", () => topbar.classList.toggle("scrolled", window.scrollY > 4), { passive: true });

/* ---------------- Oppstart ---------------- */
async function init() {
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  try {
    const user = await initAuth(onAuthChange);
    onAuthChange(user);
  } catch (err) {
    showLoadError(err);
  }
}

init();
