# 🥕 Matplan

Familiens ukesplan med sunne middager, detaljerte oppskrifter og en felles handleliste. Siden fungerer på både mobil og PC.

- **Ukeplan**: 7 middager uten svinekjøtt. Raske retter i ukedagene (ca. 30 min) og mer tid i helgen.
- **Oppskrifter**: Antall porsjoner kan justeres, ingredienser og steg kan hukes av, og «Hold skjermen på» holder skjermen våken mens du lager mat.
- **Handleliste**: Ingrediensene fra hele uken er slått sammen og sortert etter avdelingene på Rema 1000. Du kan legge til egne varer, og listen deles med familien i sanntid (via Firebase).
- **Innlogging**: Bare familiemedlemmer med konto får tilgang.
- **Rask**: Siden er laget med ren HTML/CSS/JS uten rammeverk og byggesteg. Den fungerer uten nett og kan legges på hjemskjermen som en app.

## Struktur

```
index.html              Siden
css/style.css           Design (lyst og mørkt tema)
js/app.js               Visninger: ukeplan, oppskrift, handleliste, innstillinger
js/shopping.js          Slår sammen ingredienser til handleliste (Rema-rekkefølge)
js/store.js             Synk av handlelisten (Firebase + lokal kopi)
js/auth.js              Innlogging (Firebase Authentication)
js/access.js            Administrator, medlemmer og invitasjoner
js/firebase.js          Laster Firebase ved behov
js/firebase-config.js   Firebase-oppsett
data/weeks.json         Oversikt over alle uker
data/weeks/ÅÅÅÅ-Wnn.json  Én fil per uke med dager og oppskrifter
sw.js                   Gjør at siden virker offline
```

## Ny ukesplan

1. Legg til `data/weeks/2026-W48.json` (samme format som de andre ukefilene).
2. Legg til uken i `data/weeks.json`.

Siden viser automatisk uken som gjelder i dag, og eldre uker kan velges fra menyen.

Hver ingrediens har en `cat` (avdeling): `grønt`, `brød`, `kjøtt`, `fisk`, `meieri`, `ost`, `middag`, `tørrvarer`, `hermetikk`, `sauser`, `bakevarer`, `frys`, `annet` eller `basis` (krydder og olje som de fleste har hjemme). Like navn blir slått sammen i handlelisten.

## Publisering (GitHub Pages)

1. Slå sammen koden til `main`-grenen.
2. Gå til **Settings → Pages** på GitHub og velg **Source: GitHub Actions**.
3. Siden publiseres automatisk til `https://<brukernavn>.github.io/Matplaner/` hver gang `main` oppdateres.

## Innlogging, administrator og invitasjoner (Firebase)

- Alle kan opprette konto, men nye kontoer **venter på godkjenning** og ser ingenting før de er godkjent.
- **Administrator** ser siden «Familien» (⚙️ → Administrer familien). Der kan administrator:
  - invitere noen på e-post (lenken gjelder i 14 dager, og den inviterte kommer rett inn),
  - godkjenne eller avslå selvregistrerte,
  - fjerne medlemmer og slette invitasjoner.
- Tilgangen håndheves av databasereglene i `database.rules.json`, ikke bare av nettsiden.

Oppsett i [Firebase-konsollen](https://console.firebase.google.com/project/matplaner-60d75):

1. **Authentication → Sign-in method → Email/Password** → Enable.
2. **Authentication → Settings → Authorized domains**: legg til `elduli94.github.io`.
3. **Realtime Database → Rules**: lim inn `database.rules.json`, men bytt `ADMIN-EPOST@eksempel.no` med administratorens e-post (små bokstaver). Trykk Publish.
4. Opprett en konto på nettsiden med administrator-e-posten og trykk «Er du administrator?» på venteskjermen. Etter at første administrator er satt, kan ingen andre bli administrator på egen hånd.

Database-struktur: `admins/{uid}`, `members/{uid}`, `invites/{token}`, `requests/{uid}`, `family/lists/{uke}`.

Merk: Selve ukeplanen og oppskriftene ligger i dette (offentlige) repoet. Innloggingen beskytter handlelisten og familiens data i databasen.

## Kjøre lokalt

```
python3 -m http.server 8000
```
Åpne deretter <http://localhost:8000>.
