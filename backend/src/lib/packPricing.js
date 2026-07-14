/**
 * Pack pricing logic for multi-function ticket sales.
 *
 * The algorithm matches slots across sessions by section and position.
 * A slot at position k is priced according to how many sessions have at least
 * k+1 slots in the same section (the "depth" of the stack).
 */

/**
 * Normalize the pack section for an item.
 * Butacas are always grouped under 'platea_general' for pack pricing.
 * Palcos keep their section (palcos_bajos / palcos_altos).
 */
function getPackSection(item) {
  if (!item || !item.type) return 'unknown';
  const type = String(item.type).toLowerCase();
  if (type === 'butaca') return 'platea_general';
  if (type === 'palco') {
    const sec = String(item.section || '').toLowerCase();
    if (sec.includes('alto') || sec === 'palcos_altos') return 'palcos_altos';
    return 'palcos_bajos';
  }
  if (type === 'pullman') return 'pullman';
  if (type === 'general') return 'general';
  return item.section || 'unknown';
}

/**
 * Pack discount groups:
 * - Platea + Pullman share the same depth counter.
 * - Palcos Altos + Palcos Bajos share the same depth counter.
 * - General remains independent.
 */
function getPackGroup(section) {
  if (section === 'platea_general' || section === 'pullman') return 'platea_pullman';
  if (section === 'palcos_bajos' || section === 'palcos_altos') return 'palcos';
  return section;
}

/**
 * Original/base price used only for ordering slots within a session/section.
 */
function getOriginalPrice(item) {
  if (!item) return 0;
  if (item.type === 'butaca' || item.type === 'palco') {
    return Number(item.price || 0);
  }
  return Number(item.unit_price || 0);
}

/**
 * Expand an item into individual slots for the matching algorithm.
 * - butaca / palco -> 1 slot each (the whole seat/box)
 * - pullman / general -> N slots of 1 person each
 */
function expandItemToSlots(item, sessionId) {
  if (!item) return [];
  const base = {
    session_id: sessionId,
    type: item.type,
    section: getPackSection(item),
    seat_code: item.seat_code || null,
    capacity: item.type === 'palco' ? Number(item.capacity || 1) : 1,
    quantity: 1,
    originalPrice: getOriginalPrice(item),
    finalPrice: null
  };

  if (item.type === 'pullman' || item.type === 'general') {
    const qty = Math.max(1, Number(item.quantity || 1));
    return Array.from({ length: qty }, () => ({ ...base }));
  }

  return [base];
}

/**
 * Compute final pack price for every slot.
 *
 * @param {Object} itemsBySession - { sessionId: [item] }
 * @param {Object} packPricing - { "1": { section: price }, "2": {...}, ... }
 * @param {Number} packMaxSessions - max number of sessions to consider (default 3)
 * @returns {Array} priced slots with finalPrice assigned
 */
export function computePackTicketPrices(itemsBySession, packPricing, packMaxSessions = 3) {
  if (!itemsBySession || typeof itemsBySession !== 'object') return [];
  if (!packPricing) packPricing = {};

  // Group slots by pack group, then by original pack section and session.
  const slotsByGroupBySectionBySession = {};

  for (const [sessionId, items] of Object.entries(itemsBySession)) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const section = getPackSection(item);
      const group = getPackGroup(section);
      if (!slotsByGroupBySectionBySession[group]) slotsByGroupBySectionBySession[group] = {};
      if (!slotsByGroupBySectionBySession[group][section]) slotsByGroupBySectionBySession[group][section] = {};
      if (!slotsByGroupBySectionBySession[group][section][sessionId]) {
        slotsByGroupBySectionBySession[group][section][sessionId] = [];
      }
      const slots = expandItemToSlots(item, sessionId);
      slotsByGroupBySectionBySession[group][section][sessionId].push(...slots);
    }
  }

  const result = [];

  for (const [group, slotsBySectionBySession] of Object.entries(slotsByGroupBySectionBySession)) {
    for (const [section, sessionSlots] of Object.entries(slotsBySectionBySession)) {
      const sessionIds = Object.keys(sessionSlots);

      // Sort each session's slots by originalPrice descending
      for (const sessionId of sessionIds) {
        sessionSlots[sessionId].sort((a, b) => b.originalPrice - a.originalPrice);
      }

      // Depth is determined by how many sessions have ANY slot in this group at position k
      const groupSessions = new Set();
      Object.values(slotsBySectionBySession).forEach(bySession => {
        Object.keys(bySession).forEach(sid => groupSessions.add(sid));
      });
      const groupSessionSlots = {};
      for (const sessionId of groupSessions) {
        groupSessionSlots[sessionId] = [];
        for (const [sec, bySession] of Object.entries(slotsBySectionBySession)) {
          groupSessionSlots[sessionId].push(...(bySession[sessionId] || []));
        }
        groupSessionSlots[sessionId].sort((a, b) => b.originalPrice - a.originalPrice);
      }
      const maxCount = Math.max(0, ...Object.values(groupSessionSlots).map(slots => slots.length));

      for (let k = 0; k < maxCount; k++) {
        let depth = 0;
        for (const sessionId of groupSessions) {
          if (groupSessionSlots[sessionId].length > k) depth++;
        }

        depth = Math.min(Math.max(1, depth), Math.max(1, Number(packMaxSessions) || 3));
        const priceForDepth = packPricing?.[depth]?.[section] ?? packPricing?.[String(depth)]?.[section] ?? 0;

        for (const sessionId of sessionIds) {
          if (sessionSlots[sessionId].length > k) {
            const slot = sessionSlots[sessionId][k];
            slot.finalPrice = Number(priceForDepth);
            result.push(slot);
          }
        }
      }
    }
  }

  return result;
}

/**
 * Calculate pack-level totals from priced slots.
 *
 * @param {Array} pricedSlots - output of computePackTicketPrices
 * @param {Number} serviceFeePercent - e.g. 10
 * @param {Array} serviceItems - optional services with { price, quantity }
 * @param {Number|null} discountAmount - pre-computed discount amount
 */
export function calculatePackTotals(pricedSlots, serviceFeePercent = 10, serviceItems = [], discountAmount = 0) {
  const subtotal = pricedSlots.reduce((sum, slot) => sum + (slot.finalPrice || 0), 0);
  const servicesSubtotal = (serviceItems || []).reduce((sum, s) => sum + (Number(s.price || 0) * Number(s.quantity || 1)), 0);
  const serviceFeeAmount = Math.round((subtotal - discountAmount + servicesSubtotal) * (serviceFeePercent / 100));
  const total = subtotal - discountAmount + serviceFeeAmount + servicesSubtotal;

  return {
    subtotal,
    discountAmount,
    servicesSubtotal,
    serviceFeePercent,
    serviceFeeAmount,
    total
  };
}

/**
 * Parse service_items stored as TEXT/JSON in reservations or sales.
 */
export function parseServiceItems(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}
