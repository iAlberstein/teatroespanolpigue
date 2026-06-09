import express from 'express';
import { sequelize } from '../lib/sequelize.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { getSeatPrice, getPricingRules, groupPricingRulesForDisplay, getPriceTiers } from '../lib/seatPricing.js';

const router = express.Router();

/**
 * GET /api/seat-pricing/rules/:showId
 * Get all pricing rules for a show (admin only)
 */
router.get('/rules/:showId', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { showId } = req.params;
    const { sessionId } = req.query;
    
    const rules = await getPricingRules(showId, sessionId || null);
    const grouped = groupPricingRulesForDisplay(rules);
    
    res.json({
      success: true,
      rules: rules.map(r => ({
        id: r.id,
        show_id: r.show_id,
        session_id: r.session_id,
        seat_code: r.seat_code,
        row_letter: r.row_letter,
        row_from: r.row_from,
        row_to: r.row_to,
        palco_numbers: r.palco_numbers,
        palco_from: r.palco_from,
        palco_to: r.palco_to,
        is_palco_alto: r.is_palco_alto,
        price: r.price,
        priority: r.priority,
        label: r.label,
        color: r.color,
        created_at: r.created_at
      })),
      grouped
    });
  } catch (error) {
    console.error('[SEAT_PRICING] Error getting rules:', error);
    res.status(500).json({ success: false, error: 'internal_error' });
  }
});

/**
 * POST /api/seat-pricing/rules
 * Create a new pricing rule (admin only)
 */
router.post('/rules', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { seat_pricing: SeatPricing } = sequelize.models;
    const {
      show_id,
      session_id,
      row_from,
      row_to,
      palco_from,
      palco_to,
      is_palco_alto,
      price,
      label,
      color
    } = req.body;
    
    // Validation
    if (!show_id && !session_id) {
      return res.status(400).json({
        success: false,
        error: 'missing_reference',
        message: 'Debe especificar show_id o session_id'
      });
    }
    
    if (!price || parseFloat(price) <= 0) {
      return res.status(400).json({
        success: false,
        error: 'invalid_price',
        message: 'El precio debe ser mayor a 0'
      });
    }
    
    // Either row range OR palco range must be specified
    const hasRowRange = row_from && row_to;
    const hasPalcoRange = palco_from !== undefined && palco_to !== undefined;
    
    if (!hasRowRange && !hasPalcoRange) {
      return res.status(400).json({
        success: false,
        error: 'missing_range',
        message: 'Debe especificar un rango de filas o de palcos'
      });
    }
    
    // Check for overlapping rules
    const whereOverlap = {
      [sequelize.Sequelize.Op.or]: [
        { show_id: show_id || null },
        { session_id: session_id || null }
      ]
    };
    
    if (hasRowRange) {
      whereOverlap[sequelize.Sequelize.Op.and] = [
        {
          [sequelize.Sequelize.Op.or]: [
            {
              row_from: { [sequelize.Sequelize.Op.lte]: row_to },
              row_to: { [sequelize.Sequelize.Op.gte]: row_from }
            },
            {
              row_from: { [sequelize.Sequelize.Op.gte]: row_from, [sequelize.Sequelize.Op.lte]: row_to }
            }
          ]
        }
      ];
    }
    
    if (hasPalcoRange) {
      whereOverlap.is_palco_alto = is_palco_alto;
      whereOverlap[sequelize.Sequelize.Op.and] = [
        {
          [sequelize.Sequelize.Op.or]: [
            {
              palco_from: { [sequelize.Sequelize.Op.lte]: palco_to },
              palco_to: { [sequelize.Sequelize.Op.gte]: palco_from }
            }
          ]
        }
      ];
    }
    
    const existingOverlap = await SeatPricing.findOne({ where: whereOverlap });
    
    if (existingOverlap) {
      return res.status(409).json({
        success: false,
        error: 'overlap',
        message: 'Ya existe una regla que se superpone con este rango'
      });
    }
    
    // Create rule
    const rule = await SeatPricing.create({
      show_id,
      session_id,
      row_from,
      row_to,
      palco_from,
      palco_to,
      is_palco_alto: is_palco_alto || false,
      price,
      priority: hasRowRange ? 3 : 4,
      label: label || null,
      color: color || null
    });
    
    res.json({
      success: true,
      rule: {
        id: rule.id,
        show_id: rule.show_id,
        session_id: rule.session_id,
        row_from: rule.row_from,
        row_to: rule.row_to,
        palco_from: rule.palco_from,
        palco_to: rule.palco_to,
        is_palco_alto: rule.is_palco_alto,
        price: rule.price,
        label: rule.label,
        color: rule.color
      }
    });
  } catch (error) {
    console.error('[SEAT_PRICING] Error creating rule:', error);
    res.status(500).json({ success: false, error: 'internal_error' });
  }
});

/**
 * DELETE /api/seat-pricing/rules/:id
 * Delete a pricing rule (admin only)
 */
