(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.EXAM_CORE = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const unsafeKeys = new Set(["__proto__", "prototype", "constructor"]);
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const plainObject = (value) => value !== null && typeof value === "object" &&
    !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));

  function validCriteria(criteria) {
    if (!Array.isArray(criteria) || criteria.length === 0 || criteria.length > 30) return false;
    const ids = new Set();
    let weight = 0;
    for (const criterion of criteria) {
      if (!plainObject(criterion) || typeof criterion.id !== "string" || !criterion.id ||
          unsafeKeys.has(criterion.id) || ids.has(criterion.id) ||
          typeof criterion.weight !== "number" || !Number.isFinite(criterion.weight) ||
          criterion.weight < 0) return false;
      ids.add(criterion.id);
      weight += criterion.weight;
    }
    return Math.abs(weight - 100) < 1e-8;
  }

  function calculateTotal(scores, criteria) {
    if (!plainObject(scores) || !validCriteria(criteria)) return null;
    let total = 0;
    for (const criterion of criteria) {
      if (!own(scores, criterion.id)) return null;
      const score = scores[criterion.id];
      if (!Number.isInteger(score) || score < 0 || score > 3) return null;
      total += score * criterion.weight / 3;
    }
    return Math.round((total + Number.EPSILON) * 10) / 10;
  }

  function shuffledQuestions(parts, rng = Math.random) {
    if (!Array.isArray(parts) || typeof rng !== "function") throw new Error("Invalid question bank.");
    const result = Object.create(null);
    for (const part of parts) {
      if (!plainObject(part) || typeof part.id !== "string" || !part.id ||
          unsafeKeys.has(part.id) || own(result, part.id) || !Array.isArray(part.questions)) {
        throw new Error("Invalid question bank part.");
      }
      const ids = part.questions.map((question) => {
        if (!plainObject(question) || typeof question.id !== "string" || !question.id || unsafeKeys.has(question.id)) {
          throw new Error("Invalid question ID.");
        }
        return question.id;
      });
      if (new Set(ids).size !== ids.length) throw new Error("Question IDs must be unique within a part.");
      for (let i = ids.length - 1; i > 0; i -= 1) {
        const value = rng();
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value >= 1) {
          throw new Error("Random values must be between 0 (inclusive) and 1 (exclusive).");
        }
        const j = Math.floor(value * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
      result[part.id] = ids;
    }
    return result;
  }

  function csvCell(value) {
    let string = value === null || value === undefined ? "" : String(value);
    // Quoting does not stop spreadsheet formulas. Prefix untrusted formula-like
    // strings with an apostrophe, including strings with leading whitespace.
    if (typeof value === "string" && (/^[\t\r\n]/.test(string) || /^[\s\u0000-\u0020]*[=+\-@]/.test(string))) {
      string = "'" + string;
    }
    return '"' + string.replace(/"/g, '""') + '"';
  }

  function csvExport(records, criteria) {
    if (!Array.isArray(records) || !validCriteria(criteria)) throw new Error("Invalid results or criteria.");
    const headers = ["Exam session", "Content version", "Student ID", "Student name", "Class", "Exam date", "Status", "Speaking time (seconds)",
      ...criteria.map((criterion) => criterion.label || criterion.id), "Total / 100", "Teacher note", "Questions shown"];
    const rows = records.map((record) => {
      const graded = record.status === "graded";
      const questions = (record.questions || []).map((question) =>
        question.part + ": " + question.prompt + (question.followUp ? " | Follow-up: " + question.followUp : "")
      ).join("\n");
      // Keep all-numeric IDs as text in spreadsheet programs, preserving leading
      // zeros and long IDs. Other CSV readers may display this text apostrophe.
      const studentId = typeof record.studentId === "string" && /^\d+$/.test(record.studentId) ? "'" + record.studentId : record.studentId;
      return [record.session, record.contentVersion || "2.0", studentId, record.studentName, record.className, record.date, record.status,
        record.durationSeconds, ...criteria.map((criterion) => graded ? record.scores?.[criterion.id] : ""),
        graded ? calculateTotal(record.scores, criteria) : "", record.notes, questions];
    });
    return "\uFEFF" + [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
  }

  function requireObject(value, allowed, label) {
    if (!plainObject(value)) throw new Error(label + " must be an object.");
    for (const key of Object.keys(value)) {
      if (unsafeKeys.has(key) || !allowed.includes(key)) throw new Error(label + " has an unsupported field: " + key);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor.get || descriptor.set) throw new Error(label + " must contain plain values.");
    }
  }

  function stringField(object, key, maxLength, label, required = false) {
    if (!own(object, key) || typeof object[key] !== "string" || object[key].length > maxLength ||
        (required && !object[key].trim())) {
      throw new Error(label + "." + key + " must be " + (required ? "a nonempty" : "a") + " string of at most " + maxLength + " characters.");
    }
    return object[key];
  }

  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
    const [year, month, day] = value.slice(0, 10).split("-").map(Number);
    const calendarDate = new Date(value.slice(0, 10) + "T00:00:00Z");
    return calendarDate.getUTCFullYear() === year && calendarDate.getUTCMonth() + 1 === month && calendarDate.getUTCDate() === day;
  }

  function validateBackup(data, content) {
    requireObject(data, ["schemaVersion", "records"], "Backup");
    if (data.schemaVersion !== 1) throw new Error("Unsupported backup version.");
    if (!Array.isArray(data.records) || data.records.length > 10000) throw new Error("Backup must contain at most 10,000 records.");
    const criteria = content?.criteria;
    if (!validCriteria(criteria)) throw new Error("Invalid grading criteria.");
    const criterionIds = criteria.map((criterion) => criterion.id);
    const ids = new Set();
    const recordFields = ["id", "session", "contentVersion", "studentId", "studentName", "className", "date", "status", "durationSeconds", "scores", "total", "notes", "questions"];
    return data.records.map((record, index) => {
      const label = "Record " + (index + 1);
      requireObject(record, recordFields, label);
      const id = stringField(record, "id", 200, label, true);
      if (unsafeKeys.has(id) || ids.has(id)) throw new Error("Record IDs must be unique and safe.");
      ids.add(id);
      const session = stringField(record, "session", 200, label);
      const contentVersion = own(record, "contentVersion")
        ? stringField(record, "contentVersion", 100, label, true)
        : (typeof content.version === "string" && content.version.trim() ? content.version : "2.0");
      const studentId = stringField(record, "studentId", 200, label);
      const studentName = stringField(record, "studentName", 200, label);
      const className = stringField(record, "className", 200, label);
      const date = stringField(record, "date", 100, label, true);
      if (!validDate(date)) throw new Error(label + " has an invalid date.");
      if (record.status !== "graded" && record.status !== "absent") throw new Error(label + " has an invalid status.");
      const status = record.status;
      if (typeof record.durationSeconds !== "number" || !Number.isFinite(record.durationSeconds) || record.durationSeconds < 0) {
        throw new Error(label + " duration must be a nonnegative finite number.");
      }
      const durationSeconds = record.durationSeconds;
      const notes = stringField(record, "notes", 10000, label);
      requireObject(record.scores, criterionIds, label + " scores");
      const scores = {};
      for (const criterion of criteria) {
        if (status === "graded") {
          if (!own(record.scores, criterion.id) || !Number.isInteger(record.scores[criterion.id]) ||
              record.scores[criterion.id] < 0 || record.scores[criterion.id] > 3) {
            throw new Error(label + " has an invalid score for " + criterion.id + ".");
          }
          scores[criterion.id] = record.scores[criterion.id];
        } else {
          if (own(record.scores, criterion.id) && record.scores[criterion.id] !== "" && record.scores[criterion.id] !== null) {
            throw new Error(label + " is absent and must have blank scores.");
          }
          scores[criterion.id] = "";
        }
      }
      if (!Array.isArray(record.questions) || record.questions.length > 100) throw new Error(label + " must have at most 100 questions.");
      const questions = record.questions.map((question, questionIndex) => {
        const questionLabel = label + ", question " + (questionIndex + 1);
        requireObject(question, ["part", "prompt", "followUp"], questionLabel);
        return {
          part: stringField(question, "part", 200, questionLabel, true),
          prompt: stringField(question, "prompt", 2000, questionLabel, true),
          followUp: stringField(question, "followUp", 2000, questionLabel)
        };
      });
      const total = status === "graded" ? calculateTotal(scores, criteria) : null;
      return { id, session, contentVersion, studentId, studentName, className, date, status, durationSeconds, scores, total, notes, questions };
    });
  }

  return Object.freeze({ calculateTotal, shuffledQuestions, csvExport, validateBackup });
});
