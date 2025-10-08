export default async function handler(req, res) {
  const ORIGIN = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") {
    return res.status(200).json({ status: "ok", endpoint: "score-session" });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { session_id } = req.body || {};
    if (!session_id) return res.status(400).json({ error: "Missing session_id" });

    // Stub : score fictif avec décomposition
    const breakdown = {
      diagnostic: 16,
      conformite: 18,
      communication: 15,
      efficacite: 14,
      impact_business: 13
    };
    const total = Object.values(breakdown).reduce((a,b)=>a+b,0);
    return res.status(200).json({ total, breakdown });
  } catch (e) {
    return res.status(500).json({ error: "Internal error", details: String(e) });
  }
}

