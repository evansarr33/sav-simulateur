const ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const json = (res, code, obj) => { res.status(code).json(obj) };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") return json(res, 200, { status: "ok", endpoint: "score-session" });
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  try {
    const { session_id } = req.body || {};
    if (!session_id) return json(res, 400, { error: "Missing session_id" });

    // barème simple (stub)
    const breakdown = { diagnostic: 16, conformite: 18, communication: 15, efficacite: 14, impact_business: 13 };
    const total = Object.values(breakdown).reduce((a,b)=>a+b,0);
    return json(res, 200, { total, breakdown });
  } catch (e) {
    return json(res, 500, { error: "Internal error", details: String(e) });
  }
}
