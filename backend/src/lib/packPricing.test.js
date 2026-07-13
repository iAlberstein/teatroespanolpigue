import { describe, it } from 'node:test';
import assert from 'node:assert';
import { computePackTicketPrices, calculatePackTotals, parseServiceItems } from './packPricing.js';

const packPricing = {
  1: { platea_general: 20000, palcos_bajos: 80000, palcos_altos: 60000, pullman: 15000, general: 15000 },
  2: { platea_general: 18000, palcos_bajos: 72000, palcos_altos: 54000, pullman: 13500, general: 13500 },
  3: { platea_general: 16000, palcos_bajos: 64000, palcos_altos: 48000, pullman: 12000, general: 12000 }
};

describe('computePackTicketPrices', () => {
  it('matches the 2+4 example from the proposal', () => {
    const itemsBySession = {
      A: [
        { type: 'butaca', section: 'platea_general', seat_code: 'A1', price: 20000 },
        { type: 'butaca', section: 'platea_general', seat_code: 'A2', price: 20000 }
      ],
      B: [
        { type: 'butaca', section: 'platea_general', seat_code: 'B1', price: 20000 },
        { type: 'butaca', section: 'platea_general', seat_code: 'B2', price: 20000 },
        { type: 'butaca', section: 'platea_general', seat_code: 'B3', price: 20000 },
        { type: 'butaca', section: 'platea_general', seat_code: 'B4', price: 20000 }
      ]
    };

    const priced = computePackTicketPrices(itemsBySession, packPricing, 3);
    const bySession = { A: 0, B: 0 };
    const priceCounts = { 18000: 0, 20000: 0 };

    for (const slot of priced) {
      bySession[slot.session_id]++;
      priceCounts[slot.finalPrice] = (priceCounts[slot.finalPrice] || 0) + 1;
    }

    assert.strictEqual(priced.length, 6);
    assert.strictEqual(bySession.A, 2);
    assert.strictEqual(bySession.B, 4);
    assert.strictEqual(priceCounts[18000], 4);
    assert.strictEqual(priceCounts[20000], 2);
  });

  it('matches the 5+3+2 example from the proposal', () => {
    const itemsBySession = {
      A: Array.from({ length: 5 }, (_, i) => ({ type: 'butaca', section: 'platea_general', seat_code: `A${i + 1}`, price: 20000 })),
      B: Array.from({ length: 3 }, (_, i) => ({ type: 'butaca', section: 'platea_general', seat_code: `B${i + 1}`, price: 20000 })),
      C: Array.from({ length: 2 }, (_, i) => ({ type: 'butaca', section: 'platea_general', seat_code: `C${i + 1}`, price: 20000 }))
    };

    const priced = computePackTicketPrices(itemsBySession, packPricing, 3);
    const bySession = { A: [], B: [], C: [] };

    for (const slot of priced) {
      bySession[slot.session_id].push(slot.finalPrice);
    }

    assert.strictEqual(priced.length, 10);
    assert.deepStrictEqual(bySession.A.sort((a, b) => a - b), [16000, 16000, 18000, 20000, 20000]);
    assert.deepStrictEqual(bySession.B.sort((a, b) => a - b), [16000, 16000, 18000]);
    assert.deepStrictEqual(bySession.C.sort((a, b) => a - b), [16000, 16000]);
  });

  it('groups palcos separately by section', () => {
    const itemsBySession = {
      A: [
        { type: 'palco', section: 'palcos_bajos', seat_code: 'PB1', price: 80000, capacity: 4 },
        { type: 'palco', section: 'palcos_altos', seat_code: 'PA1', price: 60000, capacity: 2 }
      ],
      B: [
        { type: 'palco', section: 'palcos_bajos', seat_code: 'PB2', price: 80000, capacity: 4 }
      ]
    };

    const priced = computePackTicketPrices(itemsBySession, packPricing, 3);
    const pb = priced.filter(s => s.section === 'palcos_bajos');
    const pa = priced.filter(s => s.section === 'palcos_altos');

    assert.strictEqual(pb.length, 2);
    assert.strictEqual(pa.length, 1);
    assert.strictEqual(pb.every(s => s.finalPrice === 72000), true);
    assert.strictEqual(pa[0].finalPrice, 60000);
  });

  it('handles pullman and general as quantity slots', () => {
    const itemsBySession = {
      A: [{ type: 'pullman', section: 'pullman', quantity: 3, unit_price: 15000 }],
      B: [{ type: 'pullman', section: 'pullman', quantity: 1, unit_price: 15000 }]
    };

    const priced = computePackTicketPrices(itemsBySession, packPricing, 3);
    const byPrice = {};
    for (const slot of priced) {
      byPrice[slot.finalPrice] = (byPrice[slot.finalPrice] || 0) + 1;
    }

    assert.strictEqual(priced.length, 4);
    assert.strictEqual(byPrice[13500], 2);
    assert.strictEqual(byPrice[15000], 2);
  });
});

describe('calculatePackTotals', () => {
  it('calculates totals correctly', () => {
    const priced = [
      { finalPrice: 20000 }, { finalPrice: 18000 }
    ];
    const totals = calculatePackTotals(priced, 10, [{ price: 5000, quantity: 1 }], 2000);

    assert.strictEqual(totals.subtotal, 38000);
    assert.strictEqual(totals.servicesSubtotal, 5000);
    assert.strictEqual(totals.serviceFeeAmount, 4100); // (38000 - 2000 + 5000) * 0.1
    assert.strictEqual(totals.total, 45100);
  });
});

describe('parseServiceItems', () => {
  it('parses JSON strings and arrays', () => {
    assert.deepStrictEqual(parseServiceItems('[{"price":100}]'), [{ price: 100 }]);
    assert.deepStrictEqual(parseServiceItems([{ price: 100 }]), [{ price: 100 }]);
    assert.deepStrictEqual(parseServiceItems(''), []);
    assert.deepStrictEqual(parseServiceItems(null), []);
  });
});
