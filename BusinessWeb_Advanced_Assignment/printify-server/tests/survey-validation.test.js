const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateQuestions, validateSubmission } = require('../utils/survey-validation');

const seed = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '../seeds/surveyQuestions.json'), 'utf8'
));
const validAnswers = seed.map(q => ({ questionId: q._id, score: 4 }));

test('20 questions and 4 TAM groups are configured correctly', () => {
  assert.equal(seed.length, 20);
  assert.equal(validateQuestions(seed), true);
  for (const dimension of ['PU', 'EOU', 'SAT', 'PI']) {
    assert.equal(seed.filter(q => q.dimension === dimension).length, 5);
  }
});
test('valid 20-answer request passes', () => {
  assert.equal(validateSubmission({ answers: validAnswers, comment: 'Tốt' }, seed), null);
});
test('missing answer fails', () => {
  assert.equal(validateSubmission({ answers: validAnswers.slice(1), comment: '' }, seed), 'INVALID_SURVEY_DATA');
});
test('duplicate question ID fails', () => {
  const bad = [...validAnswers];
  bad[1] = { ...bad[0] };
  assert.equal(validateSubmission({ answers: bad, comment: '' }, seed), 'INVALID_ANSWER');
});
test('out-of-range/string/noninteger scores fail', () => {
  for (const score of [0, 6, '5', 3.5]) {
    const bad = validAnswers.map((a, i) => i === 0 ? { ...a, score } : a);
    assert.equal(validateSubmission({ answers: bad, comment: '' }, seed), 'INVALID_ANSWER');
  }
});
test('comment max 500 characters', () => {
  assert.equal(validateSubmission({ answers: validAnswers, comment: 'a'.repeat(501) }, seed), 'INVALID_SURVEY_DATA');
});

