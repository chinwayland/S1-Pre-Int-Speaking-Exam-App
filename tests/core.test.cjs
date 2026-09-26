"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateTotal, shuffledQuestions, csvExport, validateBackup } = require("../core.js");

const criteria = [
  { id: "fluency", label: "Fluency", weight: 20 },
  { id: "pronunciation", label: "Pronunciation", weight: 15 },
  { id: "contribution", label: "Contribution", weight: 40 },
  { id: "accuracy", label: "Accuracy", weight: 25 }
];
const content = { criteria };
const allThrees = { fluency: 3, pronunciation: 3, contribution: 3, accuracy: 3 };
function record(overrides = {}) {
  return {
    id: "record-1", session: "Semester 1", studentId: "001", studentName: "Li Ming", className: "A",
    date: "2026-09-26T12:00:00.000Z", status: "graded", durationSeconds: 240,
    scores: { ...allThrees, fluency: 2 }, total: 0, notes: "",
    questions: [{ part: "Part 1", prompt: "Are you quiet or talkative?", followUp: "Tell me about a time with your friends." }],
    ...overrides
  };
}
const backup = (records) => ({ schemaVersion: 1, records });

test("retains legacy weights and rounds only the final weighted total", () => {
  assert.equal(calculateTotal(record().scores, criteria), 93.3);
  assert.equal(calculateTotal(allThrees, criteria), 100);
  assert.equal(calculateTotal({ fluency: 1, pronunciation: 1, contribution: 1, accuracy: 1 }, criteria), 33.3);
});

test("true zero is a valid score but missing and blank marks are incomplete", () => {
  assert.equal(calculateTotal({ fluency: 0, pronunciation: 0, contribution: 0, accuracy: 0 }, criteria), 0);
  for (const blank of ["", null, undefined]) {
    assert.equal(calculateTotal({ ...allThrees, fluency: blank }, criteria), null);
  }
  assert.equal(calculateTotal({ pronunciation: 3, contribution: 3, accuracy: 3 }, criteria), null);
  assert.equal(calculateTotal(null, criteria), null);
});

test("rejects invalid bands, noninteger scores, and invalid weights", () => {
  for (const invalid of [-1, 4, 1.5, "3", NaN, Infinity, true]) {
    assert.equal(calculateTotal({ ...allThrees, accuracy: invalid }, criteria), null);
  }
  assert.equal(calculateTotal(allThrees, criteria.map((criterion) => ({ ...criterion, weight: 1 }))), null);
  assert.equal(calculateTotal(allThrees, []), null);
  assert.equal(calculateTotal(allThrees, [criteria[0], criteria[0], { id: "accuracy", weight: 60 }]), null);
});

test("shuffle contains each question once, uses every part, and leaves input intact", () => {
  const parts = [
    { id: "personality", questions: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }] },
    { id: "past", questions: [{ id: "e" }] }
  ];
  const original = JSON.stringify(parts);
  const result = shuffledQuestions(parts, () => 0);
  assert.deepEqual(result.personality, ["b", "c", "d", "a"]);
  assert.deepEqual([...result.personality].sort(), ["a", "b", "c", "d"]);
  assert.deepEqual(result.past, ["e"]);
  assert.equal(JSON.stringify(parts), original);
  assert.throws(() => shuffledQuestions(parts, () => 1));
  assert.throws(() => shuffledQuestions([{ id: "__proto__", questions: [] }]));
});

test("CSV has BOM, quotes and escapes cells, retains IDs and recalculates totals", () => {
  const csv = csvExport([record({ studentName: 'Li, "Ming"', notes: "First line\nSecond line", total: 5 })], criteria);
  assert.ok(csv.startsWith('\uFEFF"Exam session","Content version","Student ID","Student name"'));
  assert.ok(csv.includes('"\'001","Li, ""Ming"""'));
  assert.ok(csv.includes('"93.3","First line\nSecond line"'));
  assert.ok(csv.includes("Part 1: Are you quiet or talkative? | Follow-up: Tell me about a time with your friends."));
  assert.ok(csv.endsWith("\r\n"));
});

