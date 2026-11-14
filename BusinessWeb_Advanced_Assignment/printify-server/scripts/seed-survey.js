require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { connectDb, getDb } = require('../config/db');
const { validateQuestions } = require('../utils/survey-validation');

async function main() {
  await connectDb();
  const file = path.join(__dirname, '../seeds/surveyQuestion.json');
  const questions = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (questions.length !== 20 || !validateQuestions(questions)) {
    throw new Error('Seed must contain exactly 20 valid TAM Likert-5 questions');
  }
  // Do NOT drop the collection: old surveyResponse snapshots must survive.
  await getDb().collection('surveyQuestions').bulkWrite(
    questions.map(({ _id, ...fields }) => ({
      updateOne: {
        filter: { _id },
        update: { $set: fields },
        upsert: true
      }
    }))
  );
  await getDb().collection('surveyResponses').createIndex(
    { userId: 1 }, { unique: true }
  );
  console.log(`Đã nạp/cập nhật ${questions.length} câu hỏi PrintiFy TAM.`);
  console.log('Đã bảo đảm unique index cho surveyResponses.userId.');
}

main().then(() => process.exit(0)).catch(error => {
  console.error(error);
  process.exit(1);
});