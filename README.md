# 🥕 Matplan

Familiens ukesplan med sunne middager, detaljerte oppskrifter og en felles handleliste. Siden fungerer på både mobil og PC.

- **Ukeplan**: 7 middager uten svinekjøtt. Raske retter i ukedagene (ca. 30 min) og mer tid i helgen.
- **Oppskrifter**: Antall porsjoner kan justeres, ingredienser og steg kan hukes av, og «Hold skjermen på» holder skjermen våken mens du lager mat.
- **Handleliste**: Ingrediensene fra hele uken er slått sammen og sortert etter avdelingene på Rema 1000. Du kan legge til egne varer, og listen kan deles med familien i sanntid (via Firebase).
- **Rask**: Siden er laget med ren HTML/CSS/JS uten rammeverk og byggesteg. Den fungerer uten nett og kan legges på hjemskjermen som en app.

## Struktur

```
index.html              Siden
css/style.css           Design (lyst og mørkt tema)
js/app.js               Visninger: ukeplan, oppskrift, handleliste, innstillinger
js/shopping.js          Slår sammen ingredienser til handleliste (Rema-rekkefølge)
js/store.js             Lagring/synk av handlelisten (lokalt eller Firebase)
js/firebase-config.js   Firebase-oppsett (null = kun lokal lagring)
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

## Delt handleliste med Firebase

1. Gå til <https://console.firebase.google.com>, velg **Add project**, gi det et navn (f.eks. «matplan») og slå av Analytics.
2. Velg **Build → Realtime Database → Create database**. Velg lokasjon **Belgium (europe-west1)** og «Start in locked mode».
3. Åpne fanen **Rules**, lim inn innholdet fra `database.rules.json` og trykk **Publish**.
4. Gå til **Project settings** (tannhjulet) → **Your apps** → klikk `</>` (Web). Registrer appen. Du trenger ikke Hosting.
5. Kopier `firebaseConfig`-verdiene inn i `js/firebase-config.js`. Pass på at `databaseURL` er med.
6. Åpne siden, gå til ⚙️ → **Lag familiekode** → **Del lenke** og send lenken til familien.

Firebase-verdiene er ikke hemmelige. Listen beskyttes av familiekoden (12 tilfeldige tegn): bare de som har koden, kan lese og skrive listen.

## Kjøre lokalt

```
python3 -m http.server 8000
```
Åpne deretter <http://localhost:8000>.
