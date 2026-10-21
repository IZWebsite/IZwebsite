import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async (s) => {
    setSession(s);
    if (!s) { setProfile(null); setRole(null); setLoading(false); return; }
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", s.user.id).maybeSingle(),
      supabase.rpc("my_role"),
    ]);
    setProfile(p); setRole(r || null); setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => loadUser(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setTimeout(() => loadUser(s), 0); });
    return () => sub.subscription.unsubscribe();
  }, [loadUser]);

  const value = {
    session, user: session?.user || null, profile, role, loading, isStaff: !!role,
    refreshProfile: () => loadUser(session),
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    magicLink: (email) => supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/account` } }),
    signUp: (email, password, meta) => supabase.auth.signUp({ email, password, options: { data: meta, emailRedirectTo: `${window.location.origin}/account` } }),
    resetPassword: (email) => supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` }),
    signOut: () => supabase.auth.signOut(),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

export const PERMS = {
  owner: ["view", "products", "orders", "refunds", "content", "coupons", "customers", "staff", "settings"],
  manager: ["view", "products", "orders", "refunds", "content", "coupons", "customers"],
  inventory: ["view", "products"],
  fulfilment: ["view", "orders"],
  analyst: ["view"],
};
export const can = (role, perm) => !!role && PERMS[role]?.includes(perm);
