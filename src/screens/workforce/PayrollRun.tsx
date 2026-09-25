import { ArrowLeft, ArrowRight, BadgeCheck, ChevronDown, ChevronRight, Lock } from "lucide-react-native";
import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { Screen } from "../../components/Screen";
import { useOverlay } from "../../components/Sheet";
import { T } from "../../components/Text";
import { Badge, Banner, Button, Card, Empty, HStack, SearchBar, Segmented, StatGrid, tap } from "../../components/ui";
import { THIS_MONTH } from "../../data/seed";
import { useDB } from "../../data/store";
import { useAuth } from "../../lib/auth";
import { fmtMonth, pkr } from "../../lib/format";
import { useTheme } from "../../theme/ThemeProvider";
import { Payslips } from "./Payroll";

type Stage = "draft" | "review" | "finance";

/** Draft → Review → Finance Verify. Review is a single-open accordion that embeds the payslip table (handoff A2). */
export default function PayrollRun() {
  const t = useTheme();
  const { db, commit } = useDB();
  const { can } = useAuth();
  const { toast, confirm } = useOverlay();
  const [stage, setStage] = useState<Stage>("draft");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const scopes = db.payrollScopes.filter((s) => s.stage === stage && (!q || s.name.toLowerCase().includes(q.toLowerCase())));
  if (expanded && !scopes.some((s) => s.key === expanded)) setTimeout(() => setExpanded(null), 0);

  const scopeSlips = (key: string) => db.payslips.filter((p) => {
    if (p.month !== THIS_MONTH) return false;
    const e = db.employees.find((x) => x.id === p.employee_id)!;
    return key === "office" ? e.category === "office_staff" : key === "relievers" ? e.category === "reliever" : e.client_id === key;
  });
  const inView = expanded ? scopeSlips(expanded) : db.payrollScopes.filter((s) => s.stage === "review").flatMap((s) => scopeSlips(s.key));
  const move = (key: string, to: Stage, msg: string) => { commit((d) => { d.payrollScopes.find((s) => s.key === key)!.stage = to; }); setExpanded(null); toast(msg); };

  return (
    <Screen
      eyebrow={`Workforce · ${fmtMonth(THIS_MONTH)}`}
      title="Payroll Run"
      sticky={
        <>
          <Segmented value={stage} onChange={(s) => { setStage(s); setExpanded(null); }} items={(["draft", "review", "finance"] as Stage[]).map((s) => ({ key: s, label: s === "finance" ? "Finance" : s[0]!.toUpperCase() + s.slice(1), count: db.payrollScopes.filter((x) => x.stage === s).length }))} />
          <SearchBar value={q} onChange={setQ} placeholder="Search scopes" />
        </>
      }
    >
      {stage === "review" && (
        <StatGrid items={[
          { label: expanded ? "Salaries · this scope" : "Salaries · all review", value: pkr(inView.reduce((a, p) => a + p.net, 0), { compact: true }), tone: "success" },
          { label: "Advance", value: pkr(inView.reduce((a, p) => a + p.advance, 0), { compact: true }), tone: "danger" },
        ]} />
      )}
      {stage === "finance" && <Banner tone="info" title="Finance Verify is permanent" sub="A verified scope is locked for the month. Corrections go through adjustments." />}

      {scopes.map((s) => {
        const open = expanded === s.key;
        const slips = scopeSlips(s.key);
        return (
          <Card key={s.key} pad={0} style={{ marginTop: 10 }}>
            <Pressable disabled={stage !== "review"} onPress={() => { tap(); setExpanded(open ? null : s.key); }} style={{ padding: 14, gap: 10 }}>
              <HStack>
                {stage === "review" ? (open ? <ChevronDown size={18} color={t.mutedFg} /> : <ChevronRight size={18} color={t.mutedFg} />) : null}
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong">{s.name}</T>
                  <T v="mono" muted style={{ fontSize: 12 }}>{slips.length} payslips · {pkr(slips.reduce((a, p) => a + p.net, 0), { compact: true })}</T>
                </View>
                {s.kind !== "client" ? <Badge label="not verifiable" small tone="neutral" /> : s.ops_verified ? <Badge label="OPS verified" tone="success" small /> : <Badge label="OPS unverified" tone="warning" small />}
              </HStack>
              {stage === "draft" && can("payroll.edit") && <Button size="sm" label="Send to review" icon={ArrowRight} onPress={() => move(s.key, "review", `${s.name} sent to review`)} />}
              {stage === "review" && can("payroll.edit") && (
                <HStack>
                  <Button size="sm" variant="secondary" label="Back to draft" icon={ArrowLeft} onPress={() => move(s.key, "draft", `${s.name} back to draft`)} />
                  <Button size="sm" label="Send to finance" icon={ArrowRight} disabled={s.kind === "client" && !s.ops_verified} onPress={() => move(s.key, "finance", `${s.name} sent to finance`)} />
                </HStack>
              )}
              {stage === "finance" && (s.finance_verified ? (
                <HStack><Lock size={14} color={t.tone("success").text} /><T v="smallStrong" color={t.tone("success").text}>Finance verified · locked</T></HStack>
              ) : can("payroll.approve") ? (
                <Button size="sm" label="Finance Verify" icon={BadgeCheck} onPress={async () => {
                  if (await confirm({ title: "Finance Verify — permanent", message: `Locks ${s.name}'s payroll for ${fmtMonth(THIS_MONTH)}. This can't be undone.`, confirmLabel: "Verify", tone: "danger" })) {
                    commit((d) => { d.payrollScopes.find((x) => x.key === s.key)!.finance_verified = true; });
                    toast(`${s.name} finance verified`);
                  }
                }} />
              ) : <T v="small" muted>Awaiting a payroll approver.</T>)}
            </Pressable>
            {open && (
              <View style={{ borderTopWidth: 1, borderTopColor: t.border, padding: 12 }}>
                <Payslips clientScope={s.key} />
              </View>
            )}
          </Card>
        );
      })}
      {scopes.length === 0 && <Empty title={`Nothing in ${stage === "finance" ? "Finance Verify" : stage}`} />}
    </Screen>
  );
}
