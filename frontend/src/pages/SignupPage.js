import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function SignupPage() {
  const { signup } = useAuth();
  const navigate   = useNavigate();
  const [form, setForm]   = useState({ username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy]   = useState(false);

  const handle = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await signup(form.username, form.email, form.password);
      navigate("/notes");
    } catch (err) {
      setError(err.response?.data?.detail || "Signup failed");
    } finally {
      setBusy(false);
    }
  };

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  return (
    <div className="auth-page">
      <div className="auth-box">
        <div className="auth-logo">🗂 Personal Organizer</div>
        <div className="auth-sub">Create your local workspace</div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handle}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input className="form-input" value={form.username} onChange={set("username")} required />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input type="email" className="form-input" value={form.email} onChange={set("email")} required />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input type="password" className="form-input" value={form.password} onChange={set("password")} required minLength={6} />
          </div>
          <button className="btn btn-primary" style={{ width:"100%", justifyContent:"center" }} disabled={busy}>
            {busy ? <span className="spinner" /> : "Create account"}
          </button>
        </form>
        <p style={{ marginTop: 16, fontSize: 14, color: "var(--text-muted)", textAlign: "center" }}>
          Have an account? <Link to="/login" style={{ color: "var(--accent)" }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
