const ORIGIN = process.env.ALLOWED_ORIGIN || "https://sav-simulateur.vercel.app";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE = process.env.SERVICE_ROLE_KEY;

const json = (res, code, obj) => { res.status(code).json(obj) };

async function getUserFromToken(accessToken) {
  if (!accessToken) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { authorization: `Bearer ${accessToken}`, apikey: SUPABASE_ANON }
  });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.id ? u : null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method === "GET") return json(res, 200, { status: "ok", endpoint: "new-session" });
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  try {
    // Auth obligatoire
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return json(res, 401, { error: "Missing Authorization" });
    const user = await getUserFromToken(token);
    if (!user) return json(res, 401, { error: "Invalid token" });

    // Entrée
    const { scenario_id } = req.body || {};
    if (!(Number.isInteger(scenario_id) && scenario_id > 0)) {
      return json(res, 400, { error: "Invalid scenario_id" });
    }

    // Création de session (state = running)
    const url = `${SUPABASE_URL}/rest/v1/sessions`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify([{
        user_id: user.id,
        scenario_id,
        state: "running"
      }])
    });
    if (!resp.ok) {
      const details = await resp.text();
      return json(res, 500, { error: "Session insert failed", details });
    }
    const rows = await resp.json();
    return json(res, 200, { session_id: rows[0].id });
  } catch (e) {
    return json(res, 500, { error: "Internal error", details: String(e) });
  }
}
