import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET, WHATSAPP_NUMBER } from './config';

export function normalizeWhatsAppNumber(input: string): string {
  let value = input.trim().replace(/[\s\-()+]/g, '');
  if (value.startsWith('00')) value = value.slice(2);
  if (/^0\d{9}$/.test(value)) return `260${value.slice(1)}`;
  if (/^260\d{9}$/.test(value)) return value;
  if (/^\d{10,15}$/.test(value)) return value;
  throw new Error('Enter a valid WhatsApp number, including the country code if outside Zambia.');
}

type ShopperOrderMessage = {
  orderNumber: string;
  customerName: string;
  whatsappNumber: string;
  deliveryDay: string;
  address: string;
  notes?: string;
  total: number;
  items: Array<{
    productName: string;
    size: string;
    quantity: number;
    priceAtOrder: number;
  }>;
};

function money(amount: number): string {
  return `K${Number(amount || 0).toLocaleString('en-ZM', { maximumFractionDigits: 2 })}`;
}

export function buildShopperOrderMessage(order: ShopperOrderMessage): string {
  return [
    `Hello Jeffchilu's, I have placed order ${order.orderNumber}.`,
    '',
    'My order:',
    ...order.items.map(item =>
      `• ${item.productName} — Size ${item.size} × ${item.quantity} — ${money(item.priceAtOrder)} each`,
    ),
    '',
    `Total: ${money(order.total)}`,
    `Name: ${order.customerName}`,
    `WhatsApp: ${order.whatsappNumber}`,
    `Requested delivery: ${order.deliveryDay}`,
    `Address: ${order.address}`,
    order.notes ? `Notes: ${order.notes}` : '',
  ].filter(Boolean).join('\n');
}

export function buildShopperWhatsAppUrl(order: ShopperOrderMessage): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(buildShopperOrderMessage(order))}`;
}

export function cloudinaryUpload(file: File, onProgress: (n: number) => void): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    return Promise.reject(new Error('Choose a JPG, PNG or WebP image up to 5MB.'));
  }
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    form.append('folder', 'jeffchilus');
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`);
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100)); };
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'));
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data.secure_url) resolve(data.secure_url);
        else reject(new Error(data.error?.message || 'Image upload failed.'));
      } catch { reject(new Error('Image upload failed.')); }
    };
    xhr.send(form);
  });
}
