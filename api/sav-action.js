export default async function handler(req, res) {
  const ORIGIN = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") {
    return res.status(200).json({ status: "ok", endpoint: "sav-action" });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { session_id, action_type, amount_cents, justification } = req.body || {};
    if (!session_id || !action_type) {
      return res.status(400).json({ error: "Missing session_id or action_type" });
    }
    // Stub : on “approuve” de façon fictive (vraie logique plus tard)
    let notice = "Action enregistrée.";
    let ref = null;
    if (action_type === "rma") {
      ref = "RMA-" + Math.floor(100000 + Math.random()*900000);
      notice = `RMA créé: ${ref}`;
    }
    return res.status(200).json({ approved: true, notice, ref });
  } catch (e) {
    return res.status(500).json({ error: "Internal error", details: String(e) });
  }
}

