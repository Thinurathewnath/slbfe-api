const express = require('express');
const Joi     = require('joi');
const db      = require('../database');
const { authenticate } = require('../middleware/auth');
const { authorize }    = require('../middleware/roles');

const router = express.Router();

const complaintSchema = Joi.object({
  subject:     Joi.string().min(5).max(200).required(),
  description: Joi.string().min(10).required(),
  category:    Joi.string().valid('welfare','salary','abuse','accommodation','general').default('general')
});
const replySchema = Joi.object({
  reply:  Joi.string().min(5).required(),
  status: Joi.string().valid('under_review','resolved','closed').default('under_review')
});

/**
 * @swagger
 * tags:
 *   name: Complaints
 *   description: Submit and manage complaints
 */

/**
 * @swagger
 * /api/complaints:
 *   post:
 *     summary: Submit a complaint — any logged-in user (Scenario vi)
 *     tags: [Complaints]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [subject, description]
 *             properties:
 *               subject:     { type: string, example: "Unpaid wages for 3 months" }
 *               description: { type: string, example: "My employer has not paid my salary..." }
 *               category:    { type: string, enum: [welfare, salary, abuse, accommodation, general] }
 *     responses:
 *       201:
 *         description: Complaint submitted
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const { error, value } = complaintSchema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const result = await db.run(
      'INSERT INTO complaints (complainant_nid,subject,description,category) VALUES (?,?,?,?)',
      [req.user.nid, value.subject, value.description, value.category]
    );
    res.status(201).json({
      success: true,
      message: 'Complaint submitted. A bureau officer will review it shortly.',
      data: { id: result.lastInsertRowid, complainant_nid: req.user.nid, subject: value.subject, category: value.category, status: 'pending', created_at: new Date().toISOString() }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * @swagger
 * /api/complaints:
 *   get:
 *     summary: List all complaints — officer only (Scenario vi)
 *     tags: [Complaints]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: status,   schema: { type: string, enum: [pending, under_review, resolved, closed] } }
 *       - { in: query, name: category, schema: { type: string } }
 *       - { in: query, name: page,     schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit,    schema: { type: integer, default: 10 } }
 *     responses:
 *       200:
 *         description: Paginated list of complaints
 */
router.get('/', authenticate, authorize('officer'), async (req, res) => {
  try {
    const { status, category, page=1, limit=10 } = req.query;
    const pg = Math.max(1, parseInt(page));
    const lm = Math.min(50, parseInt(limit));
    const offset = (pg - 1) * lm;

    let where = 'WHERE 1=1'; const params = [];
    if (status)   { where += ' AND c.status = ?';   params.push(status); }
    if (category) { where += ' AND c.category = ?'; params.push(category); }

    const countRow = await db.get(`SELECT COUNT(*) as cnt FROM complaints c ${where}`, params);
    const total = countRow?.cnt || 0;
    const complaints = await db.all(
      `SELECT c.*, u.name as complainant_name FROM complaints c JOIN users u ON c.complainant_nid = u.nid ${where} ORDER BY c.created_at DESC LIMIT ? OFFSET ?`,
      [...params, lm, offset]
    );
    res.json({ success: true, data: complaints, pagination: { page: pg, limit: lm, total, pages: Math.ceil(total/lm) } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * @swagger
 * /api/complaints/mine:
 *   get:
 *     summary: Get my own complaints — citizen
 *     tags: [Complaints]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of own complaints
 */
router.get('/mine', authenticate, async (req, res) => {
  try {
    const complaints = await db.all('SELECT * FROM complaints WHERE complainant_nid = ? ORDER BY created_at DESC', [req.user.nid]);
    res.json({ success: true, total: complaints.length, data: complaints });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * @swagger
 * /api/complaints/{id}:
 *   get:
 *     summary: Get a single complaint — officer or the complainant
 *     tags: [Complaints]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Complaint detail
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const complaint = await db.get('SELECT * FROM complaints WHERE id = ?', [req.params.id]);
    if (!complaint) return res.status(404).json({ success: false, error: 'Complaint not found.' });
    if (req.user.role !== 'officer' && complaint.complainant_nid !== req.user.nid)
      return res.status(403).json({ success: false, error: 'Access denied.' });
    res.json({ success: true, data: complaint });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * @swagger
 * /api/complaints/{id}/reply:
 *   put:
 *     summary: Officer replies to a complaint and updates status (Scenario vi)
 *     tags: [Complaints]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reply]
 *             properties:
 *               reply:  { type: string, example: "We have contacted your employer." }
 *               status: { type: string, enum: [under_review, resolved, closed] }
 *     responses:
 *       200:
 *         description: Reply sent
 */
router.put('/:id/reply', authenticate, authorize('officer'), async (req, res) => {
  try {
    const { error, value } = replySchema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });
    const complaint = await db.get('SELECT * FROM complaints WHERE id = ?', [req.params.id]);
    if (!complaint) return res.status(404).json({ success: false, error: 'Complaint not found.' });
    await db.run(
      "UPDATE complaints SET officer_reply=?,officer_nid=?,status=?,replied_at=datetime('now'),updated_at=datetime('now') WHERE id=?",
      [value.reply, req.user.nid, value.status, req.params.id]
    );
    const updated = await db.get('SELECT * FROM complaints WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Reply sent successfully.', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
