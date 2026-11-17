// Bygger ukens handleliste fra alle oppskriftene, sortert etter avdelinger på Rema 1000.
import { slug, dayName } from "./util.js";

export const CATEGORIES = [
  { id: "grønt", name: "Frukt og grønt", icon: "🥦" },
  { id: "brød", name: "Brød", icon: "🍞" },
  { id: "kjøtt", name: "Kjøtt og kylling", icon: "🍗" },
  { id: "fisk", name: "Fisk og sjømat", icon: "🐟" },
  { id: "meieri", name: "Meieri og egg", icon: "🥛" },
  { id: "ost", name: "Ost", icon: "🧀" },
  { id: "middag", name: "Taco og middagstilbehør", icon: "🌮" },
  { id: "tørrvarer", name: "Pasta, ris og tørrvarer", icon: "🍚" },
  { id: "hermetikk", name: "Hermetikk og tomat", icon: "🥫" },
  { id: "sauser", name: "Sauser og asiatisk", icon: "🥢" },
  { id: "bakevarer", name: "Mel og bakevarer", icon: "🌾" },
  { id: "frys", name: "Frysevarer", icon: "❄️" },
  { id: "annet", name: "Annet", icon: "🛒" },
  { id: "basis", name: "Basisvarer – sjekk skapet", icon: "🧂", pantry: true },
];

/**
 * Slår sammen like varer (samme navn) på tvers av dagene.
 * Mengder med samme enhet summeres; ulike enheter vises side om side.
 */
export function buildShoppingList(week, servings, includeDay = () => true) {
  const factor = servings / (week.baseServings || 4);
  const items = new Map();

  for (const day of week.days) {
    if (!includeDay(day.date)) continue;
    const recipe = week.recipes[day.recipe];
    if (!recipe) continue;
    for (const ing of recipe.ingredients) {
      const key = slug(ing.name);
      let item = items.get(key);
      if (!item) {
        item = { key, name: ing.name, cat: ing.cat || "annet", amounts: new Map(), days: [] };
        items.set(key, item);
      }
      if (ing.amount != null) {
        const unit = ing.unit || "stk";
        item.amounts.set(unit, (item.amounts.get(unit) || 0) + ing.amount * factor);
      }
      const short = dayName(day.date).slice(0, 3);
      if (!item.days.includes(short)) item.days.push(short);
    }
  }

  const groups = CATEGORIES.map((c) => ({ ...c, items: [] }));
  const byId = Object.fromEntries(groups.map((g) => [g.id, g]));
  for (const item of items.values()) {
    (byId[item.cat] || byId.annet).items.push({ ...item, amounts: [...item.amounts.entries()] });
  }
  for (const g of groups) g.items.sort((a, b) => a.name.localeCompare(b.name, "nb"));
  return groups.filter((g) => g.items.length);
}
