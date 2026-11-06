import { describe, expect, it } from 'vitest';
import { defaultPick, matchSku, optionState, pickOption, skuLabel, skusFromDetail } from './sku';

const detail = {
  skus: [
    { id: 's1', selectedOptions: { 版本: '标准版', 颜色: '黑' }, price: { amountMinor: 149900, display: '¥1499' }, availability: 'inStock', stockCount: 5 },
    { id: 's2', selectedOptions: { 版本: '标准版', 颜色: '白' }, price: { amountMinor: 149900, display: '¥1499' }, availability: 'outOfStock', stockCount: 0 },
    { id: 's3', selectedOptions: { 版本: '无线充版', 颜色: '黑' }, price: { amountMinor: 169900, display: '¥1699' }, availability: 'inStock', stockCount: 2 },
  ],
};
const skus = skusFromDetail(detail);

describe('SKU picker', () => {
  it('normalizes SKUs from the product detail', () => {
    expect(skus[0]).toEqual({
      id: 's1', options: { 版本: '标准版', 颜色: '黑' }, price: 1499, priceDisplay: '¥1499', inStock: true, stock: 5,
    });
    expect(skusFromDetail({})).toEqual([]);
    expect(skusFromDetail(null)).toEqual([]);
  });

  it('preselects the cheapest SKU that is in stock', () => {
    expect(defaultPick(skus)).toEqual({ 版本: '标准版', 颜色: '黑' });
    expect(defaultPick(skusFromDetail({ skus: [detail.skus[1]] }))).toEqual({ 版本: '标准版', 颜色: '白' });
    expect(defaultPick([])).toEqual({});
  });

  it('finds the SKU only when every dimension is picked', () => {
    expect(matchSku(skus, { 版本: '无线充版', 颜色: '黑' })?.id).toBe('s3');
    expect(matchSku(skus, { 版本: '无线充版', 颜色: '白' })).toBeNull();
    expect(matchSku(skus, { 版本: '无线充版' })).toBeNull();
  });

  it('tells which options lead to a sold-out or non-existent SKU', () => {
    const picked = { 版本: '标准版', 颜色: '黑' };
    expect(optionState(skus, picked, '版本', '无线充版')).toBe('available');
    expect(optionState(skus, picked, '颜色', '白')).toBe('soldout');
    expect(optionState(skus, { 版本: '无线充版', 颜色: '黑' }, '颜色', '白')).toBe('missing');
  });

  it('keeps an existing combination and re-picks the others when there is none', () => {
    expect(pickOption(skus, { 版本: '标准版', 颜色: '黑' }, '颜色', '白')).toEqual({ 版本: '标准版', 颜色: '白' });
    expect(pickOption(skus, { 版本: '标准版', 颜色: '白' }, '版本', '无线充版')).toEqual({ 版本: '无线充版', 颜色: '黑' });
  });

  it('labels a SKU by its option values', () => {
    expect(skuLabel(skus[2])).toBe('无线充版 / 黑');
    expect(skuLabel({ ...skus[0], options: {} })).toBe('默认规格');
  });
});
