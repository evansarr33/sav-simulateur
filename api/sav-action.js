const ORIGIN = process.env.ALLOWED_ORIGIN || "*";

const json = (res, code, obj) => { res.status(code).json(obj) };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") return json(res, 200, { status: "ok", endpoint: "sav-action" });
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  try {
    const { session_id, action_type, amount_cents, justification } = req.body || {};
    if (!session_id || !action_type) return json(res, 400, { error: "Missing session_id or action_type" });

    // Règle simple : plafond -15% (politique par défaut) si discount
    if (action_type === "discount") {
      // ici on ne connaît pas le panier exact → on fixe un faux panier à 6000 cts pour la démo
      const basket = 6000;
      const max = Math.floor(basket * 0.15); // 15%
      if (!Number.isFinite(amount_cents)) return json(res, 400, { error: "Missing amount_cents for discount" });
      if (amount_cents > max) {
        return json(res, 403, { approved: false, notice: `Refusé: plafond 15% = ${max} cts` });
      }
      return json(res, 200, { approved: true, notice: `Réduction validée: ${amount_cents} cts (≤ ${max})` });
    }

    if (action_type === "rma") {
      const ref = "RMA-" + Math.floor(100000 + Math.random() * 900000);
      return json(res, 200, { approved: true, notice: `RMA créé: ${ref}`, ref });
    }

    // autres actions (refund, voucher, redelivery) — stub OK
    return json(res, 200, { approved: true, notice: "Action enregistrée (stub)" });
  } catch (e) {
    return json(res, 500, { error: "Internal error", details: String(e) });
  }
}
