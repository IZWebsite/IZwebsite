import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase, errMsg } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useSeo } from "../lib/seo";
import { Field, Spinner } from "../components/Bits";

export default function Auth() {
  const { pathname } = useLocation();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { user, signIn, signUp, resetPassword, magicLink } = useAuth();
  const [mode, setMode] = useState(pathname === "/register" ? "register" : pathname === "/reset-password" ? "reset" : "login");
  const [f, setF] = useState({ email: "", password: "", name: "", cc: "+91", phone: "", wa: false, mk: false });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState("");
  useSeo({ title: mode === "register" ? "Create account" : "Log in", noindex: true });
  const next = sp.get("next") || "/account";

  useEffect(() => { if (user && mode === "login") nav(next); }, [user, mode, nav, next]);

  const up = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const run = async (e) => {
    e.preventDefault(); setBusy(true);
    let r;
    if (mode === "login") r = await signIn(f.email, f.password);
    else if (mode === "magic") { r = await magicLink(f.email); if (!r.error) setSent("Check your inbox for a secure login link."); }
    else if (mode === "forgot") { r = await resetPassword(f.email); if (!r.error) setSent("If an account exists, a reset link is on its way."); }
    else if (mode === "reset") { r = await supabase.auth.updateUser({ password: f.password }); if (!r.error) { toast.success("Password updated"); nav("/account"); } }
    else {
      if (f.password.length < 8) { setBusy(false); return toast.error("Password must be at least 8 characters"); }
      const phone = `${f.cc}${f.phone.replace(/\D/g, "")}`;
      if (!/^\+[1-9][0-9]{7,14}$/.test(phone)) { setBusy(false); return toast.error("Please enter a valid mobile number"); }
      r = await signUp(f.email, f.password, { full_name: f.name, phone, whatsapp_opt_in: f.wa, marketing_opt_in: f.mk });
      if (!r.error) setSent("Almost there! We've emailed you a verification link. Please confirm your email to log in.");
    }
    setBusy(false);
    if (r?.error) toast.error(errMsg(r.error));
  };

  const titles = { login: "Welcome back", register: "Create your account", forgot: "Reset password", reset: "Choose a new password", magic: "Email me a login link" };
  return (
    <div className="container-x py-14 md:py-20 max-w-md" data-testid="auth-page">
      <p className="eyebrow mb-3">Account</p>
      <h1 className="font-display text-4xl mb-8">{titles[mode]}</h1>
      {sent ? <p className="card-x p-5 text-sm" data-testid="auth-sent-message">{sent}</p> : (
        <form onSubmit={run} className="space-y-4">
          {mode === "register" && <>
            <Field label="Full name"><input required className="input" value={f.name} onChange={up("name")} data-testid="register-name-input" /></Field>
            <Field label="Mobile number"><div className="flex gap-2"><select className="input w-24" value={f.cc} onChange={up("cc")}><option>+91</option><option>+1</option><option>+44</option><option>+971</option><option>+65</option></select><input required className="input" inputMode="tel" value={f.phone} onChange={up("phone")} data-testid="register-phone-input" /></div></Field>
          </>}
          {mode !== "reset" && <Field label="Email"><input required type="email" className="input" value={f.email} onChange={up("email")} autoComplete="email" data-testid="auth-email-input" /></Field>}
          {["login", "register", "reset"].includes(mode) && <Field label="Password" hint={mode !== "login" ? "At least 8 characters" : null}><input required type="password" minLength={mode === "login" ? 1 : 8} className="input" value={f.password} onChange={up("password")} autoComplete={mode === "login" ? "current-password" : "new-password"} data-testid="auth-password-input" /></Field>}
          {mode === "register" && <>
            <label className="flex gap-2 text-sm"><input type="checkbox" checked={f.wa} onChange={up("wa")} data-testid="register-whatsapp-consent" />Send order updates on WhatsApp</label>
            <label className="flex gap-2 text-sm"><input type="checkbox" checked={f.mk} onChange={up("mk")} data-testid="register-marketing-consent" />Email me new launches and offers</label>
            <p className="text-xs text-muted-foreground">By creating an account you agree to our <Link to="/pages/terms" className="link-u">terms</Link> and <Link to="/pages/privacy" className="link-u">privacy policy</Link>.</p>
          </>}
          <button className="btn-primary w-full" disabled={busy} data-testid="auth-submit-btn">{busy ? <Spinner /> : { login: "Log in", register: "Create account", forgot: "Send reset link", reset: "Update password", magic: "Send link" }[mode]}</button>
        </form>
      )}
      <div className="mt-8 space-y-2 text-sm">
        {mode === "login" && <><button className="link-u block" onClick={() => setMode("forgot")} data-testid="forgot-password-link">Forgot password?</button><button className="link-u block" onClick={() => setMode("magic")} data-testid="magic-link-btn">Email me a login link instead</button><p>New here? <button className="link-u" onClick={() => { setMode("register"); setSent(""); }} data-testid="go-register-link">Create an account</button></p></>}
        {mode !== "login" && mode !== "reset" && <p>Already have an account? <button className="link-u" onClick={() => { setMode("login"); setSent(""); }} data-testid="go-login-link">Log in</button></p>}
      </div>
    </div>
  );
}
