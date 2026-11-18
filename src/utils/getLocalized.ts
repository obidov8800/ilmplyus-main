export const getLocalized = (source: unknown, fieldName: string, lang: string): string => {
  if (!source || typeof source !== "object") return "-";
  const obj = source as Record<string, unknown>;

  // Normalize lang (e.g. 'uz-UZ' -> 'uz')
  const cleanLang = (lang || "uz").split("-")[0];

  // Try localized value for the requested language
  const localizedValue = obj[`${fieldName}_${cleanLang}`] || obj[`${fieldName}_${lang}`];
  if (localizedValue != null && localizedValue !== "") return String(localizedValue);

  // Fallback to Uzbek — backend ko'pincha faqat `<field>_uz` ni to'ldiradi,
  // shuning uchun RU/EN so'ralganda ham bo'sh chiziqcha emas, o'zbekcha matn chiqsin.
  const uzValue = obj[`${fieldName}_uz`];
  if (uzValue != null && uzValue !== "") return String(uzValue);

  // Fallback to base field name
  const baseValue = obj[fieldName];
  if (baseValue != null && baseValue !== "") return String(baseValue);

  return "-";
};
