const express = require('express');
const { randomUUID } = require('crypto');
const { getDb } = require('../config/db');
const { requireSurveyCustomer } = require('../middlewares/require-survey-customer');
const { validateQuestions, validateSubmission } = require('../utils/survey-validation');
const { getSurveyEligibility } = require('../utils/survey-eligibility');

const router = express.Router();

/** Minimal origin safeguard for cookie POSTs in this classroom example.
 * In production, ALSO use a proper CSRF token strategy and HTTPS.
 */
function checkOrigin(req, res, next) {
  const allowedOrigin = process.env.CUSTOMER_ORIGIN;
  const origin = req.get('origin');
  if (allowedOrigin && origin && origin !== allowedOrigin) {
    return res.status(403).json({ code: 'INVALID_ORIGIN' });
  }
  next();
}


router.use(requireSurveyCustomer);

// GET /api/survey/questions
router.get('/questions', async (req, res, next) => {
  try {
    const db = getDb();
    const questions = await db.collection('surveyQuestions')
      .find({ isActive: true }, {
        projection: {
          _id: 1, dimension: 1, text: 1,
          scaleType: 1, orderIndex: 1, isActive: 1
        }
      })
      .sort({ orderIndex: 1, _id: 1 })
      .toArray();
    const state = await getSurveyEligibility(db, req.surveyUserId);
    const reason = state.hasResponded
      ? 'ALREADY_RESPONDED'
      : !state.eligible
        ? 'NEED_DESIGN_OR_COMPLETED_ORDER'
        : questions.length === 0
          ? 'NO_ACTIVE_QUESTIONS' : null;
    res.json({
      questions,
      eligible: state.eligible,
      hasResponded: state.hasResponded,
      canSubmit: state.canSubmit && questions.length > 0,
      reason
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/survey/responses
router.post('/responses', checkOrigin, async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.surveyUserId;
    const state = await getSurveyEligibility(db, userId);
    if (state.hasResponded) {
      return res.status(409).json({ code: 'ALREADY_RESPONDED' });
    }
    if (!state.eligible) {
      return res.status(403).json({ code: 'NOT_ELIGIBLE' });
    }

    const questions = await db.collection('surveyQuestions')
      .find({ isActive: true })
      .sort({ orderIndex: 1, _id: 1 })
      .toArray();
    if (questions.length === 0) {
      return res.status(503).json({ code: 'NO_ACTIVE_QUESTIONS' });
    }
    if (!validateQuestions(questions)) {
      return res.status(500).json({ code: 'QUESTION_CONFIG_INVALID' });
    }
    const badRequestCode = validateSubmission(req.body, questions);
    if (badRequestCode) {
      return res.status(422).json({ code: badRequestCode });
    }

    const submittedAt = new Date();
    const scores = new Map(req.body.answers.map(a => [a.questionId, a.score]));
    await db.collection('surveyResponses').insertOne({
      _id: `sr_${randomUUID()}`,
      userId,
      answers: questions.map(q => ({
        questionId: q._id,
        questionText: q.text,
        dimension: q.dimension,
        score: scores.get(q._id)
      })),
      comment: (req.body.comment || '').trim(),
      submittedAt
    });

    return res.status(201).json({
      message: 'Cảm ơn bạn đã tham gia khảo sát PrintiFy!',
      submittedAt: submittedAt.toISOString()
    });
  } catch (error) {
    // Requires a UNIQUE index on surveyResponses.userId.
    // This also prevents double-click / simultaneous requests.
    if (error?.code === 11000) {
      return res.status(409).json({ code: 'ALREADY_RESPONDED' });
    }
    return next(error);
  }
});

module.exports = router;