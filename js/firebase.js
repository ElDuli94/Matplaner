// Laster Firebase ved behov (hentes fra Googles CDN, mellomlagres av nettleseren).
import { firebaseConfig } from "./firebase-config.js";

const VERSION = "10.12.2";
const BASE = `https://www.gstatic.com/firebasejs/${VERSION}`;

export const isConfigured = () => !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.databaseURL);

let appPromise = null;
function getApp() {
  if (!appPromise) {
    appPromise = import(`${BASE}/firebase-app.js`).then((m) => m.initializeApp(firebaseConfig));
  }
  return appPromise;
}

let authPromise = null;
export function loadAuth() {
  if (!authPromise) {
    authPromise = Promise.all([getApp(), import(`${BASE}/firebase-auth.js`)]).then(([app, mod]) => ({
      auth: mod.getAuth(app),
      ...mod,
    }));
  }
  return authPromise;
}

let dbPromise = null;
export function loadDatabase() {
  if (!dbPromise) {
    dbPromise = Promise.all([getApp(), import(`${BASE}/firebase-database.js`)]).then(([app, mod]) => ({
      db: mod.getDatabase(app),
      ...mod,
    }));
  }
  return dbPromise;
}
