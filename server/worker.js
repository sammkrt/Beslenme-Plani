/* Beslenme Planı API — Cloudflare Worker + D1.
   Tek satırlık durum: {hist, custom} JSON'u ve sürüm numarası v.
   GET  /api/state  → {v, hist, custom, prefs, updated}  (herkese açık okuma)
   PUT  /api/state  → gövde {base, hist, custom, prefs?}, X-Pin başlığı zorunlu.
                      prefs = {tarifId: 1 (sevdik) | -1 (sevmedik)}; gönderilmezse kayıtlı tercihler korunur.
                      base, sunucudaki v ile aynı değilse 409 + güncel durum döner. */

const MAX_BODY = 100_000;
const ID = /^[a-z0-9_-]{1,24}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const GRAIN = /^[a-z]{1,16}$/;
const DONE = /^[a-z0-9_]{1,32}$/; // week.done: market listesinde alınan kalemler (besin anahtarı ya da x_limon gibi)
/* plan.days: kullanıcının atadığı günler (0 = Pazartesi). Yoksa varsayılan 2+2+2+1.
   Varsa: her BESLENME 1–3 gün ve haftanın 7 günü tam bir kez dağıtılmış olmalı. */
const SLOTS = [[0, 1], [2, 3], [4, 5], [6]];
function validDays(plans) {
  if (!plans.some(p => p.days !== undefined)) return true;
  const all = plans.map((p, i) => p.days === undefined ? SLOTS[i] : p.days);
  if (all.some(a => !Array.isArray(a) || a.length < 1 || a.length > 3 || a.some(d => !Number.isInteger(d) || d < 0 || d > 6))) return false;
  const f = all.flat();
  return f.length === 7 && new Set(f).size === 7;
}
/* plan.x: kullanıcının öğünden çıkardığı malzeme satırları, ör. {b: [3], d: [0, 7]} */
const validX = x => x && typeof x === 'object' && !Array.isArray(x) &&
  Object.entries(x).every(([k, a]) => ['b', 's', 'd'].includes(k) && Array.isArray(a) && a.length <= 30 &&
    a.every(n => Number.isInteger(n) && n >= 0 && n < 30));
const KEEP_BACKUPS = 200;

function cors(req, env) {
  const origin = req.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const h = {
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Pin',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (allowed.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function json(data, status, req, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors(req, env) },
  });
}

/* Sabit süreli karşılaştırma: PIN'i deneme süresinden tahmin etmeyi zorlaştırır. */
async function pinOk(given, expected) {
  if (!expected || typeof given !== 'string') return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(given)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

/* Yalnızca uygulamanın ürettiği şekli kabul eder; tarif içeriğinin doğrulaması istemcide (validRecipe) yapılır. */
function validState(s) {
  if (!s || !Array.isArray(s.hist) || !Array.isArray(s.custom)) return false;
  if (s.hist.length > 30 || s.custom.length > 60) return false;
  const histOk = s.hist.every(w => w && Number.isInteger(w.no) && w.no > 0 && w.no < 100000 &&
    (w.start === undefined || DATE.test(w.start)) &&
    Array.isArray(w.plans) && w.plans.length === 4 &&
    w.plans.every(p => p && ID.test(p.b) && ID.test(p.s) && ID.test(p.d) && (p.g === undefined || GRAIN.test(p.g)) && (p.x === undefined || validX(p.x))) &&
    validDays(w.plans) &&
    (w.done === undefined || Array.isArray(w.done) && w.done.length <= 150 && w.done.every(k => typeof k === 'string' && DONE.test(k))));
  const customOk = s.custom.every(r => r && typeof r === 'object' && ID.test(r.id));
  const pr = s.prefs;
  const prefsOk = pr && typeof pr === 'object' && !Array.isArray(pr) && Object.keys(pr).length <= 300 &&
    Object.entries(pr).every(([k, v]) => ID.test(k) && (v === 1 || v === -1));
  return histOk && customOk && prefsOk;
}

async function readState(env) {
  const row = await env.DB.prepare('SELECT v, data, updated FROM state WHERE id = 1').first();
  if (!row) return { v: 0, hist: [], custom: [], prefs: {}, updated: null };
  const d = JSON.parse(row.data);
  return { v: row.v, hist: d.hist, custom: d.custom, prefs: d.prefs || {}, updated: row.updated };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req, env) });
    if (url.pathname !== '/api/state') return json({ error: 'not_found' }, 404, req, env);

    if (req.method === 'GET' || req.method === 'HEAD') return json(await readState(env), 200, req, env);

    if (req.method === 'PUT') {
      if (!(await pinOk(req.headers.get('X-Pin'), env.PIN))) {
        await new Promise(r => setTimeout(r, 400)); // kaba kuvvet denemelerini yavaşlat
        return json({ error: 'pin' }, 401, req, env);
      }
      const text = await req.text();
      if (text.length > MAX_BODY) return json({ error: 'too_large' }, 413, req, env);
      let body;
      try { body = JSON.parse(text); } catch { return json({ error: 'bad_json' }, 400, req, env); }
      // Eski sürüm sayfalar prefs göndermez: o durumda kayıtlı tercihleri koru.
      const state = { hist: body.hist, custom: body.custom, prefs: body.prefs === undefined ? (await readState(env)).prefs : body.prefs };
      if (!Number.isInteger(body.base) || body.base < 0 || !validState(state)) return json({ error: 'invalid' }, 400, req, env);

      const data = JSON.stringify(state), now = new Date().toISOString();
      /* Koşullu yazma: yalnızca istemcinin gördüğü sürüm hâlâ güncelse kaydeder.
         Aynı işlemde önceki durum state_backup'a kopyalanır (yanlış silmeye karşı; son KEEP_BACKUPS kayıt tutulur). */
      let res;
      if (body.base === 0) {
        res = await env.DB.prepare('INSERT INTO state (id, v, data, updated) VALUES (1, 1, ?, ?) ON CONFLICT(id) DO NOTHING').bind(data, now).run();
      } else {
        const out = await env.DB.batch([
          env.DB.prepare('INSERT INTO state_backup (v, data, updated, saved) SELECT v, data, updated, ? FROM state WHERE id = 1 AND v = ?').bind(now, body.base),
          env.DB.prepare('UPDATE state SET v = v + 1, data = ?, updated = ? WHERE id = 1 AND v = ?').bind(data, now, body.base),
          env.DB.prepare('DELETE FROM state_backup WHERE hid <= (SELECT MAX(hid) FROM state_backup) - ?').bind(KEEP_BACKUPS),
        ]);
        res = out[1];
      }
      if (!res.meta.changes) return json({ error: 'conflict', ...(await readState(env)) }, 409, req, env);
      return json({ v: body.base + 1, updated: now }, 200, req, env);
    }

    return json({ error: 'method' }, 405, req, env);
  },
};
