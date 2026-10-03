CREATE TABLE grades (
 id TEXT PRIMARY KEY,
 teacher_key TEXT NOT NULL,
 record TEXT NOT NULL,
 revision INTEGER NOT NULL,
 deleted INTEGER NOT NULL DEFAULT 0,
 updated_at TEXT NOT NULL,
 actor TEXT NOT NULL,
 operation_id TEXT NOT NULL
);
CREATE INDEX grades_teacher ON grades(teacher_key, deleted);
CREATE TABLE grade_history (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 grade_id TEXT NOT NULL,
 revision INTEGER NOT NULL,
 record TEXT NOT NULL,
 deleted INTEGER NOT NULL,
 updated_at TEXT NOT NULL,
 actor TEXT NOT NULL,
 operation_id TEXT NOT NULL,
 UNIQUE(grade_id, revision)
);
-- The audit snapshot is part of the same transaction as the grade write.
CREATE TRIGGER grade_created AFTER INSERT ON grades BEGIN
 INSERT INTO grade_history(grade_id, revision, record, deleted, updated_at, actor, operation_id)
 VALUES(new.id,new.revision,new.record,new.deleted,new.updated_at,new.actor,new.operation_id);
END;
CREATE TRIGGER grade_changed AFTER UPDATE ON grades BEGIN
 INSERT INTO grade_history(grade_id, revision, record, deleted, updated_at, actor, operation_id)
 VALUES(new.id,new.revision,new.record,new.deleted,new.updated_at,new.actor,new.operation_id);
END;
