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

-- Hatalı PIN denemeleri (IP başına; başarılı girişte silinir). Bkz. worker.js guard().
CREATE TABLE IF NOT EXISTS pin_fail (
  ip      TEXT    PRIMARY KEY,
  n       INTEGER NOT NULL,
  first   TEXT    NOT NULL
);

-- Mealie kataloğu plan geçmişinden bağımsızdır. Worker gerektiğinde de oluşturur.
CREATE TABLE IF NOT EXISTS mealie_catalog (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  updated TEXT NOT NULL
);
