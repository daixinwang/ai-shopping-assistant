/** Spec (SKU) selection for the product sheet, modelled on shopping-app SKU pickers. */
export type Sku = {
  id: string;
  options: Record<string, string>;
  price: number;
  priceDisplay: string;
  inStock: boolean;
  stock: number;
};
export type Picked = Record<string, string>;
export type OptionState = 'available' | 'soldout' | 'missing';

export function skusFromDetail(detail: any): Sku[] {
  const source = Array.isArray(detail?.skus) ? detail.skus : [];
  return source
    .filter((sku: any) => sku && typeof sku.id === 'string')
    .map((sku: any) => {
      const minor = Number(sku.price?.amountMinor);
      const price = Number.isFinite(minor) ? minor / 100 : 0;
      const options: Record<string, string> = {};
      Object.entries(sku.selectedOptions || {}).forEach(([key, value]) => { options[key] = String(value); });
      return {
        id: sku.id,
        options,
        price,
        priceDisplay: String(sku.price?.display || `¥${price}`),
        inStock: sku.availability !== 'outOfStock' && Number(sku.stockCount ?? 1) > 0,
        stock: Number(sku.stockCount ?? 0),
      };
    });
}

const cheapest = (skus: Sku[]) => [...skus].sort((a, b) => a.price - b.price)[0];
const fits = (sku: Sku, picked: Picked) => Object.entries(picked).every(([key, value]) => !value || sku.options[key] === value);

export function defaultPick(skus: Sku[]): Picked {
  const best = cheapest(skus.filter(sku => sku.inStock)) ?? cheapest(skus);
  return best ? { ...best.options } : {};
}

export function matchSku(skus: Sku[], picked: Picked): Sku | null {
  return skus.find(sku => {
    const keys = Object.keys(sku.options);
    return keys.length === Object.keys(picked).filter(key => picked[key]).length
      && keys.every(key => picked[key] === sku.options[key]);
  }) ?? null;
}

export function optionState(skus: Sku[], picked: Picked, dimension: string, value: string): OptionState {
  const matches = skus.filter(sku => fits(sku, { ...picked, [dimension]: value }));
  if (!matches.length) return 'missing';
  return matches.some(sku => sku.inStock) ? 'available' : 'soldout';
}

/**
 * Picks a value. When no SKU combines it with the other current choices, those
 * choices are replaced by the cheapest SKU that has the value, so the user can never
 * get stuck between two dimensions whose values exclude each other.
 */
export function pickOption(skus: Sku[], picked: Picked, dimension: string, value: string): Picked {
  const next = { ...picked, [dimension]: value };
  if (skus.some(sku => fits(sku, next))) return next;
  const withValue = skus.filter(sku => sku.options[dimension] === value);
  const best = cheapest(withValue.filter(sku => sku.inStock)) ?? cheapest(withValue);
  return best ? { ...best.options } : next;
}

export function skuLabel(sku: Sku): string {
  const values = Object.values(sku.options).filter(Boolean);
  return values.length ? values.join(' / ') : '默认规格';
}
