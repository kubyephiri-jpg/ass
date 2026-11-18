import { describe, expect, it } from 'vitest';
import { addCartLine, readCart, writeCart, type CartLine } from '../src/lib/cart';
import type { Product } from '../src/lib/store';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

const product = {
  id: 'product-1',
  name: 'Everyday Bag',
  category: 'ladies',
  sizes: ['One Size'],
  price: 85,
  description: 'A useful bag.',
  images: ['https://images.example/bag.png'],
} as Product;

describe('guest cart', () => {
  it('adds a product and increments only the matching product-and-size line', () => {
    const oneSize = addCartLine([], product, 'One Size');
    const incremented = addCartLine(oneSize, product, 'One Size');
    const separateSize = addCartLine(incremented, product, 'Large');

    expect(incremented).toHaveLength(1);
    expect(incremented[0].quantity).toBe(2);
    expect(separateSize).toHaveLength(2);
    expect(separateSize[1]).toMatchObject({ productId: product.id, size: 'Large', quantity: 1 });
  });

  it('restores the saved cart after a fresh read', () => {
    const storage = memoryStorage();
    const cart: CartLine[] = addCartLine([], product, 'One Size', 2);

    writeCart(cart, storage);

    expect(readCart(storage)).toEqual(cart);
  });

  it('returns an empty cart for invalid saved JSON', () => {
    const storage = { getItem: () => '{broken', setItem: () => {} };
    expect(readCart(storage)).toEqual([]);
  });
});
