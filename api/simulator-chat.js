export default async function handler(req, res) {
  const ORIGIN = process.env.ALLOWED_ORIGIN || "https://sav-simulateur.vercel.app";
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(204).end();

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const SERVICE_ROLE = process.env.SERVICE_ROLE_KEY;

  if (req.method === "GET" && (req.query?.diag === "1")) {
    return res.status(200).json({
      ok: true,
      endpoint: "simulator-chat",
      llm: "gemini",
      diag: {
        hasGeminiKey: !!GEMINI_API_KEY,
        model: GEMINI_MODEL,
        hasSupabaseUrl: !!SUPABASE_URL,
        hasAnonKey: !!SUPABASE_ANON,
        hasServiceRole: !!SERVICE_ROLE
      }
    });
  }

  // Laisse le reste de ton code ici (POST) - si tu veux juste diagnostiquer, réponds :
  if (req.method === "POST") {
    if (!GEMINI_API_KEY) return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
    return res.status(200).json({ note: "diag mode: la clé existe, le POST est OK côté serveur" });
  }

  return res.status(200).json({ status: "ok", endpoint: "simulator-chat", llm: "gemini", model: GEMINI_MODEL });
}
