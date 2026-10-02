CREATE TABLE IF NOT EXISTS state (
  id      INTEGER PRIMARY KEY CHECK (id = 1),
  v       INTEGER NOT NULL,
  data    TEXT    NOT NULL,
  updated TEXT    NOT NULL
);
