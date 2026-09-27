import type { Lang } from './store'

/** Crops offered in the search. Users can also add any name that isn't listed. */
export const CROP_CATALOG: { name: string; ru: string; uz: string; group: string }[] = [
  { name: 'Tomato', ru: 'Помидор', uz: 'Pomidor', group: 'Fruiting vegetables' },
  { name: 'Cherry tomato', ru: 'Черри', uz: 'Cherri pomidor', group: 'Fruiting vegetables' },
  { name: 'Cucumber', ru: 'Огурец', uz: 'Bodring', group: 'Fruiting vegetables' },
  { name: 'Sweet pepper', ru: 'Сладкий перец', uz: 'Bulgor qalampiri', group: 'Fruiting vegetables' },
  { name: 'Hot pepper', ru: 'Острый перец', uz: "Achchiq qalampir", group: 'Fruiting vegetables' },
  { name: 'Eggplant', ru: 'Баклажан', uz: 'Baqlajon', group: 'Fruiting vegetables' },
  { name: 'Zucchini', ru: 'Кабачок', uz: 'Qovoqcha', group: 'Fruiting vegetables' },
  { name: 'Melon', ru: 'Дыня', uz: 'Qovun', group: 'Fruiting vegetables' },
  { name: 'Watermelon', ru: 'Арбуз', uz: 'Tarvuz', group: 'Fruiting vegetables' },
  { name: 'Strawberry', ru: 'Клубника', uz: 'Qulupnay', group: 'Berries' },
  { name: 'Raspberry', ru: 'Малина', uz: 'Malina', group: 'Berries' },
  { name: 'Lettuce', ru: 'Салат', uz: 'Salat bargi', group: 'Leafy greens' },
  { name: 'Spinach', ru: 'Шпинат', uz: 'Ismaloq', group: 'Leafy greens' },
  { name: 'Cabbage', ru: 'Капуста', uz: 'Karam', group: 'Leafy greens' },
  { name: 'Parsley', ru: 'Петрушка', uz: 'Petrushka', group: 'Herbs' },
  { name: 'Dill', ru: 'Укроп', uz: 'Shivit', group: 'Herbs' },
  { name: 'Coriander', ru: 'Кинза', uz: 'Kashnich', group: 'Herbs' },
  { name: 'Basil', ru: 'Базилик', uz: 'Rayhon', group: 'Herbs' },
  { name: 'Green onion', ru: 'Зелёный лук', uz: "Ko'k piyoz", group: 'Herbs' },
  { name: 'Radish', ru: 'Редис', uz: 'Rediska', group: 'Root vegetables' },
  { name: 'Carrot', ru: 'Морковь', uz: 'Sabzi', group: 'Root vegetables' },
  { name: 'Lemon', ru: 'Лимон', uz: 'Limon', group: 'Fruit trees' },
  { name: 'Flowers (cut)', ru: 'Цветы на срез', uz: 'Kesma gullar', group: 'Flowers' },
]

/** Show a stored crop name in the chosen language (custom names stay as typed). */
export function cropName(name: string, lang: Lang) {
  if (lang === 'en') return name
  const c = CROP_CATALOG.find((x) => x.name === name)
  return c ? c[lang] : name
}
