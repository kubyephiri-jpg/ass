import type { Category, Product } from './store';

export function filterCatalogProducts(products: Product[], category: Category | 'all'): Product[] {
  if (category === 'all') return products.filter(product => Boolean(product.category));
  return products.filter(product => product.category === category);
}
