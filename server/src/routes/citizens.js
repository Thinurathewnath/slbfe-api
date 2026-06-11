const express = require('express');
const bcrypt  = require('bcryptjs');
const Joi     = require('joi');
const db      = require('../database');
const { authenticate, generateToken } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');

const router = express.Router();

// ─── Validation Schemas ───────────────────────────────────────────────────────

const contactSchema = Joi.object({
  name:         Joi.string().max(100).required(),
  relationship: Joi.string().max(50).required(),
  phone:        Joi.string().max(20).required(),
  email:        Joi.string().email().allow('').optional(),
  address:      Joi.string().max(200).allow('').optional()
});

const registerSchema = Joi.object({
  nid:         Joi.string().min(9).max(12).required(),
  name:        Joi.string().min(2).max(100).required(),
  age:         Joi.number().integer().min(18).max(100).required(),
  address:     Joi.string().min(5).required(),
  latitude:    Joi.number().min(-90).max(90).optional(),
  longitude:   Joi.number().min(-180).max(180).optional(),
  profession:  Joi.string().max(100).optional(),
  email:       Joi.string().email().required(),
  role:        Joi.string().valid('citizen', 'officer', 'company').default('citizen'),
  affiliation: Joi.string().max(200).optional(),
  password:    Joi.string().min(8).required(),
  contacts:    Joi.array().items(contactSchema).optional()
});

const updateSchema = Joi.object({
  name:           Joi.string().min(2).max(100).optional(),
  age:            Joi.number().integer().min(18).max(100).optional(),
  address:        Joi.string().min(5).optional(),
  latitude:       Joi.number().min(-90).max(90).optional(),
  longitude:      Joi.number().min(-180).max(180).optional(),
  profession:     Joi.string().max(100).optional(),
  affiliation:    Joi.string().max(200).optional(),
  is_verified:    Joi.boolean().optional(),
  qualifications: Joi.array().items(Joi.object({
    degree:      Joi.string().required(),
    institution: Joi.string().required(),
    field:       Joi.string().required(),
    year:        Joi.number().integer().min(1950).max(2030).required()
  })).optional(),
  contacts: Joi.array().items(contactSchema).optional()
}).min(1);

