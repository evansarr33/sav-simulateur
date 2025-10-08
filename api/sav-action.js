const ORIGIN = process.env.ALLOWED_ORIGIN || "https://sav-simulateur.vercel.app";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE = process.env.SERVICE_ROLE_KEY;

const BUCKET = globalThis.__rl2 || (globalThis.__rl2 = new Map());
function rateLimit(key, limit = 10, windowMs = 30_000) {
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
  const url = `${SUPABASE_URL}/rest/v1/sessions?id=eq.${encodeURIComponent(session_id)}&select=id,user_id,scenario_id,state`;
  const r = await fetch(url, { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SERVICE_ROLE}` } });
  if (!r.ok) throw new Error(`sessions fetch ${r.status}`);
  const rows = await r.json();
  return rows?.[0] || null;
}
async function getPolicyForSession(session_id) {
  const url = `${SUPABASE_URL}/rest/v1/sessions?id=eq.${encodeURIComponent(session_id)}&select=scenario_id,scenarios(policy_id,policies(rules_json))`;
  const r = await fetch(url, { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SERVICE_ROLE}` } });
  if (!r.ok) return null;
  const rows = await r.json();
  const rules = rows?.[0]?.scenarios?.policies?.rules_json;
  return rules || null;
}
async function insertAction(session_id, type, amount_cents, approved, meta) {
  const url = `${SUPABASE_URL}/rest/v1/actions`;
  await fetch(url, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify([{ session_id, type, amount_cents, approved, meta_json: meta }])
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") return json(res, 200, { status: "ok", endpoint: "sav-action" });
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  try {
    // Auth
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return json(res, 401, { error: "Missing Authorization" });
    const user = await getUserFromToken(token);
    if (!user) return json(res, 401, { error: "Invalid token" });

    const key = `act:${user.id || req.headers["x-forwarded-for"] || req.socket.remoteAddress}`;
    if (!rateLimit(key)) return json(res, 429, { error: "Too Many Requests" });

    // Entrées
    const { session_id, action_type, amount_cents, justification } = req.body || {};
    if (!isUUID(session_id)) return json(res, 400, { error: "Invalid session_id" });
    if (!action_type) return json(res, 400, { error: "Missing action_type" });

    // Session ownership
    const session = await getSession(session_id);
    if (!session) return json(res, 404, { error: "Session not found" });
    if (session.user_id !== user.id) return json(res, 403, { error: "Forbidden" });
    if (session.state !== "running") return json(res, 409, { error: "Session closed" });

    // Politique (plafonds)
    const rules = await getPolicyForSession(session_id); // peut être null
    const maxPct = (rules && Number(rules.max_discount_percent)) || 15;
    let notice = "Action enregistrée";
    let approved = true;
    let meta = { justification };

    if (action_type === "discount") {
      if (!(Number.isFinite(amount_cents) && amount_cents >= 0)) {
        return json(res, 400, { error: "Missing/invalid amount_cents" });
      }
      // panier démo = 6000 cts (à remplacer par valeur réelle si dispo)
      const basket = 6000;
      const max = Math.floor(basket * (maxPct / 100));
      if (amount_cents > max) {
        approved = false;
        notice = `Refusé: plafond ${maxPct}% = ${max} cts`;
      } else {
        notice = `Réduction validée: ${amount_cents} cts (≤ ${max})`;
      }
      meta = { ...meta, basket_cents: basket, max_allowed_cents: max, max_pct: maxPct };
    }

    if (action_type === "rma") {
      const ref = "RMA-" + Math.floor(100000 + Math.random() * 900000);
      meta = { ...meta, rma_ref: ref };
      notice = approved ? `RMA créé: ${ref}` : notice;
    }

    // Enregistrer
    await insertAction(session_id, action_type, amount_cents ?? null, approved, meta);
    return json(res, 200, { approved, notice, ref: meta.rma_ref || null });
  } catch (e) {
    return json(res, 500, { error: "Internal error", details: String(e) });
  }
}
