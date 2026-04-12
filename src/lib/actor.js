export function deriveNameFromEmail(email) {
  const local = String(email || "").split("@")[0] || "";
  if (!local) return null;
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function deriveActor(user) {
  const email = user?.email || null;
  const name =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    deriveNameFromEmail(email) ||
    email ||
    null;

  return { email, name, id: user?.id || null };
}
