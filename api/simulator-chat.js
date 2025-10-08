// Sécurité: token obligatoire + vérif session + CORS strict + rate-limit
// Appel IA via OpenRouter (inchangé)

const ORIGIN = process.env.ALLOWED_ORIGIN || "https://sav-simulateur.vercel.app";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "mistralai/mistral-7b-instruct:free";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE = process.env.SERVICE_ROLE_KEY;

// ===== Rate limit (naïf en mémoire, suffisant pour MVP) =====
const BUCKET = globalThis.__rl || (globalThis.__rl = new Map());
function rateLimit(key, limit = 10, windowMs = 30_000) {
  const now = Date.now();
  const arr = BUCKET.get(key) || [];
  const recent = arr.filter(ts => now - ts < windowMs);
  if (recent.length >= limit) return false;
  recent.push(now);
  BUCKET.set(key, recent);
  return true;
}

// ===== Helpers =====
const json = (res, code, obj) => { res.status(code).json(obj); };

async function getUserFromToken(accessToken) {
  if (!accessToken) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { authorization: `Bearer ${accessToken}`, apikey: SUPABASE_ANON }
  });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.id ? u : null;
}

function isUUID(v) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v); }

async function getSession(session_id) {
  const url = `${SUPABASE_URL}/rest/v1/sessions?id=eq.${encodeURIComponent(session_id)}&select=id,user_id,scenario_id,state`;
  const r = await fetch(url, { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SERVICE_ROLE}` } });
  if (!r.ok) throw new Error(`sessions fetch ${r.status}`);
  const rows = await r.json();
  return rows?.[0] || null;
}

async function insertBotMessage(session_id, content) {
  const url = `${SUPABASE_URL}/rest/v1/messages`;
  await fetch(url, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify([{ session_id, author: "bot", content }])
  });
}

// ===== Handler =====
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") return json(res, 200, { status: "ok", endpoint: "simulator-chat" });
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  try {
    // 1) Auth obligatoire
    const auth = req.headers.authorization || "";
    const accessToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!accessToken) return json(res, 401, { error: "Missing Authorization Bearer token" });

    const user = await getUserFromToken(accessToken);
    if (!user) return json(res, 401, { error: "Invalid token" });

    // Rate limit par user (fallback IP si jamais)
    const key = `chat:${user.id || req.headers["x-forwarded-for"] || req.socket.remoteAddress}`;
    if (!rateLimit(key)) return json(res, 429, { error: "Too Many Requests" });

    // 2) Entrées + vérif session ownership
    const { session_id, agent_message } = req.body || {};
    if (!isUUID(session_id)) return json(res, 400, { error: "Invalid session_id" });
    if (!agent_message) return json(res, 400, { error: "Missing agent_message" });

    const session = await getSession(session_id);
    if (!session) return json(res, 404, { error: "Session not found" });
    if (session.user_id !== user.id) return json(res, 403, { error: "Forbidden (not your session)" });
    if (session.state !== "running") return json(res, 409, { error: "Session is not running" });

    // 3) Appel IA (contexte simple)
    const systemContent = [
      "Tu joues le rôle d'un CLIENT dans un entraînement SAV e-commerce.",
      "Reste poli, ferme, concret. Ne promets rien hors politique.",
      "Réponds court et clair."
    ].join("\n");

    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: "system", content: systemContent },
          { role: "user", content: agent_message }
        ],
        temperature: 0.6,
        max_tokens: 256
      })
    });

    if (!resp.ok) {
      const details = await resp.text();
      return json(res, 502, { error: "OpenRouter error", details });
    }
    const data = await resp.json();
    const bot_message = data?.choices?.[0]?.message?.content?.trim() || "Je vous ai bien lu.";

    // 4) Écriture message bot
    await insertBotMessage(session_id, bot_message);

    return json(res, 200, { bot_message, humeur: 0, meta: { model: OPENROUTER_MODEL } });
  } catch (e) {
    return json(res, 500, { error: "Internal error", details: String(e) });
  }
}
