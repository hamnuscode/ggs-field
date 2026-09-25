import { useRouter } from "expo-router";
import { AlertTriangle, CalendarCheck, FileSignature, Paperclip, ShieldAlert, Users, Wallet } from "lucide-react-native";
import React from "react";
import { View } from "react-native";
import { Bars, Columns, StatusBar } from "../components/Charts";
import { Screen } from "../components/Screen";
import { T } from "../components/Text";
import { Badge, Card, Empty, ListCard, Row, Section, Stat, StatGrid, toneOf } from "../components/ui";
import { attendance, clientName, reportState, useDB } from "../data/store";
import { TODAY, THIS_MONTH, LAST_MONTH } from "../data/seed";
import { useAuth } from "../lib/auth";
import { addDays, daysBetween, fmtDay, fmtShort, fmtTime, pkr } from "../lib/format";
import { inRegion, useRegion } from "../lib/region";
import { useTheme } from "../theme/ThemeProvider";

export default function Dashboard() {
  const t = useTheme();
  const router = useRouter();
  const { db } = useDB();
  const { profile, can, canAny } = useAuth();
  const { regionId } = useRegion();

  const clientsIn = db.clients.filter((c) => inRegion(regionId, c.branch_id));
  const clientIds = new Set(clientsIn.map((c) => c.id));
  const staff = db.employees.filter((e) => e.lifecycle === "active" && inRegion(regionId, e.branch_id));
  const guards = staff.filter((e) => e.category === "client");

  const today = { present: 0, absent: 0, leave: 0, double_duty: 0 };
  for (const e of guards) {
    const s = attendance(db, e.id, TODAY);
    if (s === "present" || s === "rest_day") today.present++;
    else if (s === "absent") today.absent++;
    else if (s === "leave") today.leave++;
    else if (s === "double_duty") today.double_duty++;
  }
  const slots = db.sites.filter((s) => clientIds.has(s.client_id)).flatMap((s) => s.shifts.map((sh) => reportState(db, s.id, sh.shift, TODAY)));
  const confirmed = slots.filter((x) => x === "confirmed").length;

  const trend = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(TODAY, i - 6);
    const p = guards.filter((e) => ["present", "double_duty", "rest_day"].includes(attendance(db, e.id, d) ?? "")).length;
    return { label: fmtDay(d).slice(0, 3), value: Math.round((p / Math.max(1, guards.length)) * 100) };
  });

  const monthExp = db.expenses.filter((x) => x.date.startsWith(THIS_MONTH));
  const lastExp = db.expenses.filter((x) => x.date.startsWith(LAST_MONTH)).reduce((a, x) => a + x.amount, 0);
  const expTotal = monthExp.reduce((a, x) => a + x.amount, 0);
  const payrollMonth = db.payslips.filter((p) => p.month === THIS_MONTH).reduce((a, p) => a + p.net, 0);
  const openInc = db.incidents.filter((i) => clientIds.has(i.client_id) && (i.status === "open" || i.status === "under_investigation"));
  const due = db.importantDates.filter((d) => daysBetween(TODAY, d.date) <= 60).sort((a, b) => a.date.localeCompare(b.date));
  const overdue = due.filter((d) => d.date < TODAY).length;
  const ending = db.contracts.filter((k) => k.status === "active" && daysBetween(TODAY, k.end) <= 60 && clientIds.has(k.client_id));

  const stats: Stat[] = [];
  if (canAny(["employees.view", "employees.edit"])) stats.push({ label: "Employees", value: String(staff.length), tone: "brand", hint: `${guards.length} on client posts`, icon: Users, onPress: () => router.push("/employees") });
  if (canAny(["contracts.view", "contracts.edit"])) stats.push({ label: "Active contracts", value: String(db.contracts.filter((k) => k.status === "active" && clientIds.has(k.client_id)).length), tone: "brand", icon: FileSignature, onPress: () => router.push("/contracts") });
  if (canAny(["incidents.view", "incidents.edit"])) stats.push({ label: "Open incidents", value: String(openInc.length), tone: openInc.length ? "danger" : "info", icon: ShieldAlert, onPress: () => router.push("/incidents") });
  if (canAny(["compliance.view", "compliance.edit"])) stats.push({ label: "Compliance < 30d", value: String(due.filter((d) => daysBetween(TODAY, d.date) <= 30).length), tone: overdue ? "danger" : "warning", hint: overdue ? `${overdue} overdue` : "none overdue", icon: AlertTriangle, onPress: () => router.push("/compliance") });
  if (canAny(["expenses.view", "expenses.edit"])) stats.push({ label: "Expenses · month", value: pkr(expTotal, { compact: true }), tone: "danger", hint: lastExp ? `${expTotal > lastExp ? "▲" : "▼"} vs ${pkr(lastExp, { compact: true })} last` : undefined, icon: Wallet, onPress: () => router.push("/expenses") });
  if (canAny(["payroll.view", "payroll.edit"])) stats.push({ label: "Payroll · month", value: pkr(payrollMonth, { compact: true }), tone: "warning", icon: Wallet, onPress: () => router.push("/payroll") });

  const byCat = Object.entries(monthExp.reduce<Record<string, number>>((a, x) => ((a[x.category] = (a[x.category] ?? 0) + x.amount), a), {}))
    .sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value]) => ({ label, value }));

  const topClients = clientsIn.map((c) => ({
    label: c.name,
    value: db.invoices.filter((i) => i.client_id === c.id).flatMap((i) => i.payments).filter((p) => p.date.startsWith(THIS_MONTH)).reduce((a, p) => a + p.amount, 0),
  })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value).slice(0, 5);

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <Screen region eyebrow={fmtDay(TODAY)} title={`${greet}, ${profile?.name.split(" ")[0]}`}>
      {can("attendance.view") || can("attendance.edit") ? (
        <Card onPress={() => router.push("/attendance")} style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
            <View>
              <T v="eyebrow" muted>Attendance today</T>
              <T v="display" style={{ marginTop: 6 }}>
                {today.present + today.double_duty}
                <T v="title" muted> / {guards.length} on ground</T>
              </T>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Badge label={`${confirmed}/${slots.length} confirmed`} tone={confirmed === slots.length ? "success" : "warning"} />
              <T v="small" muted style={{ marginTop: 6 }}>shift reports</T>
            </View>
          </View>
          <StatusBar parts={[
            { label: "Present", value: today.present, tone: "success" },
            { label: "Double duty", value: today.double_duty, tone: "info" },
            { label: "Leave", value: today.leave, tone: "warning" },
            { label: "Absent", value: today.absent, tone: "danger" },
          ]} />
        </Card>
      ) : null}

      {stats.length > 0 && <StatGrid items={stats} />}
      {stats.length === 0 && !can("attendance.view") ? <Card><Empty icon={CalendarCheck} title="Nothing to show yet" sub="Your permissions don't include any dashboard widgets. Use Menu to reach your pages." /></Card> : null}

      {(can("attendance.view") || can("attendance.edit")) && (
        <Section title="Attendance trend · last 7 days">
          <Card>
            <Columns data={trend} format={(n) => `${n}% on ground`} tone="success" />
          </Card>
        </Section>
      )}

      {can("banks.view") && (
        <Section title="Bank accounts" count={db.banks.length} action={<T v="smallStrong" color={t.tone("brand").text} onPress={() => router.push("/accounting?tab=banks")}>Open</T>}>
          <ListCard>
            {db.banks.map((b, i) => (
              <Row key={b.id} title={b.name} meta={b.number} last={i === db.banks.length - 1} right={<T v="mono" style={{ fontSize: 14 }}>{pkr(b.balance, { compact: true })}</T>} />
            ))}
          </ListCard>
        </Section>
      )}

      {can("receivables.view") && topClients.length > 0 && (
        <Section title="Top clients · payments this month">
          <Card><Bars data={topClients} format={(n) => pkr(n, { compact: true })} /></Card>
        </Section>
      )}

      {canAny(["expenses.view", "expenses.edit"]) && byCat.length > 0 && (
        <Section title="Expenses by category">
          <Card><Bars data={byCat} format={(n) => pkr(n, { compact: true })} /></Card>
        </Section>
      )}

      <Section title="Live activity">
        <ListCard>
          {db.activity.map((a, i) => (
            <Row
              key={a.id}
              last={i === db.activity.length - 1}
              left={<View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.tone(a.tone).solid }} />}
              title={<T v="small" style={{ fontSize: 14 }}><T v="smallStrong" style={{ fontSize: 14 }}>{a.who}</T> {a.what}</T>}
              meta={a.at.startsWith(TODAY) ? `Today ${fmtTime(a.at)}` : `${fmtShort(a.at)} ${fmtTime(a.at)}`}
            />
          ))}
        </ListCard>
      </Section>

      {canAny(["compliance.view", "compliance.edit"]) && (
        <Section title="Compliance · overdue & next 60 days" count={due.length}>
          <ListCard>
            {due.map((d, i) => {
              const n = daysBetween(TODAY, d.date);
              return <Row key={d.id} last={i === due.length - 1} title={d.title} subtitle={`${d.category} · ${fmtShort(d.date)}`} right={<Badge label={n < 0 ? `${-n}d overdue` : `${n}d`} tone={n < 0 ? "danger" : n <= 14 ? "warning" : "neutral"} />} onPress={() => router.push("/compliance")} />;
            })}
          </ListCard>
        </Section>
      )}

      {canAny(["contracts.view", "contracts.edit"]) && ending.length > 0 && (
        <Section title="Contracts ending" count={ending.length}>
          <ListCard>
            {ending.map((k, i) => (
              <Row key={k.id} last={i === ending.length - 1} title={clientName(db, k.client_id)} meta={k.code} right={<Badge label={`${daysBetween(TODAY, k.end)}d left`} tone="warning" />} onPress={() => router.push(`/contracts/${k.id}`)} />
            ))}
          </ListCard>
        </Section>
      )}

      {canAny(["incidents.view", "incidents.edit"]) && (
        <Section title="Recent incidents">
          <ListCard>
            {db.incidents.slice(0, 4).map((x, i) => (
              <Row key={x.id} last={i === 3} title={x.description} meta={`${x.code} · ${clientName(db, x.client_id)}`} right={<Badge label={x.severity} tone={x.severity === "critical" ? "danger" : toneOf(x.severity)} solid={x.severity === "critical"} small />} onPress={() => router.push("/incidents")} />
            ))}
          </ListCard>
        </Section>
      )}

      {canAny(["period_close.manage", "reports.view"]) && (
        <Section title="Period close status">
          <Card>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {db.periods.slice().reverse().map((p) => (
                <View key={p.month} style={{ flex: 1, alignItems: "center", gap: 6 }}>
                  <View style={{ width: "100%", height: 28, borderRadius: 6, backgroundColor: p.status === "closed" ? t.tone("success").tint : t.tone("warning").tint, borderWidth: 1, borderColor: p.status === "closed" ? t.tone("success").line : t.tone("warning").line }} />
                  <T v="small" muted style={{ fontSize: 11 }}>{p.month.slice(5)}</T>
                </View>
              ))}
            </View>
            <T v="small" muted style={{ marginTop: 10 }}>{db.periods.filter((p) => p.status === "open").length} months open · the rest closed</T>
          </Card>
        </Section>
      )}

      <Section title="Attachments" count={db.attachments.length}>
        <ListCard>
          {db.attachments.map((a, i) => (
            <Row key={a.id} last={i === db.attachments.length - 1} left={<Paperclip size={16} color={t.mutedFg} />} title={a.name} meta={`${a.size} · ${fmtShort(a.at)}`} />
          ))}
        </ListCard>
      </Section>
    </Screen>
  );
}
