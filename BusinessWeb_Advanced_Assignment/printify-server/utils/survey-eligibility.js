/** Business rule C23: a saved Mongo design OR a COMPLETED order. */
async function getSurveyEligibility(db, userId) {
  const [design, completedOrder, previousResponse] = await Promise.all([
    db.collection('designs').findOne({ userId }, { projection: { _id: 1 } }),
    db.collection('orders').findOne(
      { userId, orderStatus: 'COMPLETED' },
      { projection: { _id: 1 } }
    ),
    db.collection('surveyResponses').findOne(
      { userId }, { projection: { _id: 1 } }
    )
  ]);
  const eligible = Boolean(design || completedOrder);
  const hasResponded = Boolean(previousResponse);
  return { eligible, hasResponded, canSubmit: eligible && !hasResponded };
}
module.exports = { getSurveyEligibility };