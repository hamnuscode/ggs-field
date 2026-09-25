import { ArrowRight, Moon, ShieldCheck, Sun } from "lucide-react-native";
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { T } from "../components/Text";
import { Avatar, Badge, Button, IconBtn, Input, tap } from "../components/ui";
import { branches, company, users } from "../data/seed";
import { useAuth } from "../lib/auth";
import { ROLE_LABEL } from "../lib/permissions";
import { isLive } from "../lib/supabase";
import { useThemeCtx } from "../theme/ThemeProvider";
import { radius } from "../theme/tokens";

export default function Login() {
  const { theme: t, setModePref } = useThemeCtx();
  const insets = useSafeAreaInsets();
  const { signIn, signInAs } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(await signIn(email, password));
    setBusy(false);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32, paddingHorizontal: 20 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: t.brand[500], alignItems: "center", justifyContent: "center" }}>
              <ShieldCheck size={22} color={t.onBrand} strokeWidth={2.4} />
            </View>
            <View>
              <T v="h3">Bastion Field</T>
              <T v="small" muted>{company.name}</T>
            </View>
          </View>
          <IconBtn icon={t.dark ? Sun : Moon} label="Toggle theme" onPress={() => setModePref(t.dark ? "light" : "dark")} />
        </View>

        {/* Post-board hero: the shifts a supervisor is about to open, as a strip of slots. */}
        <View style={{ marginTop: 40, marginBottom: 28 }}>
          <View style={{ flexDirection: "row", gap: 4, marginBottom: 18 }}>
            {Array.from({ length: 14 }, (_, i) => (
              <View key={i} style={{ flex: 1, height: 26, borderRadius: 4, backgroundColor: i === 9 ? t.tone("danger").solid : i === 4 || i === 12 ? t.tone("warning").solid : t.tone("success").solid, opacity: 0.25 + (i % 5) * 0.15 }} />
            ))}
          </View>
          <T v="eyebrow" color={t.tone("brand").text}>Field operations</T>
          <T v="display" style={{ fontSize: 38, lineHeight: 42, marginTop: 6 }}>Every post,{"\n"}every shift,{"\n"}accounted for.</T>
          <T v="body" muted style={{ marginTop: 10 }}>Sign in with the same account you use on the web app.</T>
        </View>

        <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@company.pk" autoComplete="email" />
        <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" autoComplete="password" onSubmitEditing={submit} />
        {error ? (
          <View style={{ backgroundColor: t.tone("danger").tint, borderRadius: radius.lg, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: t.tone("danger").line }}>
            <T v="smallStrong" color={t.tone("danger").text}>{error}</T>
          </View>
        ) : null}
        <Button label="Sign in" icon={ArrowRight} size="lg" loading={busy} onPress={submit} />

        {!isLive && (
          <View style={{ marginTop: 36 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <T v="eyebrow" soft>Demo personas</T>
              <Badge label="Local data" tone="info" small />
            </View>
            <T v="small" muted style={{ marginBottom: 14 }}>
              No Supabase keys are configured, so nothing leaves this device. Each persona holds a different permission set — the app hides what they can’t use, exactly as the web does.
            </T>
            {users.map((u) => (
              <Pressable
                key={u.id}
                disabled={!u.active}
                onPress={() => { tap(); signInAs(u.id); }}
                style={({ pressed }) => ({
                  flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radius.lg, marginBottom: 8,
                  backgroundColor: pressed ? t.muted : t.card, borderWidth: 1, borderColor: t.border, opacity: u.active ? 1 : 0.5,
                })}
              >
                <Avatar name={u.name} />
                <View style={{ flex: 1 }}>
                  <T v="smallStrong" style={{ fontSize: 14 }}>{u.name}</T>
                  <T v="small" muted numberOfLines={1}>{u.title}{u.branch_id ? ` · ${branches.find((b) => b.id === u.branch_id)?.name}` : ""}</T>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Badge label={ROLE_LABEL[u.role]} tone={u.role === "super_admin" ? "brand" : "neutral"} small />
                  <T v="mono" muted style={{ fontSize: 11 }}>{u.active ? (u.role === "super_admin" ? "all access" : `${u.permissions.length} perms`) : "deactivated"}</T>
                </View>
              </Pressable>
            ))}
          </View>
        )}
        <T v="small" muted center style={{ marginTop: 28 }}>Built by TechxServe</T>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
