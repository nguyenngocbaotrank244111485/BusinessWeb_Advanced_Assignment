const { getDb } = require('../config/db');

/**
 * IMPORTANT: Customer login must set req.session.userId to the users._id
 * (string). Adapt ONLY that mapping if your existing login uses a different
 * session shape. Do not trust a userId from the request body or localStorage.
 */
async function requireSurveyCustomer(req, res, next) {
  try {
    const userId = req.session?.userId;
    if (typeof userId !== 'string' || !userId.trim()) {
      return res.status(401).json({ code: 'LOGIN_REQUIRED' });
    }
    const user = await getDb().collection('users').findOne(
      { _id: userId },
      { projection: { role: 1, status: 1 } }
    );
    if (!user || user.role !== 'CUSTOMER' || user.status !== 'ACTIVE') {
      return res.status(403).json({ code: 'CUSTOMER_REQUIRED' });
    }
    req.surveyUserId = userId;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { requireSurveyCustomer };