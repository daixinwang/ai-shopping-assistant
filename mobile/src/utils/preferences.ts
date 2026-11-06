/**
 * Preference form helpers. `PUT /preferences/{user}` replaces the whole record, so a
 * save must send back every field the form does not edit; otherwise preferences the
 * assistant remembered during chat (categories, styles, keywords...) would be erased.
 */
export type PreferenceForm = {
  enabled: boolean;
  budgetMin: string;
  budgetMax: string;
  brands: string;
  excluded: string;
  note: string;
  categories: string[];
  styles: string[];
};

type Stored = Record<string, any> | null | undefined;

const LIST_SEPARATORS = /[、,，;；/\n]+/;

export function splitList(value: string): string[] {
  const items: string[] = [];
  for (const part of value.split(LIST_SEPARATORS)) {
    const item = part.trim();
    if (item && !items.includes(item)) items.push(item);
  }
  return items;
}

const strings = (value: unknown): string[] =>
  (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '') : []);
const amountText = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? String(value) : '');
const money = (value: number) => `¥${Number.isInteger(value) ? value : value.toFixed(2)}`;

export function formFromPreference(stored: Stored): PreferenceForm {
  const pref = stored || {};
  const note = [pref.preference_note, pref.notes].find(value => typeof value === 'string' && value.trim());
  return {
    enabled: pref.personalization_enabled !== false,
    budgetMin: amountText(pref.budget_min),
    budgetMax: amountText(pref.budget_max),
    brands: strings(pref.brand_include).join('、'),
    excluded: strings(pref.brand_exclude).join('、'),
    note: note || '',
    categories: strings(pref.favorite_categories),
    styles: strings(pref.style_tags),
  };
}

function parseAmount(raw: string, label: string): number | null {
  const text = raw.replace(/[¥￥元,，\s]/g, '');
  if (!text) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label}请填写不小于 0 的数字`);
  return value;
}

export function preferencePayload(stored: Stored, form: PreferenceForm):
  { payload: Record<string, unknown> } | { error: string } {
  let budgetMin: number | null;
  let budgetMax: number | null;
  try {
    budgetMin = parseAmount(form.budgetMin, '最低预算');
    budgetMax = parseAmount(form.budgetMax, '最高预算');
  } catch (error: any) {
    return { error: error.message };
  }
  if (budgetMin != null && budgetMax != null && budgetMin > budgetMax) return { error: '最低预算不能高于最高预算' };
  const include = splitList(form.brands);
  const exclude = splitList(form.excluded);
  const conflict = include.find(brand => exclude.includes(brand));
  if (conflict) return { error: `「${conflict}」不能同时出现在偏好品牌和排除品牌里` };

  const { user_id: _userId, ...untouched } = stored || {};
  return { payload: {
    ...untouched,
    personalization_enabled: form.enabled,
    budget_min: budgetMin,
    budget_max: budgetMax,
    brand_include: include,
    brand_exclude: exclude,
    favorite_categories: form.categories,
    style_tags: form.styles,
    // The form shows `preference_note`, falling back to the legacy `notes`; saving
    // moves the text to `preference_note` so a cleared note does not come back.
    preference_note: form.note.trim() || null,
    notes: null,
  } };
}

/** Short phrases describing what recommendations take into account; empty when paused. */
export function describePreference(stored: Stored): string[] {
  const pref = stored || {};
  if (pref.personalization_enabled === false) return [];
  const low = typeof pref.budget_min === 'number' ? pref.budget_min : null;
  const high = typeof pref.budget_max === 'number' ? pref.budget_max : null;
  const parts: string[] = [];
  if (low != null && high != null) parts.push(`预算 ${money(low)}–${money(high)}`);
  else if (high != null) parts.push(`预算 ${money(high)} 以内`);
  else if (low != null) parts.push(`预算 ${money(low)} 以上`);
  const include = strings(pref.brand_include);
  const exclude = strings(pref.brand_exclude);
  const categories = strings(pref.favorite_categories);
  if (include.length) parts.push(`偏好 ${include.join('、')}`);
  if (exclude.length) parts.push(`避开 ${exclude.join('、')}`);
  if (categories.length) parts.push(`关注 ${categories.join('、')}`);
  return [...parts, ...strings(pref.style_tags)];
}
