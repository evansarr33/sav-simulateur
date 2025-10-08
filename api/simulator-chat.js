import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "mistralai/mistral-7b-instruct:free";
const ORIGIN = process.env.ALLOWED_ORIGIN || "*";

// Client admin (service) pour requêtes serveur sécurisées
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // 1) Authentifier l'agent via son access_token (header Authorization)
  const authHeader = req.headers.authorization || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!accessToken) return res.status(401).json({ error: "Missing Authorization Bearer token" });

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(accessToken);
  if (userErr || !userData?.user) return res.status(401).json({ error: "Invalid user token" });
  const userId = userData.user.id;

  // 2) Lire l'entrée
  const { session_id, agent_message } = req.body || {};
  if (!session_id || !agent_message) {
    return res.status(400).json({ error: "Missing session_id or agent_message" });
  }

  // 3) Vérifier que la session appartient à l'agent et est 'running'
  const { data: sessionRows, error: sessionErr } = await supabaseAdmin
    .from("sessions")
    .select("id, user_id, scenario_id, state")
    .eq("id", session_id)
    .limit(1);

  if (sessionErr || !sessionRows?.length) return res.status(404).json({ error: "Session not found" });
  const session = sessionRows[0];
  if (session.user_id !== userId) return res.status(403).json({ error: "Forbidden: not your session" });
  if (session.state !== "running") return res.status(409).json({ error: "Session is not running" });

  // 4) Charger le scénario + policy + 10 derniers messages
  const [{ data: scenRows }, { data: polRows }, { data: msgRows }] = await Promise.all([
    supabaseAdmin.from("scenarios").select("id,title,mode,persona,goals,policy_id").eq("id", session.scenario_id).limit(1),
    supabaseAdmin.from("policies").select("id,name,rules_json").eq("id", (await supabaseAdmin.from("scenarios").select("policy_id").eq("id", session.scenario_id).single()).data.policy_id),
    supabaseAdmin.from("messages").select("author,content,created_at").eq("session_id", session_id).order("created_at", { ascending: false }).limit(10)
  ]);

  const scenario = scenRows?.[0];
  const policy = polRows?.[0];
  const history = (msgRows || []).reverse(); // du plus ancien au plus récent

  // 5) Construire le contexte (system prompt) très simple
  const systemContent = [
    "Tu joues le rôle d'un CLIENT dans un entraînement SAV e-commerce.",
    "Reste STRICTEMENT dans le contexte du scénario.",
    `Persona: ${scenario?.persona || "client standard"}.`,
    `Objectif: ${scenario?.goals || "résoudre le problème selon la politique"}.`,
    `Règles: ${policy?.rules_json ? JSON.stringify(policy.rules_json) : "respect des plafonds et procédures"}.`,
    "Ton: poli mais ferme. Interdit: promesse hors politique, vulgarité, données inventées.",
    "Réponds court, clair, naturel."
  ].join("\n");

  // 6) Construire l'historique pour l'IA (messages chat)
  const messagesForLLM = [
    { role: "system", content: systemContent },
    ...history.map(m => ({ role: m.author === "agent" ? "user" : "assistant", content: m.content })),
    { role: "user", content: agent_message }
  ];

  // 7) Appeler OpenRouter (modèle gratuit)
  let botText = "";
  try {
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: messagesForLLM,
        temperature: 0.6,
        max_tokens: 256
      })
    });
    if (!resp.ok) {
      const t = await resp.text();
      return res.status(502).json({ error: "OpenRouter error", details: t });
    }
    const data = await resp.json();
    botText = data?.choices?.[0]?.message?.content?.trim() || "Je vous ai bien lu.";
  } catch (e) {
    return res.status(502).json({ error: "OpenRouter fetch failed", details: String(e) });
  }

  // 8) Enregistrer le message agent (si tu veux journaliser ici) puis la réponse bot
  // (Messages agent peuvent déjà être écrits côté front. Ici on écrit au moins la réponse bot.)
  const { error: insErr } = await supabaseAdmin.from("messages").insert([
    { session_id, author: "bot", content: botText }
  ]);
  if (insErr) console.error("Insert bot message error", insErr);

  // 9) Retourner la réponse
  res.status(200).json({
    bot_message: botText,
    humeur: 0,
    meta: { model: OPENROUTER_MODEL }
  });
}
