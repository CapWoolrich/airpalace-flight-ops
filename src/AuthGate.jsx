import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export default function AuthGate({ children }) {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signIn(e) {
    e.preventDefault();
    setMsg("Enviando acceso...");
    const { error } = await supabase.auth.signInWithOtp({ email });
    setMsg(error ? error.message : "Revisa tu correo para entrar.");
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
          onSubmit={signIn}
          style={{
            width: "100%",
            maxWidth: 360,
            background: "#111827",
            padding: 20,
            borderRadius: 16,
          }}
        >
          <h2 style={{ marginTop: 0 }}>AirPalace Login</h2>
          <p style={{ color: "#94a3b8", fontSize: 14 }}>
            Acceso para usuarios autorizados.
          </p>

          <input
            type="email"
            required
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
            }}
          />

          <button
            type="submit"
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 10,
              border: "none",
              background: "#2563eb",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Enviar acceso
          </button>

          {msg && <p style={{ fontSize: 13, color: "#cbd5e1" }}>{msg}</p>}
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
