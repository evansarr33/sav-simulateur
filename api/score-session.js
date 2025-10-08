const ORIGIN = process.env.ALLOWED_ORIGIN || "https://sav-simulateur.vercel.app";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE = process.env.SERVICE_ROLE_KEY;

const BUCKET = globalThis.__rl3 || (globalThis.__rl3 = new Map());
function rateLimit(key, limit = 5, windowMs = 30_000) {
  const now = Date.now();
  const arr = BUCKET.get(key) || [];
  const recent = arr.filter(ts => now - ts < windowMs);
  if (recent.length >= limit) return false;
  recent.push(now);
  BUCKET.set(key, recent);
  return true;
}
const json = (res, code, obj) => { res.status(code).json(obj) };
const isUUID = v => /^[0-9a-f-]{36}$/i.test(v);

async function getUserFromToken(accessToken) {
  if (!accessToken) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { authorization: `Bearer ${accessToken}`, apikey: SUPABASE_ANON }
  });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.id ? u : null;
}
async function getSession(session_id) {
  const url = `${SUPABASE_URL}/rest/v1/sessions?id=eq.${encodeURIComponent(session_id)}&select=id,user_id,state`;
  const r = await fetch(url, { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SERVICE_ROLE}` } });
  if (!r.ok) throw new Error(`sessions fetch ${r.status}`);
  const rows = await r.json();
  return rows?.[0] || null;
}
async function insertScoreAndClose(session_id, breakdown, total) {
  // score
  await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify([{ session_id, breakdown_json: breakdown, total }])
  });
  // close session
  await fetch(`${SUPABASE_URL}/rest/v1/sessions?id=eq.${encodeURIComponent(session_id)}`, {
    method: "PATCH",
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ state: "closed", ended_at: new Date().toISOString() })
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") return json(res, 200, { status: "ok", endpoint: "score-session" });
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  try {
    // Auth
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return json(res, 401, { error: "Missing Authorization" });
    const user = await getUserFromToken(token);
    if (!user) return json(res, 401, { error: "Invalid token" });

    const key = `score:${user.id || req.headers["x-forwarded-for"] || req.socket.remoteAddress}`;
    if (!rateLimit(key)) return json(res, 429, { error: "Too Many Requests" });

    // Entrée + session
    const { session_id } = req.body || {};
    if (!isUUID(session_id)) return json(res, 400, { error: "Invalid session_id" });

    const session = await getSession(session_id);
    if (!session) return json(res, 404, { error: "Session not found" });
    if (session.user_id !== user.id) return json(res, 403, { error: "Forbidden" });
    if (session.state !== "running") return json(res, 409, { error: "Session already closed" });

    // Barème simple (à améliorer)
    const breakdown = { diagnostic: 16, conformite: 18, communication: 15, efficacite: 14, impact_business: 13 };
    const total = Object.values(breakdown).reduce((a,b)=>a+b,0);

    await insertScoreAndClose(session_id, breakdown, total);
    return json(res, 200, { total, breakdown });
  } catch (e) {
    return json(res, 500, { error: "Internal error", details: String(e) });
  }
}
