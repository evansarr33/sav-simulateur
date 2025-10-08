export default async function handler(req, res) {
  const ORIGIN = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(204).end();

  // Répond TOUJOURS 200 (mode debug)
  return res.status(200).json({
    ok: true,
    method: req.method,
    ts: new Date().toISOString(),
    note: "Version debug: si tu vois ceci en GET, la route est bien déployée."
  });
}
