CREATE TABLE IF NOT EXISTS state (
  id      INTEGER PRIMARY KEY CHECK (id = 1),
  v       INTEGER NOT NULL,
  data    TEXT    NOT NULL,
  updated TEXT    NOT NULL
);

-- Her kayıttan önce bir önceki durumun kopyası (son 200 sürüm). Yalnızca elle geri yükleme için;
-- API üzerinden okunmaz.
CREATE TABLE IF NOT EXISTS state_backup (
  hid     INTEGER PRIMARY KEY AUTOINCREMENT,
  v       INTEGER NOT NULL,
  data    TEXT    NOT NULL,
  updated TEXT    NOT NULL,
  saved   TEXT    NOT NULL
);
