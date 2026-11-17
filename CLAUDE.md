# Matplan – retningslinjer for nye ukesplaner

Statisk nettside (GitHub Pages) med Firebase for innlogging og delt handleliste. Se README.md for struktur og dataformat.

## Familiens krav til middager
- **Mål: vektnedgang for de voksne.** Hver rett: **ca. 450–550 kcal og minst 40 g protein per voksenporsjon** (baseServings = 4).
- **Ingen svinekjøtt** (heller ikke bacon, skinke, pølser eller gelatin fra svin).
- Familie: 2 voksne og 1–2 barn. Rettene skal være barnevennlige; barna går ikke på kur. Bruk feltet `portions` for porsjonsfordeling voksne/barn.
- Ukedager maks ca. 30 min; lørdag/søndag kan ta lengre tid.
- Handler på **Rema 1000** – bruk varer som finnes der.
- Lette valg: skyr/mager kesam i stedet for rømme og 10 % yoghurt, lett revet ost, mager kjøttdeig (maks 5 %), lite olje (1 ss per rett), mindre ris/pasta (ca. 40–60 g tørr per voksen) og mye grønnsaker.
- Fisk minst to ganger i uka.
- Matvarer familien ikke liker: (ingen registrert ennå – legg til her)

## Ny uke
1. Lag `data/weeks/ÅÅÅÅ-Wnn.json` (samme format som eksisterende uker), inkludert `nutrition` (kcal, protein, carbs, fat, fiber per porsjon), `portions`, `health`, `kids`, `tips`.
2. Dager familien er borte: `{ "date": "...", "note": "Borte" }` uten `recipe`.
3. Bruk samme ingrediensnavn som tidligere uker (f.eks. «Hvitløk», «Løk», «Skyr naturell») slik at like varer slås sammen i handlelisten.
4. Legg uken til i `data/weeks.json`.
5. Bump `?v=` i index.html/sw.js og `VERSION` i sw.js bare ved endringer i CSS/JS.
