// IA toujours dispo sans connexion (retourne juste le texte).
// SI tu fournis un token (Authorization: Bearer …) ET une vraie session_id,
// alors ça écrit aussi le message bot dans Supabase.messages.

const ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "mistralai/mistral-7b-instruct:free";

// petites aides
const json = (res, code, obj) => { res.status(code).json(obj) };

// util: lire utilisateur à partir d'un access_token (sans lib, via endpoint Auth)
async function getUserFromToken(accessToken) {
  if (!accessToken) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL + "/auth/v1/user";
  const resp = await fetch(url, {
    headers: {
      "authorization": "Bearer " + accessToken,
      "apikey": process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    }
  });
  if (!resp.ok) return null;
  const u = await resp.json();
  return u?.id ? u : null;
}

// util: écrire dans Supabase (insert bot message)
async function insertBotMessage(session_id, content) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1/messages";
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "apikey": process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      "Authorization": "Bearer " + process.env.SERVICE_ROLE_KEY, // serveur
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    body: JSON.stringify([{ session_id, author: "bot", content }])
  });
  if (!resp.ok) {
    const t = await resp.text();
    console.error("Insert bot message failed:", t);
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") {
    return json(res, 200, { status: "ok", endpoint: "simulator-chat" });
  }
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  try {
    const { session_id, agent_message } = req.body || {};
    if (!session_id || !agent_message) return json(res, 400, { error: "Missing session_id or agent_message" });

    // Prompt simple côté IA
    const systemContent = [
      "Tu joues un CLIENT dans un entraînement SAV e-commerce.",
      "Sois poli, ferme, concret. Ne promets rien hors politique.",
      "Réponds court et clair."
    ].join("\n");
    const messages = [
      { role: "system", content: systemContent },
      { role: "user", content: agent_message }
    ];

    // Appel OpenRouter
    const ai = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL, messages, temperature: 0.6, max_tokens: 256
      })
    });
    if (!ai.ok) {
      const details = await ai.text();
      return json(res, 502, { error: "OpenRouter error", details });
    }
    const data = await ai.json();
    const bot_message = data?.choices?.[0]?.message?.content?.trim() || "Je vous ai bien lu.";

    // Si un token utilisateur est fourni, on vérifie l’utilisateur et on tente d’écrire en base
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const user = await getUserFromToken(token); // null si pas token/invalid
    if (user && /^[0-9a-f-]{36}$/.test(session_id)) {
      await insertBotMessage(session_id, bot_message);
    }

    return json(res, 200, { bot_message, humeur: 0, meta: { model: OPENROUTER_MODEL } });
  } catch (e) {
    return json(res, 500, { error: "Internal error", details: String(e) });
  }
}
