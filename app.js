const $ = sel => document.querySelector(sel);
const thread = $("#thread");
const sid = () => $("#sid").value || "demo";
const tok = () => ($("#tok")?.value || "").trim();

function addMsg(who, text) {
  const div = document.createElement("div");
  div.className = `msg ${who}`;
  div.innerHTML = `<div class="bubble">${text.replace(/</g,"&lt;")}</div>`;
  thread.appendChild(div);
  thread.scrollTop = thread.scrollHeight;
}

async function postJSON(url, payload) {
  const headers = { "Content-Type": "application/json" };
  const T = tok(); if (T) headers["Authorization"] = "Bearer " + T;
  const r = await fetch(url, { method:"POST", headers, body: JSON.stringify(payload) });
  const t = await r.text();
  try { return JSON.parse(t) } catch { return { raw:t } }
}

$("#send").onclick = async () => {
  const msg = $("#msg").value.trim();
  if (!msg) return;
  addMsg("agent", msg);
  $("#msg").value = "";
  const resp = await postJSON("/api/simulator-chat", { session_id: sid(), agent_message: msg });
  addMsg("bot", resp.bot_message || JSON.stringify(resp));
};

$("#msg").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#send").click(); } });
$("#clear").onclick = () => { thread.innerHTML = ""; };

document.querySelectorAll(".actions button").forEach(btn => {
  btn.onclick = async () => {
    const action = btn.dataset.act;
    if (action === "rma") {
      const r = await postJSON("/api/sav-action", { session_id: sid(), action_type: "rma", justification:"colis manquant" });
      addMsg("bot", r.notice || JSON.stringify(r));
    } else if (action === "discount") {
      const r = await postJSON("/api/sav-action", { session_id: sid(), action_type: "discount", amount_cents: 1200, justification:"défaut mineur" });
      addMsg("bot", r.notice || JSON.stringify(r));
    } else if (action === "score") {
      const r = await postJSON("/api/score-session", { session_id: sid() });
      addMsg("bot", `Score total: ${r.total}/100\n${JSON.stringify(r.breakdown)}`);
    }
  };
});

