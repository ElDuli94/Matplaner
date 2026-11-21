# Istrefi Shopping – notater for videre utvikling

Statisk nettside (GitHub Pages, ren HTML/CSS/JS uten byggesteg) med Firebase Authentication og Realtime Database. Se README.md for struktur og datamodell.

- Appen er en felles handleliste for flere familier. Hver familie skal **bare** kunne se sin egen liste – dette håndheves i `database.rules.json`, ikke bare i klienten. Endrer du datamodellen, oppdater reglene og test dem (Firebase-emulator + `@firebase/rules-unit-testing`).
- Roller: administrator (`admins/{uid}`), familieansvarlig (`role: "owner"`), medlem (`role: "member"`). Administrator skal ikke kunne lese andre familiers `items`.
- Den ekte administrator-e-posten skal ikke stå i repoet; `database.rules.json` har plassholderen `ADMIN-EPOST@eksempel.no`.
- Tekst i appen er på norsk (bokmål). Butikkrekkefølgen følger Rema 1000 (`js/categories.js`).
- Ved endringer i CSS/JS: bump `?v=` i index.html, sw.js og importene øverst i js/app.js, og `VERSION` i sw.js. Service workeren henter alltid med `cache: "no-cache"`.
