import { describe, expect, it } from 'vitest';
import { filterCatalogProducts } from '../src/lib/catalog';
import type { Product } from '../src/lib/store';

const products = [
  { id: 'a', name: 'Mens shirt', category: 'mens' },
  { id: 'b', name: 'Ladies bag', category: 'ladies' },
  { id: 'c', name: 'Kids shoes', category: 'kids' },
  { id: 'd', name: 'Legacy item' },
] as Product[];

describe('storefront category filtering', () => {
  it('shows every categorized product in All but excludes uncategorized legacy items', () => {
    expect(filterCatalogProducts(products, 'all').map(product => product.id)).toEqual(['a', 'b', 'c']);
  });

  it.each(['mens', 'ladies', 'kids'] as const)('filters to %s only', category => {
    expect(filterCatalogProducts(products, category).map(product => product.id)).toEqual([
      products.find(product => product.category === category)?.id,
    ]);
  });
});
