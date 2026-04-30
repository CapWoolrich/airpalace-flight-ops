import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

const cardStyle = {
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

export default function UpdatePassword() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [linkInvalid, setLinkInvalid] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  const codeParam = useMemo(() => new URLSearchParams(window.location.search).get("code"), []);

  useEffect(() => {
    let mounted = true;

    async function bootstrapRecovery() {
      try {
        if (codeParam) {
          const { error } = await supabase.auth.exchangeCodeForSession(codeParam);
          if (error) throw new Error("invalid-recovery-link");
        }

        const { data, error } = await supabase.auth.getSession();
        if (error) throw new Error("invalid-recovery-link");

        const hash = window.location.hash || "";
        const looksLikeRecoveryHash = hash.includes("type=recovery") || hash.includes("access_token=");
        if (!data.session && !looksLikeRecoveryHash) {
          throw new Error("invalid-recovery-link");
        }
      } catch {
        if (mounted) setLinkInvalid(true);
      } finally {
        if (mounted) setReady(true);
      }
    }

    bootstrapRecovery();
    return () => {
      mounted = false;
    };
  }, [codeParam]);

  async function handleUpdatePassword(e) {
    e.preventDefault();
    setMsg("");

    if (newPassword.length < 8) {
      setMsg("Password must contain at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setMsg("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw new Error("update-failed");

      setMsg("Password updated successfully. Redirecting to login...");
      await supabase.auth.signOut();
      setTimeout(() => {
        window.location.href = "/";
      }, 2000);
    } catch {
      setLinkInvalid(true);
      setMsg("This recovery link is invalid or expired. Please request a new password reset link.");
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return (
      <div style={cardStyle}>
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>Update password</h2>
        <p style={{ color: "#cbd5e1", fontSize: 14 }}>Validating secure recovery link...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleUpdatePassword} style={cardStyle}>
      <img src="/logo_login1.png" alt="AirPalace" style={{ width: 140, display: "block", margin: "0 auto 14px" }} />
      <h2 style={{ marginTop: 0, marginBottom: 8 }}>Update password</h2>

      {linkInvalid ? (
        <>
          <p style={{ color: "#fca5a5", fontSize: 14, marginBottom: 12 }}>
            This recovery link is invalid or expired. Please request a new password reset link.
          </p>
          <button
            type="button"
            onClick={() => {
              window.location.href = "/";
            }}
            style={{ width: "100%", padding: 12, borderRadius: 10, border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, cursor: "pointer" }}
          >
            Back to forgot password
          </button>
        </>
      ) : (
        <>
          <label style={{ display: "block", fontSize: 13, marginBottom: 6 }}>New password</label>
          <input type="password" required minLength={8} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={inputStyle} />
          <label style={{ display: "block", fontSize: 13, marginBottom: 6 }}>Confirm password</label>
          <input type="password" required minLength={8} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={{ ...inputStyle, marginBottom: 14 }} />
          <button type="submit" disabled={loading} style={{ width: "100%", padding: 12, borderRadius: 10, border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, cursor: "pointer", opacity: loading ? 0.75 : 1 }}>
            Update password
          </button>
        </>
      )}

      {msg && <p style={{ fontSize: 13, color: "#cbd5e1", marginTop: 12 }}>{msg}</p>}
    </form>
  );
}