test("CSV neutralizes formula-like text, including leading whitespace", () => {
  for (const value of ["=1+1", "+SUM(A1)", "-2+3", "@SUM(A1)", "  =1+1", "\tvalue", "\rvalue", "\nvalue"]) {
    const csv = csvExport([record({ session: value, studentId: value, studentName: value, className: value, notes: value })], criteria);
    assert.ok(csv.includes('"\'' + value + '"'), JSON.stringify(value));
  }
});

test("absent CSV marks and total are blank, never a graded zero", () => {
  const csv = csvExport([record({ status: "absent", scores: {}, total: 0, questions: [] })], criteria);
  assert.ok(csv.includes('"absent","240","","","","","","",""'));
});

test("valid backup is copied and totals are recomputed", () => {
  const source = record({ total: "incorrect" });
  const result = validateBackup(backup([source]), content);
  assert.equal(result[0].total, 93.3);
  assert.notEqual(result[0], source);
  assert.notEqual(result[0].scores, source.scores);
  assert.notEqual(result[0].questions[0], source.questions[0]);
  assert.equal(source.total, "incorrect");
  assert.deepEqual(validateBackup(backup([]), content), []);
});

test("absent backup accepts blank scores and normalizes its total to null", () => {
  const result = validateBackup(backup([record({ status: "absent", scores: { fluency: null }, total: 100, questions: [] })]), content);
  assert.equal(result[0].total, null);
  assert.deepEqual(result[0].scores, { fluency: "", pronunciation: "", contribution: "", accuracy: "" });
  assert.throws(() => validateBackup(backup([record({ status: "absent" })]), content));
});

test("backup rejects unsupported schema, duplicate IDs, and excessive arrays", () => {
  for (const input of [null, [], {}, { schemaVersion: 2, records: [] }, { schemaVersion: 1, records: {} },
    { schemaVersion: 1, records: [], extra: true }]) assert.throws(() => validateBackup(input, content));
  assert.throws(() => validateBackup(backup([record(), record()]), content));
  assert.throws(() => validateBackup(backup(Array(10001).fill(record())), content));
  assert.throws(() => validateBackup(backup([record({ questions: Array(101).fill(record().questions[0]) })]), content));
});

test("backup rejects malformed records and preserves valid zero scores", () => {
  const malformed = [
    { id: "" }, { id: 1 }, { session: null }, { studentName: 5 }, { className: [] }, { status: "pending" },
    { date: "yesterday" }, { date: "2026-02-30" }, { durationSeconds: -1 }, { durationSeconds: Infinity },
    { durationSeconds: "240" }, { scores: {} }, { scores: { ...allThrees, fluency: "3" } },
    { scores: { ...allThrees, accuracy: 4 } }, { questions: ["question"] },
    { questions: [{ part: "Part 1", prompt: "Question" }] }, { notes: "x".repeat(10001) }
  ];
  for (const change of malformed) assert.throws(() => validateBackup(backup([record(change)]), content), JSON.stringify(change));
  const zeros = { fluency: 0, pronunciation: 0, contribution: 0, accuracy: 0 };
  assert.equal(validateBackup(backup([record({ scores: zeros })]), content)[0].total, 0);
});

test("backup rejects prototype-related fields and never changes object prototypes", () => {
  const malicious = JSON.parse(JSON.stringify(backup([record()])).replace('"scores":{', '"scores":{"__proto__":{"polluted":true},'));
  assert.throws(() => validateBackup(malicious, content));
  assert.throws(() => validateBackup(backup([record({ constructor: "bad" })]), content));
  assert.equal({}.polluted, undefined);
});

