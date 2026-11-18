import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, orderBy, query,
  serverTimestamp, setDoc, updateDoc, where,
} from 'firebase/firestore';
import { db } from './firebase';

export type Category = 'mens' | 'ladies' | 'kids';
export type Product = {
  id: string; name: string; category?: Category; sizes: string[]; price: number;
  description: string; images: string[]; createdAt?: any; updatedAt?: any;
};
export type OrderItem = { productId: string; productName: string; size: string; quantity: number; priceAtOrder: number; image: string };
export type StoreOrder = {
  id: string; customerName: string; whatsappNumber: string; deliveryDay: string;
  address: string; notes: string; items: OrderItem[]; total: number;
  status: string; createdAt?: any; orderNumber: string;
};
const productsRef = collection(db, 'products');
const ordersRef = collection(db, 'orders');
export async function listProducts(category?: Category) {
  const snap = await getDocs(category ? query(productsRef, where('category', '==', category)) : productsRef);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
}
export async function getProduct(id: string) {
  const snap = await getDoc(doc(db, 'products', id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Product) : null;
}
export async function saveProduct(data: Omit<Product, 'id'>, id?: string) {
  if (id) { await updateDoc(doc(db, 'products', id), { ...data, updatedAt: serverTimestamp() }); return id; }
  const result = await addDoc(productsRef, { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return result.id;
}
export async function removeProduct(id: string) { await deleteDoc(doc(db, 'products', id)); }
export async function getStoreSettings() {
  const snap = await getDoc(doc(db, 'storeSettings', 'main'));
  return snap.exists() ? snap.data() : { name: "Jeffchilu's", tagline: 'Quality Products. Great Prices.', logoUrl: '' };
}
export async function saveStoreSettings(data: { name: string; tagline: string; logoUrl: string }) {
  await setDoc(doc(db, 'storeSettings', 'main'), { ...data, updatedAt: serverTimestamp() }, { merge: true });
}
export async function createOrder(data: Omit<StoreOrder, 'id' | 'createdAt'>) {
  const result = await addDoc(ordersRef, { ...data, status: 'new', createdAt: serverTimestamp() });
  return result.id;
}
export async function listOrders() {
  const snap = await getDocs(query(ordersRef, orderBy('createdAt', 'desc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as StoreOrder));
}
export async function getOrder(id: string) {
  const snap = await getDoc(doc(db, 'orders', id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as StoreOrder) : null;
}
export async function updateOrderStatus(id: string, status: string) {
  await updateDoc(doc(db, 'orders', id), { status });
}
