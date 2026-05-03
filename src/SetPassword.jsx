import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

const cardStyle = {
  width: "100%",
  maxWidth: 460,
  background: "linear-gradient(150deg, rgba(17,24,39,.96), rgba(12,20,35,.98))",
  padding: 24,
  borderRadius: 18,
  boxShadow: "0 14px 38px rgba(0,0,0,.42)",
  border: "1px solid rgba(148,163,184,.22)",
};

const inputStyle = {
  width: "100%",
  padding: 12,
  borderRadius: 10,
  border: "1px solid #334155",
  marginBottom: 12,
  outline: "none",
  boxSizing: "border-box",
  background: "#0b1220",
  color: "#e2e8f0",
};

export default function SetPassword() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [linkInvalid, setLinkInvalid] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  const codeParam = useMemo(() => new URLSearchParams(window.location.search).get("code"), []);

  useEffect(() => {
    let mounted = true;
    async function bootstrap() {
      try {
        if (codeParam) {
          const { error } = await supabase.auth.exchangeCodeForSession(codeParam);
          if (error) throw new Error("invalid-link");
        }

        const { data, error } = await supabase.auth.getSession();
        if (error) throw new Error("invalid-link");

        const hash = window.location.hash || "";
        const looksLikeInviteOrRecovery = hash.includes("type=invite") || hash.includes("type=recovery") || hash.includes("access_token=");
        if (!data.session && !looksLikeInviteOrRecovery) throw new Error("invalid-link");
      } catch {
        if (mounted) setLinkInvalid(true);
      } finally {
        if (mounted) setReady(true);
      }
    }
    bootstrap();
    return () => {
      mounted = false;
    };
  }, [codeParam]);

  async function handleSetPassword(e) {
    e.preventDefault();
    setMsg("");

    if (newPassword.length < 8) {
      setMsg("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setMsg("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (user?.id) {
        await supabase.from("user_roles").upsert({
          user_id: user.id,
          role: user.user_metadata?.role || "viewer",
          requires_password_setup: false,
          password_set: true,
          onboarding_completed: true,
          updated_at: new Date().toISOString(),
        });
      }

      setMsg("Acceso activado correctamente. Redirigiendo...");
      window.setTimeout(() => {
        window.location.href = "/";
      }, 1200);
    } catch {
      setLinkInvalid(true);
      setMsg("El enlace es inválido o expiró. Solicita una nueva invitación o recuperación.");
    } finally {
      setLoading(false);
    }
  }

  if (!ready) return <div style={cardStyle}><p style={{ color: "#cbd5e1" }}>Validando enlace seguro...</p></div>;

  return (
    <form onSubmit={handleSetPassword} style={cardStyle}>
      <img src="/logo_login1.png" alt="AirPalace" style={{ width: 140, display: "block", margin: "0 auto 14px" }} />
      <h2 style={{ marginTop: 0, marginBottom: 8 }}>Crea tu contraseña para activar tu acceso</h2>
      {linkInvalid ? (
        <p style={{ color: "#fca5a5", fontSize: 14 }}>{msg || "Este enlace no es válido."}</p>
      ) : (
        <>
          <label style={{ display: "block", fontSize: 13, marginBottom: 6 }}>Nueva contraseña</label>
          <input type="password" required minLength={8} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={inputStyle} />
          <label style={{ display: "block", fontSize: 13, marginBottom: 6 }}>Confirmar contraseña</label>
          <input type="password" required minLength={8} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={{ ...inputStyle, marginBottom: 14 }} />
          <button type="submit" disabled={loading} style={{ width: "100%", padding: 12, borderRadius: 10, border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, cursor: "pointer", opacity: loading ? 0.75 : 1 }}>
            {loading ? "Activando..." : "Activar acceso"}
          </button>
        </>
      )}
      {msg && !linkInvalid && <p style={{ fontSize: 13, color: "#cbd5e1", marginTop: 12 }}>{msg}</p>}
    </form>
  );
}
