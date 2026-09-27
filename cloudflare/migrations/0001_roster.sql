-- A small exam's complete roster is published atomically as one versioned snapshot.
CREATE TABLE exam_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL DEFAULT 0,
  payload TEXT NOT NULL
);
INSERT INTO exam_state(id, payload) VALUES(1, '{"revision":0,"session":"","updatedAt":null,"rows":[],"teacherCodes":{}}');
CREATE TABLE sessions (
  hash TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK(role IN ('manager','teacher')),
  teacher_key TEXT NOT NULL,
  credential_hash TEXT NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires);
CREATE TABLE login_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX login_limits_expiry ON login_limits(expires);
