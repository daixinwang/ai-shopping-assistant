import { describe, expect, it } from 'vitest';
import { describePreference, formFromPreference, preferencePayload, splitList } from './preferences';

const stored = {
  user_id: 'u1', personalization_enabled: true, budget_min: 300, budget_max: 800, price_tier: 'mid',
  favorite_categories: ['美妆护肤'], brand_include: ['华为'], brand_exclude: [], preference_keywords: ['降噪'],
  style_tags: ['简约'], category_specific: { 美妆护肤: { skin: '敏感肌' } }, preference_note: null, notes: '少推荐香味重的',
};

describe('preferences form', () => {
  it('fills the form from stored preferences, including remembered ones', () => {
    expect(formFromPreference(stored)).toEqual({
      enabled: true, budgetMin: '300', budgetMax: '800', brands: '华为', excluded: '',
      note: '少推荐香味重的', categories: ['美妆护肤'], styles: ['简约'],
    });
  });

  it('starts from an empty form when nothing is stored', () => {
    expect(formFromPreference(null)).toEqual({
      enabled: true, budgetMin: '', budgetMax: '', brands: '', excluded: '', note: '', categories: [], styles: [],
    });
  });

  it('keeps every field the form does not edit, because saving replaces the whole record', () => {
    const form = { ...formFromPreference(stored), budgetMax: '1000', styles: [] };
    expect(preferencePayload(stored, form)).toEqual({ payload: {
      personalization_enabled: true, budget_min: 300, budget_max: 1000, price_tier: 'mid',
      favorite_categories: ['美妆护肤'], brand_include: ['华为'], brand_exclude: [], preference_keywords: ['降噪'],
      style_tags: [], category_specific: { 美妆护肤: { skin: '敏感肌' } },
      preference_note: '少推荐香味重的', notes: null,
    } });
  });

  it('clears the note and both budgets when the fields are emptied', () => {
    const form = { ...formFromPreference(stored), budgetMin: ' ', budgetMax: '', note: '  ' };
    expect(preferencePayload(stored, form)).toMatchObject({ payload: {
      budget_min: null, budget_max: null, preference_note: null, notes: null,
    } });
  });

  it('accepts amounts written with a currency sign or unit', () => {
    const form = { ...formFromPreference(null), budgetMin: '¥200', budgetMax: '1,500 元' };
    expect(preferencePayload(null, form)).toMatchObject({ payload: { budget_min: 200, budget_max: 1500 } });
  });

  it('rejects an invalid or inverted budget', () => {
    expect(preferencePayload(null, { ...formFromPreference(null), budgetMax: '很多' }))
      .toEqual({ error: '最高预算请填写不小于 0 的数字' });
    expect(preferencePayload(null, { ...formFromPreference(null), budgetMin: '900', budgetMax: '300' }))
      .toEqual({ error: '最低预算不能高于最高预算' });
  });

  it('rejects a brand that is both preferred and excluded', () => {
    const form = { ...formFromPreference(null), brands: '华为、小米', excluded: '小米' };
    expect(preferencePayload(null, form)).toEqual({ error: '「小米」不能同时出现在偏好品牌和排除品牌里' });
  });
});

describe('splitList', () => {
  it('splits on Chinese and English separators, trims and removes duplicates', () => {
    expect(splitList('华为、 小米,,Apple 苹果，华为；The North Face')).toEqual(['华为', '小米', 'Apple 苹果', 'The North Face']);
  });
});

describe('describePreference', () => {
  it('summarises what the assistant will take into account', () => {
    expect(describePreference(stored)).toEqual(['预算 ¥300–¥800', '偏好 华为', '关注 美妆护肤', '简约']);
    expect(describePreference({ budget_max: 500, brand_exclude: ['某品牌'] })).toEqual(['预算 ¥500 以内', '避开 某品牌']);
    expect(describePreference({ budget_min: 200 })).toEqual(['预算 ¥200 以上']);
  });

  it('reports personalization as paused when it is switched off', () => {
    expect(describePreference({ ...stored, personalization_enabled: false })).toEqual([]);
  });
});
