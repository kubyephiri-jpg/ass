import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Redirect, Route, Switch, useLocation, useParams } from 'wouter';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { ShoppingBag } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { CURRENCY, OWNER_EMAIL } from '@/lib/config';
import { buildShopperWhatsAppUrl, cloudinaryUpload, normalizeWhatsAppNumber } from '@/lib/whatsapp';
import { addCartLine, readCart, writeCart, type CartLine } from '@/lib/cart';
import { filterCatalogProducts } from '@/lib/catalog';
import {
  createOrder, getOrder, getProduct, getStoreSettings, listOrders, listProducts,
  removeProduct, saveProduct, saveStoreSettings, updateOrderStatus,
  type Category, type Product, type StoreOrder,
} from '@/lib/store';

type Cart = CartLine[];
type BrandSettings = { name: string; tagline: string; logoUrl: string; loadError: boolean };
const defaultBrand: BrandSettings = { name: "Jeffchilu's", tagline: 'Quality Products. Great Prices.', logoUrl: '/images/logo.png', loadError: false };
let brandCache = defaultBrand;
const brandListeners = new Set<(brand: BrandSettings) => void>();
function publishBrand(brand: BrandSettings) {
  brandCache = brand;
  brandListeners.forEach(listener => listener(brand));
}
function useBrand() {
  const [brand, setBrand] = useState(brandCache);
  useEffect(() => {
    brandListeners.add(setBrand);
    getStoreSettings()
      .then(settings => publishBrand({
        name: String(settings.name || defaultBrand.name),
        tagline: String(settings.tagline || defaultBrand.tagline),
        logoUrl: String(settings.logoUrl || defaultBrand.logoUrl),
        loadError: false,
      }))
      .catch(() => publishBrand({ ...brandCache, loadError: true }));
    return () => { brandListeners.delete(setBrand); };
  }, []);
  return brand;
}
const money = (n: number) => `${CURRENCY}${Number(n || 0).toLocaleString('en-ZM', { maximumFractionDigits: 2 })}`;
const localDate = () => {
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  return today.toISOString().slice(0, 10);
};
function customerMessage(order: StoreOrder) {
  return `Hello ${order.customerName},\n\nThe items you selected from Jeffchilu's are still available.\n\nYour selected items:\n${order.items.map(i => `• ${i.productName} — Size ${i.size} — ${money(i.priceAtOrder)}`).join('\n')}\n\nTotal: ${money(order.total)}\n\nPlease let us know if you would like to proceed with the order.\n\nThank you,\nJeffchilu's`;
}
const categories: { label: string; value: Category | 'all' | 'uncategorised' }[] = [
  { label: 'All', value: 'all' }, { label: "Men's", value: 'mens' }, { label: 'Ladies', value: 'ladies' }, { label: 'Kids', value: 'kids' },
];
function useCart() {
  const [cart, setCart] = useState<Cart>(() => readCart());
  useEffect(() => { writeCart(cart); }, [cart]);
  return { cart, setCart };
}
function Header({ count }: { count: number }) {
  const brand = useBrand();
  return <header className="site-header"><div className="shell header-inner">
    <Link href="/" className="brand" data-testid="link-store-home"><img src={brand.logoUrl} alt={`${brand.name} logo`} /><span><span className="brand-name">{brand.name}</span><br /><span className="brand-tag">{brand.tagline}</span>{brand.loadError && <span className="brand-load-error">Store details unavailable</span>}</span></Link>
    <div className="header-actions"><Link href="/shop" className="cart-link" data-testid="link-shop">Shop</Link><Link href="/cart" className="cart-link" data-testid="link-cart"><ShoppingBag size={17} aria-hidden="true" /> Bag <span className="cart-count" data-testid="text-cart-count">{count}</span></Link></div>
  </div></header>;
}
function Footer() { const brand = useBrand(); return <footer className="footer"><div className="shell footer-inner"><span className="footer-brand"><img src={brand.logoUrl} alt="" />{brand.name} · {brand.tagline}</span><span>Made with care in Zambia &nbsp; <Link href="/owner/login" data-testid="link-owner-login">Owner</Link></span></div></footer>; }
function Layout({ children, count }: { children: ReactNode; count: number }) { return <><Header count={count} />{children}<Footer /></>; }
function Toast({ text, close }: { text: string; close: () => void }) {
  useEffect(() => { const timer = window.setTimeout(close, 2500); return () => clearTimeout(timer); }, [text, close]);
  return text ? <div className="toast" role="status" data-testid="status-toast">{text}</div> : null;
}
function ProductCard({ product, onAdd }: { product: Product; onAdd: (product: Product, size: string) => void }) {
  const [, navigate] = useLocation();
  const [slide, setSlide] = useState(0);
  const imgs = product.images || [];
  const move = (dir: number) => setSlide(n => (n + dir + imgs.length) % imgs.length);
  return <article className="product-card" data-testid={`card-product-${product.id}`}>
    <div className="product-photo" onTouchStart={e => { (e.currentTarget as HTMLDivElement).dataset.touch = String(e.touches[0].clientX); }} onTouchEnd={e => {
      const start = Number((e.currentTarget as HTMLDivElement).dataset.touch || 0); const diff = e.changedTouches[0].clientX - start; if (Math.abs(diff) > 35 && imgs.length > 1) move(diff < 0 ? 1 : -1);
    }}>
      {imgs.length ? <img src={imgs[slide]} alt={product.name} data-testid={`img-product-${product.id}`} /> : <div className="empty">Image coming soon</div>}
      {imgs.length > 1 && <><button className="photo-arrow left" onClick={() => move(-1)} aria-label="Previous image" data-testid={`button-previous-image-${product.id}`}>‹</button><button className="photo-arrow right" onClick={() => move(1)} aria-label="Next image" data-testid={`button-next-image-${product.id}`}>›</button><div className="photo-dots">{imgs.map((_, i) => <button type="button" aria-label={`Show image ${i + 1}`} aria-current={i === slide} className={i === slide ? 'on' : ''} onClick={() => setSlide(i)} key={i} data-testid={`button-product-dot-${product.id}-${i}`} />)}</div></>}
      <button className="fixed-add" aria-label={`${product.sizes?.length > 1 ? 'Choose size for' : 'Add'} ${product.name} ${product.sizes?.length > 1 ? '' : 'to bag'}`} onClick={() => {
        if (product.sizes?.length > 1) navigate(`/items/${product.id}`);
        else onAdd(product, product.sizes?.[0] || 'One Size');
      }} data-testid={`button-add-product-${product.id}`}>{product.sizes?.length > 1 ? '↗' : '+'}</button>
    </div>
    <div className="product-info"><h3>{product.name}</h3><p className="product-meta">{product.sizes?.length ? `Sizes: ${product.sizes.join(', ')}` : 'Uncategorised'}</p><div className="product-foot"><span className="price">{money(product.price)}</span><Link className="view-link" href={`/items/${product.id}`} data-testid={`link-view-product-${product.id}`}>View Details</Link></div></div>
  </article>;
}
function Storefront({ cart, add, showToast }: { cart: Cart; add: (p: Product, s: string) => void; showToast: (s: string) => void }) {
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [products, setProducts] = useState<Product[]>([]);
  const [busy, setBusy] = useState(true); const [error, setError] = useState('');
  const [sort, setSort] = useState('newest');
  async function load() { setBusy(true); setError(''); try { const data = await listProducts(category === 'all' ? undefined : category); setProducts(filterCatalogProducts(data, category)); } catch { setError('We could not load the collection. Please try again.'); } finally { setBusy(false); } }
  useEffect(() => { void load(); }, [category]);
  const sorted = useMemo(() => [...products].sort((a, b) => {
    if (sort === 'low') return a.price - b.price || a.name.localeCompare(b.name);
    if (sort === 'high') return b.price - a.price || a.name.localeCompare(b.name);
    const time = (value: any) => value?.toMillis?.() ?? (value ? new Date(value).getTime() : 0);
    return time(b.createdAt) - time(a.createdAt) || a.name.localeCompare(b.name);
  }), [products, sort]);
  const heading = category === 'all' ? 'Our Products' : `${categories.find(c => c.value === category)?.label} Products`;
  return <Layout count={cart.reduce((n, x) => n + x.quantity, 0)}>
    <section className="hero"><div className="shell hero-content"><span className="eyebrow" style={{ color: '#efd28a' }}>A little something, well chosen</span><h1>Welcome to<br />Jeffchilu's</h1><p>Discover amazing products at great prices.<br />Your one-stop shop for quality and style.</p><Link href="/shop" className="button gold" data-testid="button-shop-now">Shop Now <span>→</span></Link></div></section>
    <main className="section shell" id="collection"><div className="section-top"><div><span className="eyebrow">Thoughtfully picked</span><h2 className="serif" data-testid="text-collection-heading">{heading}</h2></div><div className="row"><label className="muted" htmlFor="sort-products">Sort</label><select id="sort-products" value={sort} onChange={e => setSort(e.target.value)} data-testid="select-product-sort"><option value="newest">Featured</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option></select></div></div>
      <nav className="filter-row" aria-label="Product categories">{categories.map(c => <button key={c.value} className={`filter ${category === c.value ? 'active' : ''}`} onClick={() => setCategory(c.value as Category | 'all')} data-testid={`filter-${c.value}`}>{c.label}</button>)}</nav>
      {busy ? <div className="grid" style={{ marginTop: 22 }}>{[1, 2, 3, 4].map(i => <div className="skeleton" key={i} />)}</div> :
       error ? <div className="notice" style={{ marginTop: 22 }}><p>{error}</p><button className="button small" onClick={() => void load()} data-testid="button-retry-products">Try again</button></div> :
       sorted.length ? <div className="grid" style={{ marginTop: 22 }}>{sorted.map(p => <ProductCard key={p.id} product={p} onAdd={(item, size) => { add(item, size); showToast(`${item.name} added to your bag`); }} />)}</div> :
       <div className="empty" style={{ marginTop: 22 }} data-testid="empty-products"><p className="serif" style={{ fontSize: 24, color: 'var(--ink)' }}>A little room for something lovely.</p><p>There are no products in this collection just yet.</p></div>}
    </main>
  </Layout>;
}
function ItemDetail({ cart, add, showToast }: { cart: Cart; add: (p: Product, s: string, q?: number) => void; showToast: (s: string) => void }) {
  const { id = '' } = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null); const [busy, setBusy] = useState(true); const [error, setError] = useState('');
  const [size, setSize] = useState(''); const [qty, setQty] = useState(1); const [slide, setSlide] = useState(0); const [zoom, setZoom] = useState(false);
  async function load() {
    setBusy(true); setError('');
    try {
      const found = await getProduct(id); setProduct(found);
      const sizes = found?.sizes || [];
      if (sizes.length === 1 || sizes.includes('One Size')) setSize(sizes.includes('One Size') ? 'One Size' : sizes[0]);
    } catch { setError('This item could not be loaded.'); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, [id]);
  if (busy) return <Layout count={cart.reduce((n, x) => n + x.quantity, 0)}><div className="loading">Loading item…</div></Layout>;
  if (!product) return <Layout count={cart.reduce((n, x) => n + x.quantity, 0)}><main className="page shell"><div className="notice" role={error ? 'alert' : undefined}>{error || 'This item is no longer available.'}{error && <p><button className="button small" onClick={() => void load()} data-testid="button-retry-product-detail">Try again</button></p>}<p><Link href="/shop" className="button small">Back to shop</Link></p></div></main></Layout>;
  const images = product.images || [];
  return <Layout count={cart.reduce((n, x) => n + x.quantity, 0)}><main className="page shell"><div className="detail-layout">
    <section><div className="gallery-main"><img src={images[slide] || ''} alt={product.name} onClick={() => setZoom(true)} data-testid="img-detail-main" />{images.length > 1 && <><button className="photo-arrow left" onClick={() => setSlide((slide + images.length - 1) % images.length)} aria-label="Previous image">‹</button><button className="photo-arrow right" onClick={() => setSlide((slide + 1) % images.length)} aria-label="Next image">›</button></>}</div><div className="thumbs">{images.map((src, i) => <button key={src} className={slide === i ? 'selected' : ''} onClick={() => setSlide(i)} data-testid={`button-thumbnail-${i}`}><img src={src} alt={`${product.name} view ${i + 1}`} /></button>)}</div></section>
    <section className="detail-copy"><span className="eyebrow">{product.category || 'Uncategorised'}</span><h1>{product.name}</h1><div className="detail-price">{money(product.price)}</div><p>{product.description}</p>
      <div className="field"><label>Choose a size</label><div className="sizes">{(product.sizes?.length ? product.sizes : ['One Size']).map(s => <button key={s} className={`size-choice ${size === s ? 'active' : ''}`} onClick={() => setSize(s)} data-testid={`button-size-${s.replace(/\W/g, '-')}`}>{s}</button>)}</div></div>
      <div className="row"><div className="qty"><button onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Decrease quantity">−</button><span data-testid="text-detail-quantity">{qty}</span><button onClick={() => setQty(qty + 1)} aria-label="Increase quantity">+</button></div><button className="button gold" onClick={() => { if (!size) { setError('Please choose a size.'); return; } add(product, size, qty); showToast(`${product.name} added to your bag`); setError(''); }} data-testid="button-detail-add">Add to bag</button></div>{error && <p className="error">{error}</p>}
    </section></div></main>{zoom && <div className="modal" onClick={() => setZoom(false)}><button className="modal-close" onClick={() => setZoom(false)}>Close</button><img src={images[slide]} alt={product.name} onClick={e => e.stopPropagation()} data-testid="img-fullscreen" /></div>}</Layout>;
}
function CartPage({ cart, setCart, count, total }: { cart: Cart; setCart: (c: Cart) => void; count: number; total: number }) {
  const [, nav] = useLocation(); const change = (i: number, n: number) => setCart(cart.map((l, idx) => idx === i ? { ...l, quantity: Math.max(1, n) } : l));
  return <Layout count={count}><main className="page shell"><span className="eyebrow">Your picks</span><h1 className="page-title">Your bag</h1>
    {cart.length === 0 ? <div className="empty"><p className="serif" style={{ fontSize: 25, color: 'var(--ink)' }}>Your bag is waiting for something good.</p><Link className="button gold" href="/shop">Continue shopping</Link></div> :
    <div className="cart-layout"><section>{cart.map((line, i) => <div className="line-item" key={`${line.productId}:${line.size}`} data-testid={`row-cart-${line.productId}-${i}`}><img src={line.image || '/images/logo.png'} alt={line.productName} /><div><h3 className="serif" style={{ margin: '0 0 5px' }}>{line.productName}</h3><div className="muted">Size: {line.size} · {money(line.price)}</div><div className="qty" style={{ marginTop: 12, width: 'fit-content' }}><button onClick={() => change(i, line.quantity - 1)} aria-label="Decrease quantity">−</button><span>{line.quantity}</span><button onClick={() => change(i, line.quantity + 1)} aria-label="Increase quantity">+</button></div></div><div style={{ textAlign: 'right' }}><strong>{money(line.price * line.quantity)}</strong><br /><button className="view-link" style={{ border: 0, background: 'none', color: 'var(--danger)', marginTop: 12 }} onClick={() => setCart(cart.filter((_, idx) => idx !== i))} data-testid={`button-remove-cart-${i}`}>Remove</button></div></div>)}</section>
    <aside className="summary"><h2>Order summary</h2><div className="summary-row"><span>Subtotal</span><strong>{money(total)}</strong></div><div className="summary-row muted"><span>Delivery</span><span>Arranged with you</span></div><div className="summary-row total"><span>Total</span><span>{money(total)}</span></div><button className="button gold" style={{ width: '100%', marginTop: 16 }} onClick={() => nav('/checkout')} data-testid="button-proceed-checkout">Continue to checkout</button><Link href="/shop" className="view-link" style={{ display: 'block', textAlign: 'center', marginTop: 15 }}>Continue shopping</Link></aside></div>}
  </main></Layout>;
}
function Checkout({ cart, total, setCart, onConfirmed }: { cart: Cart; total: number; setCart: (c: Cart) => void; onConfirmed: (order: StoreOrder) => void }) {
  const [, nav] = useLocation(); const [form, setForm] = useState({ customerName: '', whatsappNumber: '', deliveryDay: 'Today', address: '', notes: '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [pickDate, setPickDate] = useState('');
  const change = (key: string, val: string) => setForm(old => ({ ...old, [key]: val }));
  async function submit(e: FormEvent) {
    e.preventDefault(); if (busy || !cart.length) return; setError('');
    if (!form.customerName.trim()) { setError('Enter your full name.'); return; }
    let normalized: string; try { normalized = normalizeWhatsAppNumber(form.whatsappNumber); } catch (err) { setError((err as Error).message); return; }
    const day = form.deliveryDay === 'Pick a date' ? pickDate : form.deliveryDay;
    if (!day) { setError('Choose your requested delivery date.'); return; }
    if (!form.address.trim()) { setError('Enter your delivery address.'); return; }
    setBusy(true);
    const orderNumber = `JC-${Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, '0')}`;
    const snapshots = cart.map(l => ({ productId: l.productId, productName: l.productName, size: l.size, quantity: l.quantity, priceAtOrder: l.price, image: l.image }));
    const orderPayload = { customerName: form.customerName.trim(), whatsappNumber: normalized, deliveryDay: day, address: form.address.trim(), notes: form.notes.trim(), items: snapshots, total, status: 'new', orderNumber };
    const waWindow = window.open('about:blank', '_blank');
    try {
      const id = await createOrder(orderPayload);
      const saved = { ...orderPayload, id, createdAt: new Date().toISOString() } as StoreOrder;
      onConfirmed(saved);
      setCart([]); nav('/order-confirmation');
      if (waWindow) waWindow.location.href = buildShopperWhatsAppUrl(saved);
    } catch {
      if (waWindow && !waWindow.closed) waWindow.close();
      setError('Your order could not be saved. Your bag is safe — please try again.');
    } finally { setBusy(false); }
  }
  if (!cart.length) return <Layout count={0}><main className="page shell"><div className="empty">Your bag is empty. <Link href="/shop" className="button small">Shop the collection</Link></div></main></Layout>;
  return <Layout count={cart.reduce((s, l) => s + l.quantity, 0)}><main className="page shell"><span className="eyebrow">Almost yours</span><h1 className="page-title">Checkout</h1><div className="checkout-layout"><form className="owner-form" onSubmit={submit}><h2 className="serif">Delivery details</h2>{error && <p className="error" role="alert">{error}</p>}
     <div className="field"><label htmlFor="customer-name">Full name *</label><input id="customer-name" autoComplete="name" required value={form.customerName} onChange={e => change('customerName', e.target.value)} data-testid="input-customer-name" /></div>
     <div className="field"><label htmlFor="customer-whatsapp">WhatsApp number *</label><input id="customer-whatsapp" type="tel" autoComplete="tel" required value={form.whatsappNumber} onChange={e => change('whatsappNumber', e.target.value)} placeholder="097 123 4567" data-testid="input-customer-whatsapp" /></div>
    <div className="field"><label htmlFor="delivery-day">Requested delivery day *</label><select id="delivery-day" value={form.deliveryDay} onChange={e => change('deliveryDay', e.target.value)} data-testid="select-delivery-day">{['Today', 'Tomorrow', 'Tuesday', 'Thursday', 'Saturday', 'Pick a date'].map(d => <option key={d}>{d}</option>)}</select></div>
     {form.deliveryDay === 'Pick a date' && <div className="field"><label htmlFor="delivery-date">Choose date *</label><input type="date" id="delivery-date" value={pickDate} onChange={e => setPickDate(e.target.value)} min={localDate()} data-testid="input-delivery-date" /> </div>}
     <div className="field"><label htmlFor="delivery-address">Delivery address *</label><textarea id="delivery-address" autoComplete="street-address" required value={form.address} onChange={e => change('address', e.target.value)} data-testid="input-delivery-address" /></div>
    <div className="field"><label htmlFor="delivery-notes">Notes (optional)</label><textarea id="delivery-notes" value={form.notes} onChange={e => change('notes', e.target.value)} data-testid="input-delivery-notes" /></div>
    <button className="button gold" type="submit" disabled={busy} data-testid="button-place-order">{busy ? 'Sending order…' : 'Send Order'}</button>
  </form><aside className="summary"><h2>Your order</h2>{cart.map((l, i) => <div className="summary-row" key={`${l.productId}${l.size}`}><span>{l.productName} · {l.size} × {l.quantity}</span><strong>{money(l.price * l.quantity)}</strong></div>)}<div className="summary-row total"><span>Total</span><span>{money(total)}</span></div></aside></div></main></Layout>;
}
function Confirmation({ cartCount, order }: { cartCount: number; order: StoreOrder | null }) {
   return <Layout count={cartCount}><main className="page shell" style={{ maxWidth: 760, textAlign: 'center' }}><span className="eyebrow">Order received</span><h1 className="page-title">Order Received</h1>{order ? <>
    <p className="muted">Your order number is</p><p className="serif" style={{ fontSize: 30 }} data-testid="text-order-number">{order.orderNumber}</p><div className="summary" style={{ textAlign: 'left', margin: '28px 0' }}>{order.items.map((i, n) => <div className="summary-row" key={n}><span>{i.productName} · {i.size} × {i.quantity}</span><strong>{money(i.priceAtOrder * i.quantity)}</strong></div>)}<div className="summary-row total"><span>Total</span><span>{money(order.total)}</span></div></div>
     <p data-testid="text-order-confirmation-copy">Thank you, {order.customerName}. Jeffchilu's will contact you on WhatsApp to confirm availability.</p><a className="button gold confirmation-whatsapp" href={buildShopperWhatsAppUrl(order)} target="_blank" rel="noreferrer" data-testid="button-open-whatsapp">Open WhatsApp to send your order</a>
    </> : <p className="muted">Your order confirmation is available in this app session. If you left this page, please contact us to confirm your order.</p>}<p style={{ marginTop: 24 }}><Link href="/shop" className="view-link">Return to the shop</Link></p></main></Layout>;
}

function OwnerGate({ user, authLoading, children }: { user: User | null; authLoading: boolean; children: ReactNode }) {
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    if (user && user.email?.toLowerCase() !== OWNER_EMAIL) { setDenied(true); void signOut(auth); }
    else if (user) setDenied(false);
  }, [user]);
  if (authLoading) return <div className="loading">Checking owner access…</div>;
  if (denied || (user && user.email?.toLowerCase() !== OWNER_EMAIL)) return <div className="page shell"><div className="error" data-testid="status-access-denied">Access denied</div></div>;
  if (!user) return <Redirect to="/owner/login" />;
  return <>{children}</>;
}
function OwnerShell({ children, title }: { children: ReactNode; title: string }) {
  const [, nav] = useLocation();
  const brand = useBrand();
  return <div className="owner-wrap"><aside className="owner-sidebar"><Link href="/" className="owner-brand"><img src={brand.logoUrl} alt="" /><span>{brand.name}</span></Link><Link href="/owner/dashboard">Dashboard</Link><Link href="/owner/orders">Orders</Link><Link href="/owner/items">Manage items</Link><Link href="/owner/items/new">Add item</Link><Link href="/owner/settings">Store settings</Link><button style={{ marginTop: 'auto' }} onClick={async () => { await signOut(auth); nav('/owner/login'); }} data-testid="button-owner-logout">Log out</button></aside><main className="owner-main"><div className="owner-top"><div><span className="eyebrow">Owner counter</span><h1 className="page-title" style={{ fontSize: 38 }}>{title}</h1></div><span className="muted">{auth.currentUser?.email}</span></div>{children}</main></div>;
}
function OwnerLogin({ user, authLoading }: { user: User | null; authLoading: boolean }) {
  const brand = useBrand();
  const [, nav] = useLocation(); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (user?.email?.toLowerCase() === OWNER_EMAIL) nav('/owner/dashboard');
    else if (user) { setError('Access denied'); void signOut(auth); }
  }, [user]);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      if (credential.user.email?.toLowerCase() !== OWNER_EMAIL) { await signOut(auth); setError('Access denied'); }
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/unauthorized-domain') setError(`Add this domain in Firebase Console > Authentication > Settings > Authorized domains. Current hostname: ${window.location.hostname}`);
      else if (code === 'auth/wrong-password') setError('The password is incorrect.');
      else if (code === 'auth/user-not-found' || code === 'auth/email-not-found') setError('No owner account was found for that email.');
      else if (code === 'auth/invalid-credential') setError('The email or password is incorrect.');
      else if (code === 'auth/network-request-failed') setError('Network connection failed. Check your connection and try again.');
      else setError(err?.message || 'Sign-in failed. Please try again.');
    } finally { setBusy(false); }
  }
  if (authLoading) return <div className="loading">Loading owner sign in…</div>;
  return <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: 'var(--charcoal)', padding: 20 }}><form className="owner-form" onSubmit={submit} style={{ width: 'min(100%, 430px)', textAlign: 'center' }}><img src={brand.logoUrl} alt={`${brand.name} logo`} style={{ width: 92, height: 92, objectFit: 'cover', borderRadius: '50%', margin: '0 auto 20px' }} /><span className="eyebrow">The owner's counter</span><h1 className="serif" style={{ fontSize: 30 }}>Welcome back</h1><p className="muted">Sign in to take care of your shop.</p>{error && <p className="error" role="alert">{error}</p>}<div className="field" style={{ textAlign: 'left' }}><label htmlFor="owner-email">Email</label><input id="owner-email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} data-testid="input-owner-email" /></div><div className="field" style={{ textAlign: 'left' }}><label htmlFor="owner-password">Password</label><input id="owner-password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} data-testid="input-owner-password" /></div><button className="button gold" style={{ width: '100%', marginTop: 10 }} disabled={busy} data-testid="button-owner-sign-in">{busy ? 'Signing in…' : 'Sign in'}</button><Link href="/" className="view-link" style={{ display: 'block', marginTop: 18 }}>Back to the shop</Link></form></main>;
}
function OwnerDashboard() {
  const [products, setProducts] = useState<Product[]>([]); const [orders, setOrders] = useState<StoreOrder[]>([]); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true); setError('');
    try { const [p, o] = await Promise.all([listProducts(), listOrders()]); setProducts(p); setOrders(o); }
    catch { setError('Could not load dashboard data. Please try again.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  return <OwnerShell title="Dashboard">{loading ? <div className="loading">Loading dashboard…</div> : error ? <p className="error" role="alert">{error} <button className="view-link" onClick={() => void load()} data-testid="button-retry-dashboard">Retry</button></p> : <><div className="stat-grid"><div className="stat"><span>Total Items</span><strong>{products.length}</strong></div><div className="stat"><span>New Orders</span><strong>{orders.filter(o => o.status === 'new').length}</strong></div><div className="stat"><span>Total Orders</span><strong>{orders.length}</strong></div><div className="stat"><span>Store Status</span><strong style={{ color: 'var(--sage)' }}>Online</strong></div></div><div className="section-top"><h2 className="serif">Recent orders</h2><Link className="view-link" href="/owner/orders">View all</Link></div><OrderTable orders={orders.slice(0, 5)} /></>}</OwnerShell>;
}
function OrderTable({ orders }: { orders: StoreOrder[] }) {
  return orders.length ? <div className="table-wrap"><table><thead><tr><th>Order / date</th><th>Customer / WhatsApp</th><th>Items</th><th>Total</th><th>Status</th><th>Delivery</th><th>Address / notes</th><th>Actions</th></tr></thead><tbody>{orders.map(o => {
    const date = o.createdAt?.toDate ? o.createdAt.toDate().toLocaleString() : o.createdAt ? new Date(o.createdAt).toLocaleString() : '—';
    return <tr key={o.id} data-testid={`row-order-${o.id}`}><td>{o.orderNumber}<br /><span className="muted">{date}</span></td><td>{o.customerName}<br /><span className="muted">{o.whatsappNumber}</span></td><td>{o.items?.map(i => `${i.productName} (${i.size}) ×${i.quantity}`).join(', ')}</td><td>{money(o.total)}</td><td><span className="badge">{o.status}</span></td><td>{o.deliveryDay}</td><td>{o.address}{o.notes && <><br /><span className="muted">{o.notes}</span></>}</td><td><div className="order-actions"><Link href={`/owner/orders/${o.id}`} className="view-link">Details</Link><a className="view-link" href={`https://wa.me/${o.whatsappNumber}?text=${encodeURIComponent(customerMessage(o))}`} target="_blank" rel="noreferrer" data-testid={`button-whatsapp-order-${o.id}`}>WhatsApp Customer</a></div></td></tr>;
  })}</tbody></table></div> : <div className="empty">No orders have arrived yet.</div>;
}
function OwnerOrders() {
  const [orders, setOrders] = useState<StoreOrder[]>([]); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  async function load() { setLoading(true); setError(''); try { setOrders(await listOrders()); } catch { setError('Could not load orders. Please try again.'); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, []);
  return <OwnerShell title="Orders">{loading ? <div className="loading">Loading orders…</div> : error ? <p className="error" role="alert">{error} <button className="view-link" onClick={() => void load()} data-testid="button-retry-orders">Retry</button></p> : <OrderTable orders={orders} />}</OwnerShell>;
}
function OwnerOrderDetail() {
  const { id = '' } = useParams<{ id: string }>(); const [order, setOrder] = useState<StoreOrder | null>(null); const [error, setError] = useState(''); const [statusError, setStatusError] = useState(''); const [loading, setLoading] = useState(true);
  async function load() { setLoading(true); setError(''); try { const found = await getOrder(id); if (!found) setError('This order was not found.'); else setOrder(found); } catch { setError('Unable to load this order.'); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, [id]);
  async function changeStatus(status: string) { if (!order) return; setStatusError(''); try { await updateOrderStatus(order.id, status); setOrder({ ...order, status }); } catch { setStatusError('Status update failed. Try again.'); } }
  return <OwnerShell title="Order details">{loading ? <div className="loading">Loading order…</div> : error ? <p className="error" role="alert">{error} <button className="view-link" onClick={() => void load()} data-testid="button-retry-order-detail">Retry</button></p> : !order ? <div className="empty">This order is not available.</div> : <div className="owner-form">{statusError && <p className="error" role="alert">{statusError}</p>}<div className="row" style={{ justifyContent: 'space-between' }}><h2 className="serif">{order.orderNumber}</h2><select value={order.status} onChange={e => void changeStatus(e.target.value)} data-testid="select-order-status">{['new', 'contacted', 'confirmed', 'completed', 'cancelled'].map(x => <option key={x} value={x}>{x[0].toUpperCase() + x.slice(1)}</option>)}</select></div><p><strong>{order.customerName}</strong> · {order.whatsappNumber}</p><p>Requested delivery: {order.deliveryDay}</p><p>Address: {order.address}</p>{order.notes && <p>Notes: {order.notes}</p>}<h3 className="serif">Items</h3>{order.items.map((i, n) => <div className="order-item-detail" key={n}><img src={i.image || '/images/logo.png'} alt={i.productName} /><span>{i.productName} · Size {i.size} × {i.quantity}<small>Price at order: {money(i.priceAtOrder)} each</small></span><strong>{money(i.priceAtOrder * i.quantity)}</strong></div>)}<div className="summary-row total"><span>Total</span><span>{money(order.total)}</span></div><a className="button gold" style={{ marginTop: 18 }} href={`https://wa.me/${order.whatsappNumber}?text=${encodeURIComponent(customerMessage(order))}`} target="_blank" rel="noreferrer" data-testid="button-whatsapp-customer">WhatsApp Customer</a></div>}</OwnerShell>;
}
type UploadState = { url: string; progress: number; error: string };
function ProductEditor({ editId }: { editId?: string }) {
  const [, nav] = useLocation(); const [name, setName] = useState(''); const [category, setCategory] = useState(''); const [sizesRaw, setSizesRaw] = useState(''); const [price, setPrice] = useState(''); const [description, setDescription] = useState('');
  const [uploads, setUploads] = useState<UploadState[]>([{ url: '', progress: 0, error: '' }, { url: '', progress: 0, error: '' }, { url: '', progress: 0, error: '' }]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [loadingExisting, setLoadingExisting] = useState(Boolean(editId)); const [editLoadFailed, setEditLoadFailed] = useState(false);
  async function loadExisting() {
    if (!editId) return;
    setLoadingExisting(true); setEditLoadFailed(false); setError('');
    try {
      const p = await getProduct(editId);
      if (!p) { setError('This product could not be found.'); setEditLoadFailed(true); return; }
      setName(p.name); setCategory(p.category || ''); setSizesRaw(p.sizes.join(', ')); setPrice(String(p.price)); setDescription(p.description);
      setUploads(p.images.concat(['', '', '']).slice(0, 3).map(url => ({ url, progress: 0, error: '' })));
    } catch { setError('Could not load this product.'); setEditLoadFailed(true); }
    finally { setLoadingExisting(false); }
  }
  useEffect(() => { if (editId) void loadExisting(); }, [editId]);
  async function upload(index: number, file?: File) {
    if (!file) return; setUploads(old => old.map((u, i) => i === index ? { ...u, error: '', progress: 1 } : u));
    try { const url = await cloudinaryUpload(file, progress => setUploads(old => old.map((u, i) => i === index ? { ...u, progress } : u))); setUploads(old => old.map((u, i) => i === index ? { url, progress: 100, error: '' } : u)); }
    catch (err) { setUploads(old => old.map((u, i) => i === index ? { ...u, progress: 0, error: (err as Error).message } : u)); }
  }
  async function submit(e: FormEvent) {
    e.preventDefault(); setError('');
    if (!category) { setError('Choose a category explicitly.'); return; }
    if (uploads.some(u => u.progress > 0 && u.progress < 100)) { setError('Wait for image uploads to finish.'); return; }
    if (uploads.some(u => u.error)) { setError('Fix the image upload errors before saving.'); return; }
    const parsedPrice = Number(price); if (!Number.isFinite(parsedPrice) || parsedPrice < 0) { setError('Enter a valid price.'); return; }
    const sizes = sizesRaw.split(',').map(s => s.trim()).filter(Boolean); if (!sizes.length) { setError('Add at least one size, or enter One Size.'); return; }
    setBusy(true);
    try { await saveProduct({ name: name.trim(), category: category as Category, sizes, price: parsedPrice, description: description.trim(), images: uploads.map(u => u.url).filter(Boolean) }, editId); nav('/owner/items'); }
    catch { setError('Could not save the product. Confirm owner access and try again.'); } finally { setBusy(false); }
  }
  if (loadingExisting) return <OwnerShell title="Edit item"><div className="loading">Loading product…</div></OwnerShell>;
  if (editLoadFailed) return <OwnerShell title="Edit item"><p className="error" role="alert">{error} <button className="view-link" onClick={() => void loadExisting()} data-testid="button-retry-edit-product">Retry</button></p></OwnerShell>;
  return <OwnerShell title={editId ? 'Edit item' : 'Add item'}><form className="owner-form" onSubmit={submit}>{error && <p className="error">{error}</p>}
    <div className="field"><label htmlFor="item-name">Item name *</label><input id="item-name" required value={name} onChange={e => setName(e.target.value)} data-testid="input-item-name" /></div>
    <div className="field"><label htmlFor="item-category">Category *</label><select id="item-category" required value={category} onChange={e => setCategory(e.target.value)} data-testid="select-item-category"><option value="">Choose category</option><option value="mens">Men's</option><option value="ladies">Ladies</option><option value="kids">Kids</option></select></div>
    <div className="field"><label htmlFor="item-sizes">Sizes * <span className="muted">(comma separated, e.g. S, M, L or One Size)</span></label><input id="item-sizes" required value={sizesRaw} onChange={e => setSizesRaw(e.target.value)} data-testid="input-item-sizes" /></div>
    <div className="field"><label htmlFor="item-price">Price in ZMW *</label><input id="item-price" type="number" min="0" step="0.01" required value={price} onChange={e => setPrice(e.target.value)} data-testid="input-item-price" /></div>
    <div className="field"><label htmlFor="item-description">Description</label><textarea id="item-description" value={description} onChange={e => setDescription(e.target.value)} data-testid="input-item-description" /></div>
    <div className="field"><label>Product images (up to 3, JPG/PNG/WebP, max 5MB each)</label><div className="file-row">{uploads.map((u, i) => <div className="upload-slot" key={i}>{u.url ? <img src={u.url} alt={`Product preview ${i + 1}`} /> : <span className="muted">Image {i + 1}</span>}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => void upload(i, e.target.files?.[0])} aria-label={`Upload image ${i + 1}`} data-testid={`input-item-image-${i + 1}`} />{u.progress > 0 && <div className="progress"><i style={{ width: `${u.progress}%` }} /></div>}{u.error && <small className="error">{u.error}</small>}</div>)}</div></div>
    <div className="row"><button className="button gold" disabled={busy} data-testid="button-save-item">{busy ? 'Saving…' : 'Save item'}</button><Link className="button outline" href="/owner/items">Cancel</Link></div>
  </form></OwnerShell>;
}
function OwnerItems() {
  const [items, setItems] = useState<Product[]>([]); const [filter, setFilter] = useState('all'); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  async function load() { setLoading(true); setError(''); try { setItems(await listProducts()); } catch { setError('Could not load catalogue.'); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, []);
  const filtered = items.filter(p => filter === 'all' ? true : filter === 'uncategorised' ? !p.category : p.category === filter);
  async function del(p: Product) { if (!window.confirm(`Delete “${p.name}”? This cannot be undone.`)) return; try { await removeProduct(p.id); setItems(items.filter(i => i.id !== p.id)); } catch { setError('Delete failed. Try again.'); } }
  return <OwnerShell title="Manage items">{error && <p className="error" role="alert">{error} <button className="view-link" onClick={() => void load()} data-testid="button-retry-items">Retry</button></p>}<div className="row" style={{ justifyContent: 'space-between', marginBottom: 18 }}><div className="filter-row">{['all', 'mens', 'ladies', 'kids', 'uncategorised'].map(f => <button key={f} className={`filter ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)} data-testid={`filter-owner-${f}`}>{f === 'all' ? 'All' : f === 'mens' ? "Men's" : f === 'uncategorised' ? 'Uncategorised' : f[0].toUpperCase() + f.slice(1)}</button>)}</div><Link className="button gold small" href="/owner/items/new">Add item</Link></div>{loading ? <div className="loading">Loading catalogue…</div> : error ? null : filtered.length ? <div className="table-wrap"><table><thead><tr><th>Item</th><th>Category</th><th>Sizes</th><th>Price</th><th></th></tr></thead><tbody>{filtered.map(p => <tr key={p.id} data-testid={`row-item-${p.id}`}><td><div className="row"><img src={p.images?.[0] || '/images/logo.png'} alt="" style={{ width: 48, height: 48, objectFit: 'cover' }} />{p.name}</div></td><td>{p.category || 'Uncategorised'}</td><td>{p.sizes?.join(', ')}</td><td>{money(p.price)}</td><td><div className="row"><Link className="view-link" href={`/owner/items/${p.id}/edit`}>Edit</Link><button className="view-link" style={{ border: 0, background: 'none', color: 'var(--danger)' }} onClick={() => void del(p)} data-testid={`button-delete-item-${p.id}`}>Delete</button></div></td></tr>)}</tbody></table></div> : <div className="empty">No products in this view yet. Catalog changes appear here once saved.</div>}</OwnerShell>;
}
function OwnerSettings() {
  const [name, setName] = useState("Jeffchilu's"); const [tagline, setTagline] = useState('Quality Products. Great Prices.'); const [logoUrl, setLogoUrl] = useState(''); const [progress, setProgress] = useState(0); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  useEffect(() => { getStoreSettings().then(s => { setName(String(s.name || "Jeffchilu's")); setTagline(String(s.tagline || 'Quality Products. Great Prices.')); setLogoUrl(String(s.logoUrl || '')); }).catch(() => setError('Could not load store settings.')); }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const next = { name: name.trim(), tagline: tagline.trim(), logoUrl: logoUrl || defaultBrand.logoUrl };
      await saveStoreSettings(next);
      publishBrand({ ...next, loadError: false });
      setNotice('Store settings saved.'); setError('');
    } catch { setError('Could not save settings.'); }
  }
  async function changeLogo(file?: File) { if (!file) return; try { const url = await cloudinaryUpload(file, setProgress); setLogoUrl(url); } catch (e) { setError((e as Error).message); } }
  return <OwnerShell title="Store settings"><form className="owner-form" onSubmit={submit}>{error && <p className="error">{error}</p>}{notice && <p className="success">{notice}</p>}<div className="field"><label htmlFor="store-name">Store name</label><input id="store-name" value={name} onChange={e => setName(e.target.value)} data-testid="input-store-name" /></div><div className="field"><label htmlFor="store-tagline">Tagline</label><input id="store-tagline" value={tagline} onChange={e => setTagline(e.target.value)} data-testid="input-store-tagline" /></div><div className="field"><label>Store logo</label><img src={logoUrl || defaultBrand.logoUrl} alt="Store logo preview" style={{ width: 110, height: 110, objectFit: 'contain', marginBottom: 10 }} data-testid="img-store-logo-preview" /><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => void changeLogo(e.target.files?.[0])} data-testid="input-store-logo" />{progress > 0 && progress < 100 && <div className="progress"><i style={{ width: `${progress}%` }} /></div>}</div><button className="button gold" data-testid="button-save-settings">Save settings</button></form></OwnerShell>;
}
function OwnerDashboardRoute({ user, authLoading, children }: { user: User | null; authLoading: boolean; children: ReactNode }) { return <OwnerGate user={user} authLoading={authLoading}>{children}</OwnerGate>; }
function App() {
  const { cart, setCart } = useCart(); const [user, setUser] = useState<User | null>(null); const [authLoading, setAuthLoading] = useState(true); const [toast, setToast] = useState('');
  const [confirmation, setConfirmation] = useState<StoreOrder | null>(null);
  useEffect(() => onAuthStateChanged(auth, current => { setUser(current); setAuthLoading(false); }), []);
  const showToast = (s: string) => setToast(s);
  return <><Switch>
    <Route path="/"><Storefront cart={cart} add={useCartAdd(setCart)} showToast={showToast} /></Route>
    <Route path="/shop"><Storefront cart={cart} add={useCartAdd(setCart)} showToast={showToast} /></Route>
    <Route path="/items/:id"><ItemDetail cart={cart} add={useCartAdd(setCart)} showToast={showToast} /></Route>
    <Route path="/cart"><CartPage cart={cart} setCart={setCart} count={cart.reduce((n, l) => n + l.quantity, 0)} total={cart.reduce((n, l) => n + l.price * l.quantity, 0)} /></Route>
    <Route path="/checkout"><Checkout cart={cart} total={cart.reduce((n, l) => n + l.price * l.quantity, 0)} setCart={setCart} onConfirmed={setConfirmation} /></Route>
    <Route path="/order-confirmation"><Confirmation cartCount={cart.reduce((n, l) => n + l.quantity, 0)} order={confirmation} /></Route>
    <Route path="/owner/login"><OwnerLogin user={user} authLoading={authLoading} /></Route>
    <Route path="/owner/dashboard"><OwnerDashboardRoute user={user} authLoading={authLoading}><OwnerDashboard /></OwnerDashboardRoute></Route>
    <Route path="/owner/orders"><OwnerDashboardRoute user={user} authLoading={authLoading}><OwnerOrders /></OwnerDashboardRoute></Route>
    <Route path="/owner/orders/:id"><OwnerDashboardRoute user={user} authLoading={authLoading}><OwnerOrderDetail /></OwnerDashboardRoute></Route>
    <Route path="/owner/items/new"><OwnerDashboardRoute user={user} authLoading={authLoading}><ProductEditor /></OwnerDashboardRoute></Route>
    <Route path="/owner/items"><OwnerDashboardRoute user={user} authLoading={authLoading}><OwnerItems /></OwnerDashboardRoute></Route>
    <Route path="/owner/items/:id/edit"><OwnerDashboardRoute user={user} authLoading={authLoading}><EditProductRoute /></OwnerDashboardRoute></Route>
    <Route path="/owner/settings"><OwnerDashboardRoute user={user} authLoading={authLoading}><OwnerSettings /></OwnerDashboardRoute></Route>
    <Route><NotFound /></Route>
  </Switch><Toast text={toast} close={() => setToast('')} /></>;
}
function useCartAdd(setCart: (fn: (old: Cart) => Cart) => void) {
  return (product: Product, size: string, quantity = 1) => setCart(prev => addCartLine(prev, product, size, quantity));
}
function EditProductRoute() { const { id = '' } = useParams<{ id: string }>(); return <ProductEditor editId={id} />; }
function NotFound() { return <><Header count={0} /><main className="page shell"><span className="eyebrow">404</span><h1 className="page-title">This page took another turn.</h1><Link className="button gold" href="/">Back to the shop</Link></main><Footer /></>; }
export default App;
