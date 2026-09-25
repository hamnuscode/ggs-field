// The Supabase client, exactly as the build brief specifies (lib/supabase.ts).
// It is only created when both EXPO_PUBLIC_ vars are set. Without them the app
// runs in demo mode on local fixtures and never touches the network, which is
// the safe default: the anon key points at PRODUCTION and there is no dev DB.
import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, Platform } from "react-native";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient<Database> | null =
  url && anonKey
    ? createClient<Database>(url, anonKey, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })
    : null;

export const isLive = supabase !== null;

if (supabase && Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
