\
// /api/admin-stats.js
const ORIGIN = process.env.ALLOWED_ORIGIN || "https://sav-simulateur.vercel.app";
const SUPABASE_URL = "https://bkgpmfqzkzxehjgshnga.supabase.co";
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE = process.env.SERVICE_ROLE_KEY;

const json = (res, code, obj) => res.status(code).json(obj);

async function getUserFromToken(accessToken) {
  if (!accessToken) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { authorization: `Bearer ${accessToken}`, apikey: SUPABASE_ANON }
  });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.id ? u : null;
}

async function getProfile(user_id) {
  const url = `${SUPABASE_URL}/rest/v1/users_profile?user_id=eq.${encodeURIComponent(user_id)}&select=user_id,role`;
  const r = await fetch(url, { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SERVICE_ROLE}` } });
  if (!r.ok) throw new Error("users_profile fetch " + r.status);
  const rows = await r.json();
  return rows?.[0] || null;
}

async function fetchJSON(path) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const r = await fetch(url, { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SERVICE_ROLE}` } });
  if (!r.ok) throw new Error(path + " " + r.status + " " + (await r.text()));
  return await r.json();
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return json(res, 401, { error: "Missing Authorization" });
    const user = await getUserFromToken(token);
    if (!user) return json(res, 401, { error: "Invalid token" });

    const profile = await getProfile(user.id);
    if (!profile || profile.role !== "trainer") return json(res, 403, { error: "Forbidden (trainer only)" });

    const sessions = await fetchJSON("sessions?select=id,user_id,scenario_id,state,started_at,ended_at&order=started_at.desc&limit=50");
    const scores   = await fetchJSON("scores?select=session_id,total&limit=2000");
    const actions  = await fetchJSON("actions?select=session_id,approved,amount_cents,type&limit=5000");

    const scoreVals = scores.map(s => s.total).filter(n => typeof n === 'number');
    const avgScore = scoreVals.length ? Math.round(scoreVals.reduce((a,b)=>a+b,0)/scoreVals.length) : 0;
    const costCents = actions.reduce((sum,a)=> sum + (a.amount_cents||0), 0);
    const resolved = sessions.filter(s => s.state === 'closed').length;
    const total = sessions.length;
    const rate = total ? Math.round((resolved/total)*100) : 0;

    return json(res, 200, {
      kpis: {
        avgScore,
        costEUR: Number((costCents/100).toFixed(2)),
        resolved,
        total,
        rate
      },
      sessions
    });
  } catch (e) {
    return json(res, 500, { error: "Internal error", details: String(e) });
  }
}
