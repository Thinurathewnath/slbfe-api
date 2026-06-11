const jwt = require('jsonwebtoken');
const db  = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'slbfe-super-secret-key-change-in-production-2024';

/**
 * Middleware: verify Bearer JWT and attach req.user
 */
const authenticate = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Please provide a Bearer token in the Authorization header.'
    });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await db.get('SELECT nid, name, role, is_active FROM users WHERE nid = ?', [decoded.nid]);
    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, error: 'Account not found or has been deactivated.' });
    }
    req.user = { nid: user.nid, name: user.name, role: user.role };
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token. Please log in again.' });
  }
};

const generateToken = (user) => {
  return jwt.sign({ nid: user.nid, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
};

module.exports = { authenticate, generateToken, JWT_SECRET };
