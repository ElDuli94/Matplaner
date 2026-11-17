// Innlogging med e-post og passord (Firebase Authentication).
import { loadAuth } from "./firebase.js";

let currentUser = null;
export const getUser = () => currentUser;

/** Venter til Firebase vet om brukeren er innlogget (lagret innlogging leses lokalt, også uten nett). */
export async function initAuth(onChange) {
  const fb = await loadAuth();
  return new Promise((resolve) => {
    let first = true;
    fb.onAuthStateChanged(fb.auth, (user) => {
      currentUser = user;
      if (first) { first = false; resolve(user); } else onChange?.(user);
    });
  });
}

const ERRORS = {
  "auth/invalid-email": "E-postadressen ser ikke riktig ut.",
  "auth/missing-password": "Skriv inn passordet ditt.",
  "auth/invalid-credential": "Feil e-post eller passord.",
  "auth/wrong-password": "Feil e-post eller passord.",
  "auth/user-not-found": "Feil e-post eller passord.",
  "auth/user-disabled": "Denne brukeren er deaktivert.",
  "auth/too-many-requests": "For mange forsøk. Vent litt og prøv igjen.",
  "auth/network-request-failed": "Ingen kontakt med nettet. Sjekk tilkoblingen.",
};
export const errorText = (err) => ERRORS[err?.code] || "Noe gikk galt. Prøv igjen.";

export async function signIn(email, password) {
  const fb = await loadAuth();
  await fb.signInWithEmailAndPassword(fb.auth, email.trim(), password);
}

export async function resetPassword(email) {
  const fb = await loadAuth();
  fb.auth.languageCode = "no";
  await fb.sendPasswordResetEmail(fb.auth, email.trim());
}

export async function signOut() {
  const fb = await loadAuth();
  await fb.signOut(fb.auth);
}
