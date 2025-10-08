// Sécurité: token obligatoire + vérif session + CORS strict + rate-limit
// Appel IA via Google Generative Language API

const ORIGIN = process.env.ALLOWED_ORIGIN || "https://sav-simulateur.vercel.app";
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_MODEL = process.env.GOOGLE_MODEL || "gemini-2.0-flash";

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

async function insertMessage(session_id, author, content) {
  const url = `${SUPABASE_URL}/rest/v1/messages`;
  await fetch(url, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify([{ session_id, author, content }])
  });
}

async function fetchScenarioDetails(id) {
  if (!id) return null;
  const url = `${SUPABASE_URL}/rest/v1/scenarios?id=eq.${encodeURIComponent(id)}&select=title,persona,mode,level`;
  const resp = await fetch(url, { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SERVICE_ROLE}` } });
  if (!resp.ok) return null;
  const rows = await resp.json();
  return rows?.[0] || null;
}

async function fetchRecentMessages(session_id, limit = 20) {
  const base = `${SUPABASE_URL}/rest/v1/messages`;
  const params = new URLSearchParams({
    session_id: `eq.${session_id}`,
    select: "author,content,created_at",
    order: "created_at.asc",
    limit: String(limit)
  });
  const resp = await fetch(`${base}?${params.toString()}`, {
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SERVICE_ROLE}` }
  });
  if (!resp.ok) return [];
  const rows = await resp.json();
  return Array.isArray(rows) ? rows : [];
}

// ===== Handler =====
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!["GET", "POST"].includes(req.method)) return json(res, 405, { error: "Method not allowed" });

  try {
    // 1) Auth obligatoire
    const auth = req.headers.authorization || "";
    const accessToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!accessToken) return json(res, 401, { error: "Missing Authorization Bearer token" });

    const user = await getUserFromToken(accessToken);
    if (!user) return json(res, 401, { error: "Invalid token" });

    if (req.method === "GET") {
      const { session_id } = req.query || {};
      if (!isUUID(session_id)) return json(res, 400, { error: "Invalid session_id" });
      const session = await getSession(session_id);
      if (!session) return json(res, 404, { error: "Session not found" });
      if (session.user_id !== user.id) return json(res, 403, { error: "Forbidden" });

      const history = await fetchRecentMessages(session_id, 50);
      return json(res, 200, {
        messages: history.map(m => ({
          author: m.author,
          content: m.content,
          created_at: m.created_at
        }))
      });
    }

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

    // 3) Historisation du message agent puis récupération du contexte
    await insertMessage(session_id, "agent", agent_message);

    const [scenario, history] = await Promise.all([
      fetchScenarioDetails(session.scenario_id),
      fetchRecentMessages(session_id, 30)
    ]);

    const trimmedHistory = history
      .filter(m => (m?.content || "").trim().length > 0)
      .slice(-20)
      .map(m => ({
        role: m.author === "agent" ? "user" : "assistant",
        content: String(m.content).slice(0, 2000)
      }));

    const personaLines = [];
    if (scenario?.title) personaLines.push(`Dossier: ${scenario.title}.`);
    if (scenario?.persona) personaLines.push(`Ton profil: ${scenario.persona}.`);
    if (scenario?.mode) personaLines.push(`Canal actuel: ${scenario.mode}.`);
    if (scenario?.level) personaLines.push(`Difficulté dossier: ${scenario.level}.`);

    const systemContent = [
      "Tu es un client réel d'un service e-commerce et tu échanges avec un conseiller.",
      "Réagis uniquement comme ce client: reste cohérent avec l'historique et ne révèle jamais que tu es un outil ou une IA.",
      "Exprime tes ressentis ou tes attentes avec des messages concis et crédibles.",
      ...personaLines,
      "Si le conseiller t'apporte une solution, réponds en conséquence (gratitude, questions complémentaires, etc.)."
    ].join("\n");

    const messagesPayload = [
      { role: "system", content: systemContent },
      ...trimmedHistory
    ];

    if (!GOOGLE_API_KEY) {
      return json(res, 500, { error: "Missing GOOGLE_API_KEY" });
    }

    const googlePayload = {
      systemInstruction: {
        role: "system",
        parts: [{ text: systemContent }]
      },
      contents: messagesPayload
        .filter(m => m.role !== "system")
        .map(m => ({
          role: m.role === "user" ? "user" : "model",
          parts: [{ text: m.content }]
        })),
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 256
      }
    };

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_MODEL}:generateContent?key=${GOOGLE_API_KEY}`;
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(googlePayload)
    });

    if (!resp.ok) {
      const details = await resp.text();
      return json(res, 502, { error: "Google Generative Language error", details });
    }
    const data = await resp.json();
    const bot_message = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "Merci pour votre retour.";

    // 4) Écriture message bot
    await insertMessage(session_id, "bot", bot_message);

    return json(res, 200, { bot_message, humeur: 0, meta: { model: GOOGLE_MODEL } });
  } catch (e) {
    return json(res, 500, { error: "Internal error", details: String(e) });
  }
}
