/**
 * Role-based access control middleware factory.
 * Usage: authorize('officer')  or  authorize('officer', 'company')
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Access denied. This endpoint requires role: ${roles.join(' or ')}.`
      });
    }
    next();
  };
};

module.exports = { authorize };
