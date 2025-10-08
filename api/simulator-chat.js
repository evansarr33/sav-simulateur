export default async function handler(req, res) {
  const ORIGIN = process.env.ALLOWED_ORIGIN || "*";
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "mistralai/mistral-7b-instruct:free";

  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") {
    return res.status(200).json({ status: "ok", endpoint: "simulator-chat" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { session_id, agent_message } = req.body || {};
    if (!session_id || !agent_message) {
      return res.status(400).json({ error: "Missing session_id or agent_message" });
    }

    // Contexte très simple pour commencer (persona + règles basiques)
    const systemContent = [
      "Tu joues le rôle d'un CLIENT dans un entraînement SAV e-commerce.",
      "Reste poli, ferme, concret. Pas de promesses hors politique.",
      "Si l'agent propose une solution acceptable, reconnais-le et avance vers la clôture."
    ].join("\n");

    const messages = [
      { role: "system", content: systemContent },
      { role: "user", content: agent_message }
    ];

    // Appel OpenRouter
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages,
        temperature: 0.6,
        max_tokens: 256
      })
    });

    if (!resp.ok) {
      const details = await resp.text();
      return res.status(502).json({ error: "OpenRouter error", details });
    }

    const data = await resp.json();
    const bot_message = data?.choices?.[0]?.message?.content?.trim() || "Je vous ai bien lu.";
    return res.status(200).json({ bot_message, humeur: 0, meta: { model: OPENROUTER_MODEL } });
  } catch (e) {
    return res.status(500).json({ error: "Internal error", details: String(e) });
  }
}