router.delete('/rules/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { seat_pricing: SeatPricing } = sequelize.models;
    const { id } = req.params;
    
    const rule = await SeatPricing.findByPk(id);
    if (!rule) {
      return res.status(404).json({
        success: false,
        error: 'not_found',
        message: 'Regla de precio no encontrada'
      });
    }
    
    await rule.destroy();
    
    res.json({ success: true, message: 'Regla eliminada' });
  } catch (error) {
    console.error('[SEAT_PRICING] Error deleting rule:', error);
    res.status(500).json({ success: false, error: 'internal_error' });
  }
});

/**
 * GET /api/seat-pricing/calculate/:sessionId/:seatCode
 * Get price for a specific seat (public)
 */
router.get('/calculate/:sessionId/:seatCode', async (req, res) => {
  try {
    const { sessionId, seatCode } = req.params;
    const { sessions: Session, shows: Show } = sequelize.models;
    
    const session = await Session.findByPk(sessionId, {
      include: [{ model: Show, as: 'show' }]
    });
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'session_not_found'
      });
    }
    
    // Parse pricing
    let basePricing = {};
    if (session.pricing_json) {
      basePricing = typeof session.pricing_json === 'string' 
        ? JSON.parse(session.pricing_json) 
        : session.pricing_json;
    } else if (session.show?.pricing_json) {
      basePricing = typeof session.show.pricing_json === 'string'
        ? JSON.parse(session.show.pricing_json)
        : session.show.pricing_json;
    }
    
    const result = await getSeatPrice(sessionId, session.show_id, seatCode, basePricing);
    
    res.json({
      success: true,
      seat_code: seatCode,
      price: result.price,
      source: result.source
    });
  } catch (error) {
    console.error('[SEAT_PRICING] Error calculating price:', error);
    res.status(500).json({ success: false, error: 'internal_error' });
  }
});

/**
 * GET /api/seat-pricing/tiers/:sessionId
 * Get price tiers for display (public)
 */
router.get('/tiers/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { sessions: Session, shows: Show } = sequelize.models;
    
    const session = await Session.findByPk(sessionId, {
      include: [{ model: Show, as: 'show' }]
    });
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'session_not_found'
      });
    }
    
    // Parse pricing
    let basePricing = {};
    if (session.pricing_json) {
      basePricing = typeof session.pricing_json === 'string' 
        ? JSON.parse(session.pricing_json) 
        : session.pricing_json;
    } else if (session.show?.pricing_json) {
      basePricing = typeof session.show.pricing_json === 'string'
        ? JSON.parse(session.show.pricing_json)
        : session.show.pricing_json;
    }
    
    const tiers = await getPriceTiers(sessionId, session.show_id, basePricing);
    
    // Add base prices for sections not covered by custom rules
    const hasPlateaTiers = tiers.some(t => t.section === 'platea');
    if (!hasPlateaTiers && basePricing.platea_general) {
      tiers.push({
        section: 'platea',
        type: 'base',
        label: 'Todas las filas',
        price: basePricing.platea_general,
        rows: { from: 'A', to: 'M' }
      });
    }
    
    const hasPalcosBajosTiers = tiers.some(t => t.section === 'palcos_bajos');
    if (!hasPalcosBajosTiers && basePricing.palcos_bajos) {
      tiers.push({
        section: 'palcos_bajos',
        type: 'base',
        label: 'Todos los palcos bajos',
        price: basePricing.palcos_bajos,
        palcos: { from: 1, to: 20 }
      });
    }
    
    const hasPalcosAltosTiers = tiers.some(t => t.section === 'palcos_altos');
    if (!hasPalcosAltosTiers && basePricing.palcos_altos) {
      tiers.push({
        section: 'palcos_altos',
        type: 'base',
        label: 'Todos los palcos altos',
        price: basePricing.palcos_altos,
        palcos: { from: 1, to: 18 }
      });
    }
    
    // Pullman (always base price)
    if (basePricing.pullman) {
      tiers.push({
        section: 'pullman',
        type: 'base',
        label: 'Pullman',
        price: basePricing.pullman
      });
    }
    
    res.json({
      success: true,
      tiers,
      base_pricing: basePricing
    });
  } catch (error) {
    console.error('[SEAT_PRICING] Error getting tiers:', error);
    res.status(500).json({ success: false, error: 'internal_error' });
  }
});

/**
 * GET /api/seat-pricing/show/:showId
 * Get pricing rules for a show (public) - used by ShowInfo page
 */
router.get('/show/:showId', async (req, res) => {
  try {
    const { showId } = req.params;
    const { seat_pricing: SeatPricing } = sequelize.models;
    
    const rules = await SeatPricing.findAll({
      where: { 
        show_id: showId,
        session_id: null  // Only show-level rules, not session-specific
      },
      order: [
        ['row_from', 'ASC'],
        ['palco_from', 'ASC'],
        ['price', 'ASC']
      ]
    });
    
    res.json(rules.map(r => ({
      id: r.id,
      row_from: r.row_from,
      row_to: r.row_to,
      palco_from: r.palco_from,
      palco_to: r.palco_to,
      is_palco_alto: r.is_palco_alto,
      price: r.price,
      label: r.label,
      color: r.color
    })));
  } catch (error) {
    console.error('[SEAT_PRICING] Error getting show pricing:', error);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
