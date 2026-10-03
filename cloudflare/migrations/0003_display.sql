CREATE TABLE display_rooms (owner_session TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, payload TEXT NOT NULL DEFAULT '{}', expires INTEGER NOT NULL);
