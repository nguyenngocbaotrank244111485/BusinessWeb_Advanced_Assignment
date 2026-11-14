const test = require('node:test');
const assert = require('node:assert/strict');
const { getSurveyEligibility } = require('../utils/survey-eligibility');

function mockDatabase({ designs = [], orders = [], responses = [] } = {}) {
  const all = { designs, orders, surveyResponses: responses };
  return {
    collection(name) {
      return {
        async findOne(filter) {
          return all[name].find(doc => Object.entries(filter)
            .every(([key, value]) => doc[key] === value)) || null;
        }
      };
    }
  };
}

test('A saved design alone is eligible', async () => {
  const db = mockDatabase({ designs: [{ _id: 'd01', userId: 'u01' }] });
  assert.deepEqual(await getSurveyEligibility(db, 'u01'), {
    eligible: true, hasResponded: false, canSubmit: true
  });
});
test('COMPLETED order alone is eligible', async () => {
  const db = mockDatabase({ orders: [{ userId: 'u01', orderStatus: 'COMPLETED' }] });
  assert.equal((await getSurveyEligibility(db, 'u01')).canSubmit, true);
});
test('SHIPPING or CANCELLED order does NOT count', async () => {
  const db = mockDatabase({ orders: [
    { userId: 'u01', orderStatus: 'SHIPPING' },
    { userId: 'u01', orderStatus: 'CANCELLED' }
  ] });
  assert.equal((await getSurveyEligibility(db, 'u01')).eligible, false);
});
test('A design grants eligibility even when only order is SHIPPING', async () => {
  const db = mockDatabase({
    designs: [{ userId: 'u01' }],
    orders: [{ userId: 'u01', orderStatus: 'SHIPPING' }]
  });
  assert.equal((await getSurveyEligibility(db, 'u01')).canSubmit, true);
});
test('Previously responded customer cannot send again', async () => {
  const db = mockDatabase({
    designs: [{ userId: 'u01' }],
    responses: [{ userId: 'u01' }]
  });
  assert.deepEqual(await getSurveyEligibility(db, 'u01'), {
    eligible: true, hasResponded: true, canSubmit: false
  });
});

