# 🛒 Istrefi Shopping

Felles handleliste for flere familier. Hver familie har én løpende handleliste som synkroniseres i sanntid, og kan bare se sin egen liste.

## Funksjoner
- **Én løpende liste per familie.** Varer sorteres automatisk i Rema 1000-rekkefølge. Avhukede varer flyttes til «I kurven», og «Fjern avhukede» rydder listen (med angre).
- **Trykk på en vare** for å endre navn eller avdeling, eller slette den. Avdelingen huskes for familien til neste gang.
- **Roller**
  - **Administrator** oppretter familier, inviterer, plasserer nye brukere, flytter folk mellom familier og velger familieansvarlig. Administrator ser **ikke** andre familiers lister.
  - **Familieansvarlig** inviterer og fjerner medlemmer i sin egen familie.
  - **Medlem** bruker familiens liste.
- **Registrering:** Alle kan opprette konto. Uten invitasjon havner de på «Venter på plass» til administrator legger dem i en familie. Med invitasjonslenke kommer de rett inn i riktig familie.
- Fungerer på mobil og PC, kan legges på hjemskjermen og viser siste liste uten nett.

## Struktur
```
index.html              Siden
css/style.css           Design (lyst og mørkt tema)
js/app.js               Visninger: handleliste, familie, admin, innlogging
js/list.js              Familiens handleliste (Firebase + lokal kopi)
js/categories.js        Avdelinger og automatisk sortering
js/access.js            Familier, roller, invitasjoner og forespørsler
js/auth.js              Innlogging (Firebase Authentication)
js/firebase.js          Laster Firebase ved behov
js/firebase-config.js   Firebase-oppsett
database.rules.json     Sikkerhetsregler for Realtime Database
sw.js                   Offline-støtte
```

## Datamodell (Realtime Database)
```
admins/{uid}: true
users/{uid}: { email, family, role: "owner"|"member", joined }
familyIndex/{fid}: { name, createdAt }            (kun admin)
families/{fid}/info: { name, createdAt }
families/{fid}/members/{uid}: { email, role }
families/{fid}/items/{id}: { name, cat, checked } (kun familiens medlemmer)
families/{fid}/learned/{vare}: avdeling           (kun familiens medlemmer)
invites/{token}: { email, family, familyName, role, expires, usedBy? }
requests/{uid}: { email, at }
```

## Oppsett i Firebase
1. **Authentication → Sign-in method → Email/Password**: Enable.
2. **Authentication → Settings → Authorized domains**: legg til `elduli94.github.io`.
3. **Realtime Database → Rules**: lim inn `database.rules.json`, men bytt `ADMIN-EPOST@eksempel.no` med administratorens e-post (små bokstaver). Trykk Publish.
4. Første gang: opprett konto med administrator-e-posten og trykk «Er du administrator?».

Reglene er testet med Firebase-emulatoren: ingen kan lese eller skrive en annen families liste, invitasjoner kan bare brukes av riktig e-post, og bare én gang.

## Publisering
GitHub Actions publiserer til GitHub Pages ved push til `main` (`.github/workflows/pages.yml`).

## Kjøre lokalt
```
python3 -m http.server 8000
```
