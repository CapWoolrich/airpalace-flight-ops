import inviteUserHandler from "../src/server/apiHandlers/inviteUserHandler.js";

export default async function handler(req, res) {
  const action = String(req.query?.action || req.body?.action || "").trim();
  if (action !== "invite-user") return res.status(400).json({ ok: false, error: "action inválida", allowed: ["invite-user"] });
  return inviteUserHandler(req, res);
}
