// Auth, following the build brief: same accounts as web, profile row carries
// role + permissions, can() mirrors hasPermission. With no Supabase env the app
// offers demo personas so every permission path can be walked without a login.
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";
import { users } from "../data/seed";
import { hasAny, hasPermission, UserRole } from "./permissions";
import { isLive, supabase } from "./supabase";

export type Profile = {
  id: string;
  name: string;
  email: string;
  title: string;
  role: UserRole;
  permissions: string[];
  branch_id: string | null;
  employee_id: string | null;
};

type AuthCtx = {
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signInAs: (userId: string) => void;
  signOut: () => Promise<void>;
  can: (key: string) => boolean;
  canAny: (keys: string[]) => boolean;
};

const Ctx = createContext<AuthCtx | null>(null);
const DEMO_KEY = "ggs.demoUser";

const fromDemo = (id: string): Profile | null => {
  const u = users.find((x) => x.id === id);
  return u ? { id: u.id, name: u.name, email: u.email, title: u.title, role: u.role, permissions: u.permissions, branch_id: u.branch_id, employee_id: u.employee_id } : null;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(userId: string, email: string) {
    if (!supabase) return;
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (data) {
      setProfile({
        id: userId, email, name: data.full_name ?? email, title: data.title ?? "", role: data.role,
        permissions: data.permissions ?? [], branch_id: data.branch_id ?? null, employee_id: data.employee_id ?? null,
      });
    }
  }

  useEffect(() => {
    if (isLive && supabase) {
      supabase.auth.getSession().then(async ({ data }) => {
        if (data.session) await loadProfile(data.session.user.id, data.session.user.email ?? "");
        setLoading(false);
      });
      const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
        if (session) loadProfile(session.user.id, session.user.email ?? "");
        else setProfile(null);
      });
      return () => sub.subscription.unsubscribe();
    }
    AsyncStorage.getItem(DEMO_KEY)
      .then((id) => { if (id) setProfile(fromDemo(id)); })
      .finally(() => setLoading(false));
  }, []);

  const value: AuthCtx = {
    profile,
    loading,
    async signIn(email, password) {
      if (supabase) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return error ? error.message : null;
      }
      const u = users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
      if (!u) return "No demo account with that email. Pick a persona below.";
      if (!u.active) return "This account is deactivated.";
      value.signInAs(u.id);
      return null;
    },
    signInAs(userId) {
      setProfile(fromDemo(userId));
      AsyncStorage.setItem(DEMO_KEY, userId).catch(() => {});
    },
    async signOut() {
      if (supabase) await supabase.auth.signOut();
      AsyncStorage.removeItem(DEMO_KEY).catch(() => {});
      setProfile(null);
    },
    can: (k) => hasPermission(profile, k),
    canAny: (ks) => hasAny(profile, ks),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("AuthProvider missing");
  return c;
}
