const express  = require('express');
const bcrypt   = require('bcryptjs');
const Joi      = require('joi');
const db       = require('../database');
const { generateToken, authenticate } = require('../middleware/auth');

const router = express.Router();

const loginSchema = Joi.object({
  email:    Joi.string().email().required(),
  password: Joi.string().required()
});

/**
 * @swagger
 * tags:
 *   name: Authentication
 *   description: Login to obtain a JWT token
 */

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login and receive a JWT token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 example: officer@slbfe.gov.lk
 *               password:
 *                 type: string
 *                 example: Officer@1234
 *     responses:
 *       200:
 *         description: Login successful — returns JWT token and user info
 *       400:
 *         description: Validation error
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', async (req, res) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const user = await db.get('SELECT * FROM users WHERE email = ? AND is_active = 1', [value.email]);
    if (!user) return res.status(401).json({ success: false, error: 'Invalid email or password.' });

    const valid = await bcrypt.compare(value.password, user.password_hash);
    if (!valid) return res.status(401).json({ success: false, error: 'Invalid email or password.' });

    const token = generateToken(user);
    res.json({
      success: true,
      message: 'Login successful.',
      data: {
        token,
        expires_in: '24h',
        user: { nid: user.nid, name: user.name, email: user.email, role: user.role, is_verified: user.is_verified === 1 }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Login error.', detail: err.message });
  }
});

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get the currently authenticated user's profile
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user info
 *       401:
 *         description: Not authenticated
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await db.get(
      'SELECT nid, name, age, address, profession, email, role, affiliation, is_verified, created_at FROM users WHERE nid = ?',
      [req.user.nid]
    );
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });
    user.is_verified = user.is_verified === 1;
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
