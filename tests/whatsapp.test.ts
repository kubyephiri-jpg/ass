import { describe, expect, it } from 'vitest';
import { buildShopperOrderMessage, buildShopperWhatsAppUrl, normalizeWhatsAppNumber } from '../src/lib/whatsapp';

describe('normalizeWhatsAppNumber', () => {
  it.each([
    ['0971234567', '260971234567'],
    ['+260971234567', '260971234567'],
    ['260971234567', '260971234567'],
    ['097 123 4567', '260971234567'],
    ['0027 74 734 7207', '27747347207'],
    ['+27747347207', '27747347207'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeWhatsAppNumber(input)).toBe(expected);
  });

  it.each(['123', '09 7123 456', '+abc', '000'])('rejects invalid input %s', input => {
    expect(() => normalizeWhatsAppNumber(input)).toThrow();
  });

  it('builds an encoded store WhatsApp URL with the full order snapshot', () => {
    const order = {
      orderNumber: 'JC-ABC123',
      customerName: 'Amina',
      whatsappNumber: '260971234567',
      deliveryDay: 'Tuesday',
      address: 'Lusaka',
      notes: 'Call on arrival',
      total: 170,
      items: [
        { productName: 'Everyday Bag', size: 'One Size', quantity: 2, priceAtOrder: 85 },
      ],
    };
    const message = buildShopperOrderMessage(order);
    expect(message).toContain('JC-ABC123');
    expect(message).toContain('Everyday Bag — Size One Size × 2 — K85 each');
    expect(message).toContain('Total: K170');
    expect(message).toContain('Name: Amina');
    expect(message).toContain('WhatsApp: 260971234567');
    expect(message).toContain('Requested delivery: Tuesday');
    expect(message).toContain('Address: Lusaka');
    expect(message).toContain('Notes: Call on arrival');
    expect(buildShopperWhatsAppUrl(order)).toMatch(/^https:\/\/wa\.me\/27747347207\?text=/);
    expect(buildShopperWhatsAppUrl(order)).toContain(encodeURIComponent(message));
  });
});