function safeUser(u) {
  const out = { ...u };
  delete out.password_hash;
  out.is_verified = out.is_verified === 1;
  out.is_active   = out.is_active   === 1;
  return out;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * @swagger
 * tags:
 *   name: Citizens
 *   description: Citizen registration and management
 */

/**
 * @swagger
 * /api/citizens:
 *   post:
 *     summary: Register a new citizen, bureau officer, or company user (Scenario i)
 *     tags: [Citizens]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nid, name, age, address, email, password]
 *             properties:
 *               nid:         { type: string, example: "200012345678" }
 *               name:        { type: string, example: "Kamal Perera" }
 *               age:         { type: integer, example: 28 }
 *               address:     { type: string, example: "123 Galle Rd, Colombo" }
 *               latitude:    { type: number, example: 6.9271 }
 *               longitude:   { type: number, example: 79.8612 }
 *               profession:  { type: string, example: "Software Engineer" }
 *               email:       { type: string, example: "kamal@example.com" }
 *               role:        { type: string, enum: [citizen, officer, company] }
 *               affiliation: { type: string, example: "ABC Company" }
 *               password:    { type: string, example: "SecurePass@1" }
 *     responses:
 *       201:
 *         description: Registration successful — returns JWT token
 *       400:
 *         description: Validation error
 *       409:
 *         description: NID or email already registered
 */
router.post('/', async (req, res) => {
  try {
    const { error, value } = registerSchema.validate(req.body, { abortEarly: false });
    if (error) return res.status(400).json({ success: false, error: 'Validation failed.', details: error.details.map(d=>d.message) });

    const existing = await db.get('SELECT nid FROM users WHERE nid = ? OR email = ?', [value.nid, value.email]);
    if (existing) return res.status(409).json({ success: false, error: 'A user with this NID or email is already registered.' });

    const password_hash = await bcrypt.hash(value.password, 12);

    await db.transaction(async () => {
      await db.run(
        `INSERT INTO users (nid,name,age,address,latitude,longitude,profession,email,role,affiliation,password_hash)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [value.nid, value.name, value.age, value.address,
         value.latitude??null, value.longitude??null, value.profession??null,
         value.email, value.role, value.affiliation??null, password_hash]
      );
      if (value.contacts) {
        for (const c of value.contacts) {
          await db.run(
            'INSERT INTO contacts (nid,name,relationship,phone,email,address) VALUES (?,?,?,?,?,?)',
            [value.nid, c.name, c.relationship, c.phone, c.email??null, c.address??null]
          );
        }
      }
    })();

    const token = generateToken({ nid: value.nid, role: value.role });
    res.status(201).json({
      success: true,
      message: 'Registration successful. Welcome to SLBFE!',
      data: { nid: value.nid, name: value.name, email: value.email, role: value.role, token, expires_in: '24h' }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Registration failed.', detail: err.message });
  }
});

/**
 * @swagger
 * /api/citizens/search:
 *   get:
 *     summary: Find candidates by qualifications (Scenario iv) — company or officer
 *     tags: [Citizens]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: field,       schema: { type: string }, description: "Field of study" }
 *       - { in: query, name: degree,      schema: { type: string }, description: "Degree type" }
 *       - { in: query, name: institution, schema: { type: string }, description: "Institution name" }
 *       - { in: query, name: profession,  schema: { type: string }, description: "Profession keyword" }
 *       - { in: query, name: page,        schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit,       schema: { type: integer, default: 10 } }
 *     responses:
 *       200:
 *         description: Paginated list of matching candidates
 */
router.get('/search', authenticate, authorize('officer', 'company'), async (req, res) => {
  try {
    const { field, degree, institution, profession, page=1, limit=10 } = req.query;
    const pg = Math.max(1, parseInt(page));
    const lm = Math.min(50, Math.max(1, parseInt(limit)));
    const offset = (pg - 1) * lm;

    let where = `WHERE u.is_active = 1 AND u.role = 'citizen'`;
    const params = [];

    if (field || degree || institution) {
      let sub = 'SELECT DISTINCT nid FROM qualifications WHERE 1=1';
      if (field)       { sub += ' AND field LIKE ?';       params.push(`%${field}%`); }
      if (degree)      { sub += ' AND degree LIKE ?';      params.push(`%${degree}%`); }
      if (institution) { sub += ' AND institution LIKE ?'; params.push(`%${institution}%`); }
      where += ` AND u.nid IN (${sub})`;
    }
    if (profession) { where += ` AND u.profession LIKE ?`; params.push(`%${profession}%`); }

    const countRow = await db.get(`SELECT COUNT(*) as cnt FROM users u ${where}`, params);
    const total = countRow?.cnt || 0;

    const citizens = await db.all(
      `SELECT u.nid, u.name, u.age, u.profession, u.email, u.affiliation, u.is_verified
       FROM users u ${where} ORDER BY u.name LIMIT ? OFFSET ?`,
      [...params, lm, offset]
    );

    const result = await Promise.all(citizens.map(async c => ({
      ...c,
      is_verified: c.is_verified === 1,
      qualifications: await db.all('SELECT degree, institution, field, year FROM qualifications WHERE nid = ?', [c.nid])
    })));

    res.json({ success: true, data: result, pagination: { page: pg, limit: lm, total, pages: Math.ceil(total/lm) } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * @swagger
 * /api/citizens/{nid}:
 *   get:
 *     summary: Get full citizen profile by NID (Scenario iii) — officer only
 *     tags: [Citizens]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: nid, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Full citizen profile with qualifications, documents, contacts, location
 *       403:
 *         description: Officer access required
 *       404:
 *         description: Citizen not found
 */
router.get('/:nid', authenticate, authorize('officer'), async (req, res) => {
  try {
    const { nid } = req.params;
    const citizen = await db.get('SELECT * FROM users WHERE nid = ?', [nid]);
    if (!citizen) return res.status(404).json({ success: false, error: 'Citizen not found.' });

    const out = safeUser(citizen);
    [out.qualifications, out.documents, out.contacts] = await Promise.all([
      db.all('SELECT * FROM qualifications WHERE nid = ?', [nid]),
      db.all('SELECT id,type,original_name,file_size,mime_type,is_verified,verified_by,verified_at,uploaded_at FROM documents WHERE nid = ?', [nid]),
      db.all('SELECT * FROM contacts WHERE nid = ?', [nid])
    ]);
    out.documents = out.documents.map(d => ({ ...d, is_verified: d.is_verified === 1 }));
    out.current_location = await db.get('SELECT * FROM locations WHERE nid = ? ORDER BY updated_at DESC LIMIT 1', [nid]) || null;
    res.json({ success: true, data: out });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * @swagger
 * /api/citizens/{nid}:
 *   put:
 *     summary: Update qualifications/profile (Scenario ii) — citizen self; or verify (Scenario iii) — officer
 *     tags: [Citizens]
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
 *             properties:
 *               name:           { type: string }
 *               age:            { type: integer }
 *               address:        { type: string }
 *               profession:     { type: string }
 *               is_verified:    { type: boolean, description: "Officer only — verify citizen" }
 *               qualifications:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     degree:      { type: string }
 *                     institution: { type: string }
 *                     field:       { type: string }
 *                     year:        { type: integer }
 *     responses:
 *       200:
 *         description: Profile updated successfully
 */
router.put('/:nid', authenticate, async (req, res) => {
  try {
    const { nid } = req.params;
    const isSelf    = req.user.nid === nid;
    const isOfficer = req.user.role === 'officer';
    if (!isSelf && !isOfficer) return res.status(403).json({ success: false, error: 'Access denied.' });

    const { error, value } = updateSchema.validate(req.body, { abortEarly: false });
    if (error) return res.status(400).json({ success: false, error: 'Validation failed.', details: error.details.map(d=>d.message) });

    if (!isOfficer && value.is_verified !== undefined)
      return res.status(403).json({ success: false, error: 'Only bureau officers can verify citizens.' });

    const citizen = await db.get('SELECT nid FROM users WHERE nid = ?', [nid]);
    if (!citizen) return res.status(404).json({ success: false, error: 'Citizen not found.' });

    await db.transaction(async () => {
      const cols = []; const vals = [];
      const scalars = ['name','age','address','latitude','longitude','profession','affiliation'];
      for (const f of scalars) { if (value[f] !== undefined) { cols.push(`${f} = ?`); vals.push(value[f]); } }
      if (isOfficer && value.is_verified !== undefined) { cols.push('is_verified = ?'); vals.push(value.is_verified ? 1 : 0); }
      cols.push("updated_at = datetime('now')");
      vals.push(nid);
      await db.run(`UPDATE users SET ${cols.join(', ')} WHERE nid = ?`, vals);

      if (value.qualifications) {
        await db.run('DELETE FROM qualifications WHERE nid = ?', [nid]);
        for (const q of value.qualifications) {
          await db.run('INSERT INTO qualifications (nid,degree,institution,field,year) VALUES (?,?,?,?,?)', [nid,q.degree,q.institution,q.field,q.year]);
        }
      }
      if (value.contacts) {
        await db.run('DELETE FROM contacts WHERE nid = ?', [nid]);
        for (const c of value.contacts) {
          await db.run('INSERT INTO contacts (nid,name,relationship,phone,email,address) VALUES (?,?,?,?,?,?)', [nid,c.name,c.relationship,c.phone,c.email??null,c.address??null]);
        }
      }
    })();

    const updated = safeUser(await db.get('SELECT * FROM users WHERE nid = ?', [nid]));
    updated.qualifications = await db.all('SELECT * FROM qualifications WHERE nid = ?', [nid]);
    res.json({ success: true, message: 'Profile updated successfully.', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * @swagger
 * /api/citizens/{nid}:
 *   delete:
 *     summary: Deactivate (soft-delete) a citizen account — officer only
 *     tags: [Citizens]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: nid, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Account deactivated
 */
router.delete('/:nid', authenticate, authorize('officer'), async (req, res) => {
  try {
    const { nid } = req.params;
    const citizen = await db.get('SELECT nid, name FROM users WHERE nid = ? AND is_active = 1', [nid]);
    if (!citizen) return res.status(404).json({ success: false, error: 'Citizen not found or already deactivated.' });
    await db.run("UPDATE users SET is_active = 0, updated_at = datetime('now') WHERE nid = ?", [nid]);
    res.json({ success: true, message: `Account for ${citizen.name} (NID: ${nid}) has been deactivated.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * @swagger
 * /api/citizens/{nid}/contacts:
 *   get:
 *     summary: Get emergency/family contacts of a citizen — officer only
 *     tags: [Citizens]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: nid, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: List of contacts
 */
router.get('/:nid/contacts', authenticate, authorize('officer'), async (req, res) => {
  try {
    const { nid } = req.params;
    const citizen = await db.get('SELECT nid, name FROM users WHERE nid = ? AND is_active = 1', [nid]);
    if (!citizen) return res.status(404).json({ success: false, error: 'Citizen not found.' });
    const contacts = await db.all('SELECT * FROM contacts WHERE nid = ?', [nid]);
    res.json({ success: true, data: { citizen_nid: nid, citizen_name: citizen.name, total: contacts.length, contacts } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
