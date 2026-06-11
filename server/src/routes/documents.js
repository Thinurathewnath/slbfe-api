const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const db      = require('../database');
const { authenticate } = require('../middleware/auth');
const { authorize }    = require('../middleware/roles');

const router = express.Router({ mergeParams: true });

// ─── Multer Storage ───────────────────────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, '../../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOADS_DIR, req.params.nid);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${file.fieldname}${ext}`);
  }
});

const ALLOWED_TYPES = ['application/pdf','image/jpeg','image/jpg','image/png'];

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    ALLOWED_TYPES.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Only PDF, JPG, and PNG files are allowed.'));
  }
});

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * @swagger
 * tags:
 *   name: Documents
 *   description: Upload and manage citizen documents
 */

/**
 * @swagger
 * /api/citizens/{nid}/documents:
 *   post:
 *     summary: Upload a document — citizen uploads own documents (Scenario ii)
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: nid, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file, type]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               type:
 *                 type: string
 *                 enum: [birth_cert, cv, passport, other]
 *     responses:
 *       201:
 *         description: Document uploaded successfully
 */
router.post('/', authenticate, (req, res, next) => {
  if (req.user.nid !== req.params.nid && req.user.role !== 'officer') {
    return res.status(403).json({ success: false, error: 'You can only upload documents for your own profile.' });
  }
  next();
}, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded.' });

    const docType = req.body.type;
    const allowed = ['birth_cert','cv','passport','other'];
    if (!allowed.includes(docType)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, error: `Document type must be one of: ${allowed.join(', ')}` });
    }

    const result = await db.run(
      'INSERT INTO documents (nid,type,original_name,file_path,file_size,mime_type) VALUES (?,?,?,?,?,?)',
      [req.params.nid, docType, req.file.originalname, req.file.path, req.file.size, req.file.mimetype]
    );

    res.status(201).json({
      success: true,
      message: 'Document uploaded successfully.',
      data: {
        id: result.lastInsertRowid, nid: req.params.nid,
        type: docType, original_name: req.file.originalname,
        file_size: req.file.size, mime_type: req.file.mimetype,
        is_verified: false, uploaded_at: new Date().toISOString()
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * @swagger
 * /api/citizens/{nid}/documents:
 *   get:
 *     summary: List all documents for a citizen — self or officer (Scenario iii)
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: nid, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: List of documents
 */
router.get('/', authenticate, async (req, res) => {
  try {
    if (req.user.nid !== req.params.nid && req.user.role !== 'officer') {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }
    const docs = await db.all(
      'SELECT id,type,original_name,file_size,mime_type,is_verified,verified_by,verified_at,uploaded_at FROM documents WHERE nid = ? ORDER BY uploaded_at DESC',
      [req.params.nid]
    );
    res.json({ success: true, total: docs.length, data: docs.map(d => ({ ...d, is_verified: d.is_verified === 1 })) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Standalone Document Verification Router ──────────────────────────────────

const docRouter = express.Router();

/**
 * @swagger
 * /api/documents/{id}/verify:
 *   put:
 *     summary: Verify or unverify a document — officer only (Scenario iii)
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               is_verified: { type: boolean }
 *     responses:
 *       200:
 *         description: Document verification updated
 */
docRouter.put('/:id/verify', authenticate, authorize('officer'), async (req, res) => {
  try {
    const { id } = req.params;
    const { is_verified } = req.body;
    const doc = await db.get('SELECT * FROM documents WHERE id = ?', [id]);
    if (!doc) return res.status(404).json({ success: false, error: 'Document not found.' });

    await db.run(
      "UPDATE documents SET is_verified = ?, verified_by = ?, verified_at = datetime('now') WHERE id = ?",
      [is_verified ? 1 : 0, req.user.nid, id]
    );
    res.json({ success: true, message: `Document ${is_verified ? 'verified' : 'unverified'} successfully.`, data: { id, is_verified: !!is_verified, verified_by: req.user.nid } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = { citizenDocRouter: router, docRouter };
