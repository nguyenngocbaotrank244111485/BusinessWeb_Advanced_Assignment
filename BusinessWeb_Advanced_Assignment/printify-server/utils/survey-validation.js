const VALID_DIMENSIONS = new Set(['PU', 'EOU', 'SAT', 'PI']);

function validateQuestions(questions) {
  if (!Array.isArray(questions) || questions.length === 0) return false;
  const ids = new Set();
  const orderIndexes = new Set();
  for (const q of questions) {
    if (!q || typeof q._id !== 'string' || !q._id || ids.has(q._id) ||
        !VALID_DIMENSIONS.has(q.dimension) ||
        q.scaleType !== 'LIKERT_5' ||
        !Number.isInteger(q.orderIndex) || orderIndexes.has(q.orderIndex) ||
        typeof q.text !== 'string' || !q.text.trim() ||
        q.isActive !== true) {
      return false;
    }
    ids.add(q._id);
    orderIndexes.add(q.orderIndex);
  }
  return true;
}

/** Return null if valid, or a stable 422 validation code. */
function validateSubmission(body, questions) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'INVALID_SURVEY_DATA';
  }
  const { answers, comment = '' } = body;
  if (!Array.isArray(answers) || answers.length !== questions.length ||
      typeof comment !== 'string' || comment.length > 500) {
    return 'INVALID_SURVEY_DATA';
  }
  const expectedIds = new Set(questions.map(q => q._id));
  const seen = new Set();
  for (const item of answers) {
    if (!item || typeof item !== 'object' ||
        typeof item.questionId !== 'string' ||
        !expectedIds.has(item.questionId) || seen.has(item.questionId) ||
        !Number.isInteger(item.score) || item.score < 1 || item.score > 5) {
      return 'INVALID_ANSWER';
    }
    seen.add(item.questionId);
  }
  return null;
}

module.exports = { validateQuestions, validateSubmission };