import { useLocalSearchParams } from "expo-router";
import { BadgeCheck, Download, Undo2 } from "lucide-react-native";
import React, { useState } from "react";
import { View } from "react-native";
import { MonthStepper } from "../../components/MonthGrid";
import { Screen } from "../../components/Screen";
import { useOverlay } from "../../components/Sheet";
import { T } from "../../components/Text";
import { Badge, Banner, Button, Card, Chips, Empty, Section, StatGrid } from "../../components/ui";
import { AttStatus, THIS_MONTH } from "../../data/seed";
import { attendance, siteName, useDB } from "../../data/store";
import { useAuth } from "../../lib/auth";
import { daysInMonth, fmtMonth } from "../../lib/format";
import { SHIFT_LABEL } from "./Attendance";
import { MARK, MarkCell } from "./marks";

/**
 * The Monthly Board. On web it is the Excel grid: 4 frozen columns (402px) + up to ~93
 * day columns — unreachable on a 390px phone (handoff A4). The phone answer is the
 * per-guard vertical list: one card per guard, the month as a wrapping strip of day
 * cells, the same P/A/L/DD/X marks and totals. Same data, readable one-handed.
 */
export default function MonthlyBoard() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const { db, commit } = useDB();
  const { can } = useAuth();
  const { toast, confirm } = useOverlay();
  const [month, setMonth] = useState(THIS_MONTH);
  const [siteF, setSiteF] = useState<string>("all");
  const client = db.clients.find((c) => c.id === clientId);
  if (!client) return <Screen title="Monthly board"><Empty title="Client not found" /></Screen>;

  const sites = db.sites.filter((s) => s.client_id === client.id);
  const staff = db.employees.filter((e) => e.client_id === client.id && e.lifecycle === "active" && (siteF === "all" || e.site_id === siteF));
  const days = Array.from({ length: daysInMonth(month) }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  const verified = db.monthlyVerified[client.id] ?? false;

  const tally = (id: string) => {
    const out: Partial<Record<AttStatus, number>> = {};
    for (const d of days) {
      const s = attendance(db, id, d);
      if (s) out[s] = (out[s] ?? 0) + 1;
    }
    return out;
  };
  const totals = staff.reduce(
    (a, e) => {
      const x = tally(e.id);
      a.p += x.present ?? 0; a.a += x.absent ?? 0; a.l += x.leave ?? 0; a.dd += x.double_duty ?? 0;
      return a;
    },
    { p: 0, a: 0, l: 0, dd: 0 },
  );

  return (
    <Screen
      eyebrow="Monthly board"
      title={client.name}
      subtitle={`${staff.length} guards · ${fmtMonth(month)}`}
      footer={
        <>
          <Button label="Download" icon={Download} variant="secondary" full onPress={() => toast("Monthly board PDF saved", "info")} />
          {can("attendance.ops_verify") &&
            (verified ? (
              <Button label="Un-verify" icon={Undo2} variant="secondary" full onPress={async () => {
                if (await confirm({ title: "Un-verify this month?", message: "Payroll for this client moves back to 'OPS unverified'.", confirmLabel: "Un-verify", tone: "danger" })) {
                  commit((d) => { d.monthlyVerified[client.id] = false; });
                  toast("OPS verification removed", "warning");
                }
              }} />
            ) : (
              <Button label="OPS verify" icon={BadgeCheck} full onPress={async () => {
                if (await confirm({ title: `Verify ${fmtMonth(month)}?`, message: "Confirms every mark on this board is correct. Payroll uses it as the source of truth.", confirmLabel: "Verify" })) {
                  commit((d) => { d.monthlyVerified[client.id] = true; });
                  toast("Month OPS-verified");
                }
              }} />
            ))}
        </>
      }
    >
      <MonthStepper month={month} onChange={setMonth} />
      <View style={{ marginTop: 12 }}>
        {verified ? <Banner tone="success" title="OPS verified" sub="Locked for payroll. Un-verify to correct a mark." /> : <Banner tone="warning" title="Not yet verified" sub="Payroll will flag this client as OPS unverified." />}
      </View>
      <StatGrid cols={2} items={[
        { label: "Present", value: String(totals.p), tone: "success" },
        { label: "Absent", value: String(totals.a), tone: "danger" },
        { label: "Leave", value: String(totals.l), tone: "warning" },
        { label: "Double duty", value: String(totals.dd), tone: "info" },
      ]} />
      {sites.length > 1 && (
        <View style={{ marginTop: 12 }}>
          <Chips value={siteF} onChange={setSiteF} items={[{ key: "all", label: "All sites" }, ...sites.map((s) => ({ key: s.id, label: s.name }))]} />
        </View>
      )}

      <Section title="Guards" count={staff.length}>
        {staff.map((e, i) => {
          const x = tally(e.id);
          return (
            <Card key={e.id} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
                <T v="mono" muted style={{ width: 22 }}>{String(i + 1).padStart(2, "0")}</T>
                <View style={{ flex: 1 }}>
                  <T v="smallStrong" style={{ fontSize: 15 }}>{e.name}</T>
                  <T v="mono" muted style={{ fontSize: 11 }}>{e.code} · {e.department} · {SHIFT_LABEL[e.shift]} · {siteName(db, e.site_id)}</T>
                </View>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                {days.map((d) => (
                  <View key={d} style={{ alignItems: "center", gap: 1 }}>
                    <MarkCell s={attendance(db, e.id, d)} size={25} label={String(Number(d.slice(8)))} />
                  </View>
                ))}
              </View>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                {(["present", "absent", "leave", "double_duty", "rest_day"] as AttStatus[]).map((s) => (
                  <Badge key={s} small label={`${MARK[s].code} ${x[s] ?? 0}`} tone={MARK[s].tone} />
                ))}
              </View>
            </Card>
          );
        })}
      </Section>
    </Screen>
  );
}
