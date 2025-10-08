\
// /api/simulator-chat.js — Gemini version
const ORIGIN = process.env.ALLOWED_ORIGIN || "https://sav-simulateur.vercel.app";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE = process.env.SERVICE_ROLE_KEY;

const BUCKET = globalThis.__rl_chat || (globalThis.__rl_chat = new Map());
function rateLimit(key, limit = 10, windowMs = 30_000) {
  const now = Date.now();
  const arr = BUCKET.get(key) || [];
  const recent = arr.filter(ts => now - ts < windowMs);
  if (recent.length >= limit) return false;
  recent.push(now);
  BUCKET.set(key, recent);
  return true;
}

const json = (res, code, obj) => { res.status(code).json(obj) };
const isUUID = v => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

async function getUserFromToken(accessToken) {
  if (!accessToken) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { authorization: `Bearer ${accessToken}`, apikey: SUPABASE_ANON }
  });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.id ? u : null;
}

async function getSession(session_id) {
  const url = `${SUPABASE_URL}/rest/v1/sessions?id=eq.${encodeURIComponent(session_id)}&select=id,user_id,scenario_id,state`;
  const r = await fetch(url, { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SERVICE_ROLE}` } });
  if (!r.ok) throw new Error(`sessions fetch ${r.status}`);
  const rows = await r.json();
  return rows?.[0] || null;
}

async function insertMessage(session_id, author, content) {
  const url = `${SUPABASE_URL}/rest/v1/messages`;
  const body = [{ session_id, author, content }];
  const r = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const t = await r.text();
    console.error("Insert message failed", r.status, t);
  }
}

function cleanBot(text = "") {
  try {
    let t = String(text);
    t = t.replace(/<\/?s>/gi, "");
    t = t.replace(/\[(?:\/)?(?:OUT|INST|SYS|SYSTEM|USER|ASSISTANT)\]/gi, "");
    t = t.replace(/<[^>]+>/g, "");
    t = t.replace(/```[\s\S]*?```/g, "");
    t = t.replace(/[ \t]+/g, " ");
    t = t.replace(/\n{3,}/g, "\n\n");
    return t.trim();
  } catch { return text || "" }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") return json(res, 200, { status: "ok", endpoint: "simulator-chat", llm: "gemini", model: GEMINI_MODEL });
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  try {
    if (!GEMINI_API_KEY) return json(res, 500, { error: "Missing GEMINI_API_KEY" });

    const auth = req.headers.authorization || "";
    const accessToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!accessToken) return json(res, 401, { error: "Missing Authorization Bearer token" });
    const user = await getUserFromToken(accessToken);
    if (!user) return json(res, 401, { error: "Invalid token" });

    const key = `chat:${user.id || req.headers["x-forwarded-for"] || req.socket.remoteAddress}`;
    if (!rateLimit(key)) return json(res, 429, { error: "Too Many Requests" });

    const { session_id, agent_message } = req.body || {};
    if (!isUUID(session_id)) return json(res, 400, { error: "Invalid session_id" });
    if (!agent_message) return json(res, 400, { error: "Missing agent_message" });

    const session = await getSession(session_id);
    if (!session) return json(res, 404, { error: "Session not found" });
    if (session.user_id !== user.id) return json(res, 403, { error: "Forbidden (not your session)" });
    if (session.state !== "running") return json(res, 409, { error: "Session is not running" });

    await insertMessage(session_id, "agent", agent_message);

    const systemPrompt = [
      "Tu joues le rôle d'un CLIENT dans un entraînement SAV e-commerce.",
      "Reste poli, ferme, concret. Ne promets rien hors politique.",
      "Réponds court et clair."
    ].join("\\n");

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;
    const body = {
      contents: [
        { parts: [{ text: systemPrompt }] },
        { parts: [{ text: agent_message }] }
      ],
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 256
      }
    };

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": GEMINI_API_KEY },
      body: JSON.stringify(body)
    });

    const text = await resp.text();
    let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!resp.ok) {
      return json(res, resp.status, { error: "Gemini error", details: data });
    }

    const candidates = data.candidates || [];
    const parts = (candidates[0]?.content?.parts) || [];
    const reply = (parts[0]?.text || "").trim() || "Je vous ai bien lu.";
    const bot_message = cleanBot(reply);

    await insertMessage(session_id, "bot", bot_message);

    return json(res, 200, { bot_message, humeur: 0, meta: { model: GEMINI_MODEL, provider: "gemini" } });
  } catch (e) {
    return json(res, 500, { error: "Internal error", details: String(e) });
  }
}
