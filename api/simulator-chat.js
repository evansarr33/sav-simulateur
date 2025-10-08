export default async function handler(req, res) {
  const ORIGIN = process.env.ALLOWED_ORIGIN || "*";
  // CORS (pour que le site puisse appeler l’API)
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(204).end();

  // 1) Mode GET (tu peux tester dans le navigateur)
  if (req.method === "GET") {
    const msg = (req.query?.msg || "ping").toString();
    return res.status(200).json({
      status: "ok",
      endpoint: "simulator-chat",
      you_sent: msg
    });
  }

  // 2) Mode POST très simple (sans auth, juste pour valider)
  if (req.method === "POST") {
    try {
      const { session_id, agent_message } = req.body || {};
      if (!session_id || !agent_message) {
        return res.status(400).json({ error: "Missing session_id or agent_message" });
      }
      // réponse factice (pas encore IA)
      return res.status(200).json({
        bot_message: `J'ai reçu: "${agent_message}". (stub OK)`,
        humeur: 0,
        meta: { model: "stub" }
      });
    } catch (e) {
      return res.status(500).json({ error: "Internal error", details: String(e) });
    }
  }

  // autre méthode → refus
  return res.status(405).json({ error: "Method not allowed" });
}
