const express = require('express');
const Joi     = require('joi');
const db      = require('../database');
const { authenticate } = require('../middleware/auth');
const { authorize }    = require('../middleware/roles');

const router = express.Router({ mergeParams: true });

const locationSchema = Joi.object({
  country:   Joi.string().max(100).required(),
  city:      Joi.string().max(100).required(),
  employer:  Joi.string().max(200).optional(),
  latitude:  Joi.number().min(-90).max(90).optional(),
  longitude: Joi.number().min(-180).max(180).optional(),
  notes:     Joi.string().max(500).optional()
});

/**
 * @swagger
 * tags:
 *   name: Locations
 *   description: Track foreign-employed citizens' current location
 */

/**
 * @swagger
 * /api/citizens/{nid}/location:
 *   post:
 *     summary: Update current location — citizen updates own location upon arrival (Scenario v)
 *     tags: [Locations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: nid, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [country, city]
 *             properties:
 *               country:   { type: string, example: "Saudi Arabia" }
 *               city:      { type: string, example: "Riyadh" }
 *               employer:  { type: string, example: "Al Rajhi Group" }
 *               latitude:  { type: number, example: 24.7136 }
 *               longitude: { type: number, example: 46.6753 }
 *               notes:     { type: string }
 *     responses:
 *       201:
 *         description: Location updated
 */
router.post('/', authenticate, async (req, res) => {
  try {
    if (req.user.nid !== req.params.nid)
      return res.status(403).json({ success: false, error: 'You can only update your own location.' });

    const { error, value } = locationSchema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const citizen = await db.get('SELECT nid FROM users WHERE nid = ? AND is_active = 1', [req.params.nid]);
    if (!citizen) return res.status(404).json({ success: false, error: 'Citizen not found.' });

    const result = await db.run(
      'INSERT INTO locations (nid,country,city,employer,latitude,longitude,notes) VALUES (?,?,?,?,?,?,?)',
      [req.params.nid, value.country, value.city, value.employer??null, value.latitude??null, value.longitude??null, value.notes??null]
    );
    res.status(201).json({
      success: true,
      message: 'Location updated successfully.',
      data: { id: result.lastInsertRowid, nid: req.params.nid, ...value, updated_at: new Date().toISOString() }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * @swagger
 * /api/citizens/{nid}/location:
 *   get:
 *     summary: Get location history of a citizen — officer only
 *     tags: [Locations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: nid, required: true, schema: { type: string } }
 *       - { in: query, name: page,  schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 10 } }
 *     responses:
 *       200:
 *         description: Paginated location history
 */
router.get('/', authenticate, authorize('officer'), async (req, res) => {
  try {
    const { nid } = req.params;
    const pg = Math.max(1, parseInt(req.query.page||1));
    const lm = Math.min(50, parseInt(req.query.limit||10));
    const offset = (pg - 1) * lm;

    const citizen = await db.get('SELECT nid, name FROM users WHERE nid = ?', [nid]);
    if (!citizen) return res.status(404).json({ success: false, error: 'Citizen not found.' });

    const countRow = await db.get('SELECT COUNT(*) as cnt FROM locations WHERE nid = ?', [nid]);
    const total = countRow?.cnt || 0;
    const history = await db.all('SELECT * FROM locations WHERE nid = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?', [nid, lm, offset]);

    res.json({ success: true, data: { citizen_nid: nid, citizen_name: citizen.name, history }, pagination: { page: pg, limit: lm, total, pages: Math.ceil(total/lm) } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
