// Avdelinger i Rema 1000-rekkefølge og automatisk gjenkjenning av varer.
import { slug } from "./util.js";

export const CATEGORIES = [
  { id: "grønt", name: "Frukt og grønt", icon: "🥦" },
  { id: "brød", name: "Brød og bakervarer", icon: "🍞" },
  { id: "kjøtt", name: "Kjøtt og kylling", icon: "🍗" },
  { id: "fisk", name: "Fisk og sjømat", icon: "🐟" },
  { id: "pålegg", name: "Pålegg", icon: "🥪" },
  { id: "meieri", name: "Meieri og egg", icon: "🥛" },
  { id: "ost", name: "Ost", icon: "🧀" },
  { id: "middag", name: "Middag og tilbehør", icon: "🌮" },
  { id: "tørrvarer", name: "Pasta, ris og tørrvarer", icon: "🍚" },
  { id: "hermetikk", name: "Hermetikk og sauser", icon: "🥫" },
  { id: "bakevarer", name: "Mel og baking", icon: "🌾" },
  { id: "krydder", name: "Krydder og olje", icon: "🧂" },
  { id: "frokost", name: "Frokost og müsli", icon: "🥣" },
  { id: "snacks", name: "Snacks og godteri", icon: "🍫" },
  { id: "drikke", name: "Drikke", icon: "🧃" },
  { id: "frys", name: "Frysevarer", icon: "❄️" },
  { id: "baby", name: "Baby og barn", icon: "🍼" },
  { id: "hus", name: "Husholdning", icon: "🧻" },
  { id: "hygiene", name: "Hygiene og apotek", icon: "🧴" },
  { id: "annet", name: "Annet", icon: "🛒" },
];
export const CAT_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

// Nøkkelord (slug-form, uten æøå) -> avdeling. Lengste treff vinner.
const KEYWORDS = {
  grønt: "eple epler banan bananer appelsin appelsiner klementin klementiner mandarin paere druer drue sitron lime mango ananas melon vannmelon kiwi avokado baer jordbaer blabaer bringebaer tomat tomater cherrytomater agurk paprika salat isberg isbergsalat ruccola spinat babyspinat brokkoli blomkal kal rodkal hodekal kinakal gulrot gulrotter lok rodlok vaarlok hvitlok purre potet poteter sotpotet kalrot sellerirot selleri squash aubergine mais maiskolbe sopp champignon ingefaer chili urter basilikum persille dill koriander mynte grontsaker frukt asparges erter sukkererter bonner rosenkal fennikel reddik granateple nektarin plomme fersken",
  brød: "brod grovbrod loff rundstykker rundstykke baguette ciabatta tortilla tortillalefser lefser polarbrod knekkebrod pitabrod pita hamburgerbrod polsebrod lompe lomper boller rosinboller wienerbrod croissant kake kaker naan",
  kjøtt: "kjottdeig karbonadedeig kylling kyllingfilet kyllinglar kyllingvinger kalkun kalkunfilet biff entrecote indrefilet flankstek storfe lam lammekjott lammekoteletter fenalar kjott karbonader kjottboller kjottkaker grytekjott gryteterninger strimler kebab kebabkjott spekepolse lammelar elg reinsdyr hjort polser kyllingpolser grillpolser",
  fisk: "laks laksefilet torsk torskefilet sei hyse ørret orret makrell sild reker scampi fiskekaker fiskeboller fiskepinner fisk tunfisk sjomat blaskjell krabbe kveite rakfisk lutefisk fiskegrateng",
  pålegg: "palegg skinke kalkunpalegg kyllingpalegg salami leverpostei postei makrell-i-tomat kaviar majones remulade hummus syltetoy nugatti sjokoladepalegg peanottsmor honning prim brunost-skiver",
  meieri: "melk lettmelk helmelk skummet skummetmelk yoghurt skyr kesam cottage cottage-cheese romme lettromme flote matflote kremflote smor margarin bremykt egg egge kefir kulturmelk biola havremelk soyamelk iskaffe cremefraiche creme-fraiche",
  ost: "ost norvegia jarlsberg gulost brunost geitost mozzarella parmesan feta fetaost cheddar revet-ost revet smoreost philadelphia burrata halloumi camembert brie",
  middag: "taco tacokrydder tacosaus tacoskjell nachos pizza pizzabunn pizzasaus wok woksaus fajita burrito suppe posesuppe gryte-mix grytebase lasagne lasagneplater",
  tørrvarer: "pasta spaghetti makaroni penne fusilli tagliatelle nudler ris jasminris basmatiris fullkornsris couscous bulgur quinoa linser rode-linser kikerter bonner-torre gryn havregryn",
  hermetikk: "hakkede-tomater hermetikk boks tomatpure ketchup sennep soyasaus soya buljong buljongterning kokosmelk mais-boks tunfisk-boks olivener sylteagurk pesto chilisaus sriracha bbq-saus dressing salsa",
  bakevarer: "mel hvetemel sammalt gjaer torrgjaer bakepulver natron sukker melis vaniljesukker kakao sjokolade-baking maisenna rosiner",
  krydder: "salt pepper krydder paprikapulver karri curry kanel oregano timian rosmarin spisskummen gurkemeie garam olje olivenolje rapsolje eddik balsamico laurbaerblad chiliflak hvitlokspulver",
  frokost: "musli granola cornflakes frokostblanding havregrot cheerios",
  snacks: "chips potetgull snacks godteri sjokolade smagodt popcorn notter peanotter cashew mandler kjeks kex smakaker is-pinne lakris tyggegummi",
  drikke: "brus cola pepsi solo farris vann mineralvann juice appelsinjuice eplejuice saft kaffe te kakaodrikk energidrikk ol vin iste smoothie",
  frys: "frossen frosne fryst frysepizza is iskrem frosne-baer frosne-erter pommes-frites pommes fiskepinner-frys frossenpizza grandiosa",
  baby: "bleier bleie vatservietter vatserviett morsmelkerstatning grot-baby barnemat smokk",
  hus: "dopapir toalettpapir tørkepapir torkepapir servietter oppvask oppvaskmiddel zalo vaskemiddel tøyvask toyvask skyllemiddel sopelpose soppelposer bakepapir aluminiumsfolie plastfolie fryseposer batterier lyspaerer stearinlys svamp klut",
  hygiene: "tannkrem tannborste sjampo balsam dusjsape sape deodorant barberhovel bind tamponger plaster paracet paracetamol ibux solkrem hudkrem bomullspinner",
};
const INDEX = [];
for (const [cat, words] of Object.entries(KEYWORDS)) for (const w of words.split(/\s+/)) INDEX.push([slug(w), cat]);
INDEX.sort((a, b) => b[0].length - a[0].length);

/** Gjetter avdeling ut fra varenavnet. `learned` er familiens egne korrigeringer. */
export function guessCategory(name, learned = {}) {
  const s = slug(name);
  if (learned[s]) return learned[s];
  const words = s.split("-");
  // 1) helt navn, 2) hele ord, 3) sammensatte ord (slutter på / starter med nøkkelord)
  for (const [k, cat] of INDEX) if (s === k) return cat;
  for (const [k, cat] of INDEX) if (!k.includes("-") && words.includes(k)) return cat;
  for (const [k, cat] of INDEX) if (k.includes("-") && s.includes(k)) return cat;
  for (const [k, cat] of INDEX) if (k.length >= 4 && words.some((w) => w.endsWith(k) || w.startsWith(k))) return cat;
  return "annet";
}
