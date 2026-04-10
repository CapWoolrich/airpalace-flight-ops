import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export default function AuthGate({ children }) {
  const [session, setSession] = useState(null);
  const [mode, setMode] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg("");
    setLoading(true);

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) throw error;

        setMsg("Cuenta creada. Si tu proyecto exige confirmación por email, revisa tu correo. Si no, ya puedes iniciar sesión.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

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

  if (!session) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: "#0c1220",
          color: "#fff",
          fontFamily: "-apple-system,sans-serif",
        }}
      >
        <form
          onSubmit={handleSubmit}
          style={{
            width: "100%",
            maxWidth: 380,
            background: "#111827",
            padding: 20,
            borderRadius: 16,
            boxShadow: "0 10px 30px rgba(0,0,0,.25)",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: 8 }}>AirPalace Login</h2>

          <p style={{ color: "#94a3b8", fontSize: 14, marginBottom: 16 }}>
            {mode === "login"
              ? "Ingresa con tu correo y contraseña."
              : "Crea una cuenta con correo y contraseña."}
          </p>

          <label style={{ display: "block", fontSize: 13, marginBottom: 6 }}>
            Correo
          </label>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 10,
              border: "1px solid #334155",
              marginBottom: 12,
              outline: "none",
              boxSizing: "border-box",
            }}
          />

          <label style={{ display: "block", fontSize: 13, marginBottom: 6 }}>
            Contraseña
          </label>
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="******"
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 10,
              border: "1px solid #334155",
              marginBottom: 14,
              outline: "none",
              boxSizing: "border-box",
            }}
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 10,
              border: "none",
              background: "#2563eb",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
              opacity: loading ? 0.75 : 1,
            }}
          >
            {loading
              ? "Procesando..."
              : mode === "login"
              ? "Entrar"
              : "Crear cuenta"}
          </button>

          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setMsg("");
            }}
            style={{
              width: "100%",
              marginTop: 10,
              padding: 12,
              borderRadius: 10,
              border: "1px solid #334155",
              background: "transparent",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {mode === "login"
              ? "Crear cuenta"
              : "Ya tengo cuenta, iniciar sesión"}
          </button>

          {msg && (
            <p style={{ fontSize: 13, color: "#cbd5e1", marginTop: 12 }}>
              {msg}
            </p>
          )}
        </form>
      </div>
    );
  }

  return (
    <>
      <div style={{ position: "fixed", top: 10, right: 10, zIndex: 2000 }}>
        <button
          onClick={signOut}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "none",
            background: "#111827",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Salir
        </button>
      </div>
      {children}
    </>
  );
}
