import type { Product } from './store';

export type CartLine = {
  productId: string;
  productName: string;
  size: string;
  quantity: number;
  price: number;
  image: string;
};

const CART_STORAGE_KEY = 'jeffchilu-cart';
type CartStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function readCart(storage: CartStorage = window.localStorage): CartLine[] {
  try {
    const saved = JSON.parse(storage.getItem(CART_STORAGE_KEY) || '[]');
    return Array.isArray(saved) ? saved as CartLine[] : [];
  } catch {
    return [];
  }
}

export function writeCart(cart: CartLine[], storage: CartStorage = window.localStorage): void {
  storage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
}

export function addCartLine(cart: CartLine[], product: Product, size: string, quantity = 1): CartLine[] {
  const found = cart.find(line => line.productId === product.id && line.size === size);
  if (found) {
    return cart.map(line => line === found ? { ...line, quantity: line.quantity + quantity } : line);
  }
  return [...cart, {
    productId: product.id,
    productName: product.name,
    size,
    quantity,
    price: product.price,
    image: product.images?.[0] || '',
  }];
}