test("record content version is preserved, defaults safely, and is exported", () => {
  const imported = validateBackup(backup([record({ contentVersion: "1.5" })]), { ...content, version: "2.0" });
  assert.equal(imported[0].contentVersion, "1.5");
  assert.ok(csvExport(imported, criteria).includes('"Semester 1","1.5","\'001"'));
  assert.equal(validateBackup(backup([record()]), { ...content, version: "2.1" })[0].contentVersion, "2.1");
  assert.equal(validateBackup(backup([record()]), content)[0].contentVersion, "2.0");
  for (const contentVersion of [null, 2, "", "x".repeat(101)]) {
    assert.throws(() => validateBackup(backup([record({ contentVersion })]), content));
  }
});

test("CSV preserves numeric student ID characters while keeping grades and duration numeric", () => {
  for (const studentId of ["001", "0", "123456789012345678901234567890"]) {
    const csv = csvExport([record({ studentId })], criteria);
    assert.ok(csv.includes('"\'' + studentId + '"'));
    assert.ok(csv.includes('"240","2","3","3","3","93.3"'));
  }
  assert.ok(csvExport([record({ studentId: "S001" })], criteria).includes('"S001"'));
});

test("real exam content has all four parts, twenty complete questions, and the original weights", () => {
  const realContent = require("../content.js");
  assert.equal(realContent.version, "2.0");
  assert.deepEqual(realContent.parts.map((part) => part.id), ["personality", "past", "present", "future"]);
  const allQuestionIds = [];
  for (const part of realContent.parts) {
    assert.equal(typeof part.name, "string");
    assert.ok(part.name.trim());
    assert.equal(part.questions.length, 5);
    assert.deepEqual(part.questions.map((question) => question.id), [1, 2, 3, 4, 5].map((number) => part.id + "-" + number));
    for (const question of part.questions) {
      allQuestionIds.push(question.id);
      for (const field of ["prompt", "followUp", "example"]) {
        assert.equal(typeof question[field], "string", question.id + "." + field);
        assert.ok(question[field].trim().length > 10, question.id + "." + field + " is complete");
      }
    }
  }
  assert.equal(new Set(allQuestionIds).size, 20);
  assert.deepEqual(realContent.criteria.map(({ id, weight }) => ({ id, weight })), criteria.map(({ id, weight }) => ({ id, weight })));
  for (const criterion of realContent.criteria) {
    assert.ok(criterion.label.trim());
    assert.equal(criterion.descriptors.length, 4);
    for (const descriptor of criterion.descriptors) {
      assert.equal(typeof descriptor, "string");
      assert.ok(descriptor.trim().length > 10);
    }
  }
  assert.equal(calculateTotal(record().scores, realContent.criteria), 93.3);
  assert.equal(validateBackup(backup([record()]), realContent)[0].contentVersion, "2.0");
});

test('roster metadata survives backups and appears separately from actual exam time in CSV', () => {
  const content=require('../content.js');
  const record={id:'roster-record',session:'S1',contentVersion:'2.0',studentId:'001',studentName:'Test Student',className:'Test Class',teacher:'Test Teacher',examDate:'2027-01-12',examTime:'09:05',date:'2027-01-12T01:06:00Z',status:'graded',durationSeconds:240,scores:{fluency:2,pronunciation:3,contribution:3,accuracy:3},total:0,notes:'',questions:[]};
  const api=require('../core.js');
  const restored=api.validateBackup({schemaVersion:1,records:[record]},content)[0];
  assert.equal(restored.teacher,'Test Teacher');assert.equal(restored.examDate,'2027-01-12');assert.equal(restored.examTime,'09:05');assert.equal(restored.total,93.3);
  const csv=api.csvExport([restored],content.criteria);assert.match(csv,/Scheduled exam date/);assert.match(csv,/"Test Teacher","2027-01-12","09:05","2027-01-12T01:06:00Z"/);
  assert.throws(()=>api.validateBackup({schemaVersion:1,records:[{...record,examTime:'25:00'}]},content));
  assert.throws(()=>api.validateBackup({schemaVersion:1,records:[{...record,teacher:''}]},content));
});
