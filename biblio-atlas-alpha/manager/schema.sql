CREATE TABLE IF NOT EXISTS element (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 parent INTEGER REFERENCES element(id) ON DELETE RESTRICT,
 origin TEXT UNIQUE, payload TEXT NOT NULL CHECK(json_valid(payload)),
 created TEXT NOT NULL, updated TEXT NOT NULL, CHECK(parent IS NULL OR parent<>id)
);
CREATE INDEX IF NOT EXISTS parent_idx ON element(parent);
CREATE TABLE IF NOT EXISTS imports(hash TEXT PRIMARY KEY, created TEXT NOT NULL, original BLOB NOT NULL, report TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS legacy(element_id INTEGER PRIMARY KEY REFERENCES element(id) ON DELETE CASCADE, import_hash TEXT REFERENCES imports(hash), payload TEXT NOT NULL);
PRAGMA user_version=1;
