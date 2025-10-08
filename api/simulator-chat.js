export default async function handler(req, res) {
  const ORIGIN = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") {
    return res.status(200).json({ status: "ok", endpoint: "simulator-chat" });
  }

  if (req.method === "POST") {
    const { session_id, agent_message } = req.body || {};
    if (!session_id || !agent_message) {
      return res.status(400).json({ error: "Missing session_id or agent_message" });
    }
    return res.status(200).json({
      bot_message: `J'ai reçu: "${agent_message}". (stub OK)`,
      humeur: 0,
      meta: { model: "stub" }
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
