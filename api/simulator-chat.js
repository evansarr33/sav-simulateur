export default async function handler(req, res) {
  const ORIGIN = process.env.ALLOWED_ORIGIN || "*";

  // CORS
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { session_id, agent_message } = req.body || {};
    if (!session_id || !agent_message) {
      res.status(400).json({ error: "Missing session_id or agent_message" });
      return;
    }

    // Réponse STUB pour valider la route
    res.status(200).json({
      bot_message: "✅ Endpoint opérationnel (stub). On branchera l’IA juste après.",
      humeur: 0,
      meta: { model: process.env.OPENROUTER_MODEL || "stub" }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal error", details: String(e) });
  }
}

