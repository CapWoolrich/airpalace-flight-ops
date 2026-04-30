import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import UpdatePassword from "./UpdatePassword";

const authShellStyle = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: 24,
  background: "radial-gradient(circle at 20% 10%, #12233f 0%, #0c1220 48%, #090f1a 100%)",
  color: "#fff",
  fontFamily: "-apple-system,sans-serif",
};

const authCardStyle = {
  width: "100%",
  maxWidth: 420,
  background: "linear-gradient(150deg, rgba(17,24,39,.96), rgba(12,20,35,.98))",
  padding: 22,
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

export default function AuthGate({ children }) {
  const signupEnabled =
    import.meta.env.DEV ||
    String(import.meta.env.VITE_ENABLE_PUBLIC_SIGNUP || "").toLowerCase() === "true";
  const [session, setSession] = useState(null);
  const [mode, setMode] = useState("login"); // login | signup | forgot
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const isUpdatePasswordRoute = useMemo(() => window.location.pathname === "/update-password", []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
    });

    return () => subscription.unsubscribe();
  }, [isUpdatePasswordRoute]);

  useEffect(() => {
    if (!signupEnabled && mode === "signup") setMode("login");
  }, [mode, signupEnabled]);

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg("");
    setLoading(true);

    try {
      if (mode === "signup") {
        if (!signupEnabled) throw new Error("Registro público deshabilitado en este entorno.");
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg("Cuenta creada. Si tu proyecto exige confirmación por email, revisa tu correo. Si no, ya puedes iniciar sesión.");
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/update-password`,
        });
        if (error) throw error;
        setMsg("If this email exists, we sent a secure password reset link.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setMsg("Sesión iniciada correctamente.");
      }
    } catch (err) {
      setMsg(err.message || "Ocurrió un error.");
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  if (!session || isUpdatePasswordRoute) {
    const showUpdateForm = isUpdatePasswordRoute;
    return (
      <div style={authShellStyle}>
        {showUpdateForm ? (<UpdatePassword />) : (<form onSubmit={handleSubmit} style={authCardStyle}>
          <img src="/logo_login1.png" alt="AirPalace" style={{ width: 140, display: "block", margin: "0 auto 14px" }} />
          <h2 style={{ marginTop: 0, marginBottom: 8 }}>{showUpdateForm ? "Update password" : "AirPalace Login"}</h2>
          {!showUpdateForm && (
            <p style={{ color: "#94a3b8", fontSize: 14, marginBottom: 16 }}>
              {mode === "login" ? "Ingresa con tu correo y contraseña." : mode === "signup" ? "Crea una cuenta con correo y contraseña." : "Receive a secure recovery link to reset your password."}
            </p>
          )}

          <>
            <label style={{ display: "block", fontSize: 13, marginBottom: 6 }}>Correo</label>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" style={inputStyle} />

            {mode !== "forgot" && (
              <>
                <label style={{ display: "block", fontSize: 13, marginBottom: 6 }}>Contraseña</label>
                <input type="password" required minLength={6} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="******" style={{ ...inputStyle, marginBottom: 14 }} />
              </>
            )}

            <button type="submit" disabled={loading} style={{ width: "100%", padding: 12, borderRadius: 10, border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, cursor: "pointer", opacity: loading ? 0.75 : 1 }}>
              {loading ? "Procesando..." : mode === "login" ? "Entrar" : mode === "signup" ? "Crear cuenta" : "Send reset link"}
            </button>

            <button type="button" onClick={() => { setMode(mode === "forgot" ? "login" : "forgot"); setMsg(""); }} style={{ width: "100%", marginTop: 10, padding: 10, border: "none", background: "transparent", color: "#93c5fd", fontWeight: 600, cursor: "pointer" }}>
              {mode === "forgot" ? "Back to login" : "Forgot password?"}
            </button>

            {signupEnabled && mode !== "forgot" && (
              <button type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMsg(""); }} style={{ width: "100%", marginTop: 4, padding: 12, borderRadius: 10, border: "1px solid #334155", background: "transparent", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
                {mode === "login" ? "Crear cuenta" : "Ya tengo cuenta, iniciar sesión"}
              </button>
            )}

            {msg && <p style={{ fontSize: 13, color: "#cbd5e1", marginTop: 12 }}>{msg}</p>}
          </>
        </form>)}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1 }}>{children}</div>
      <div style={{ display: "flex", justifyContent: "center", padding: "10px 14px 22px" }}>
        <button
          onClick={signOut}
          style={{
            width: "100%",
            maxWidth: 480,
            padding: "10px 14px",
            borderRadius: 11,
            border: "1px solid rgba(148,163,184,.45)",
            background: "linear-gradient(150deg,rgba(9,16,29,.9),rgba(16,28,45,.82))",
            color: "#dbe7fb",
            cursor: "pointer",
            fontWeight: 700,
            letterSpacing: 0.2,
          }}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
