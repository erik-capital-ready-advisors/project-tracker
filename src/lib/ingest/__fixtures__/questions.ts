/** One line per shape the fleet has actually emitted. No client detail. */
export const QUESTION_FILES = [
  {
    name: "questions-zz01.jsonl",
    text: [
      `{"unit":"i2","section":"6.1","question":"Turn public signup off?","best_guess":"Yes","confidence":"high"}`,
      `{"unit":"i2","section":"6.2","question":"Spend ceiling?","best_guess":"$40","confidence":"med"}`,
    ].join("\n"),
  },
  {
    name: "questions-zz02.jsonl",
    text: `{"assumption_made":"Treated as standalone","blocking":false,"question":"Combine account types?","unit":"i4"}`,
  },
  {
    name: "questions-u2-zz01.jsonl",
    text:
      `{"unit":"u2","section":"7a","question":"Soft delete or hard?","best_guess":"Soft",` +
      `"confidence":"high","status":"answered","answer":"Soft delete","answered_by":"erik",` +
      `"answered_on":"2026-08-06"}`,
  },
  {
    name: "questions-i4-zz01.jsonl",
    text: `{"unit":"i4","question":"Threshold?","best_guess":"0.90","blocking":true,"run_id":"zz01","ts":"2026-08-06T14:00:00Z"}`,
  },
];
