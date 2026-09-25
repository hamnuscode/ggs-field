import { useLocalSearchParams, useRouter } from "expo-router";
import { CalendarRange, FileDown, IdCard, MoreHorizontal, Pencil, Phone } from "lucide-react-native";
import React, { useState } from "react";
import { Linking, View } from "react-native";
import { Screen } from "../../components/Screen";
import { Sheet, useOverlay } from "../../components/Sheet";
import { T } from "../../components/Text";
import { Avatar, Badge, Button, Card, Empty, Fields, HStack, IconBtn, ListCard, Row, Section, Tabs, toneOf } from "../../components/ui";
import { documentsFor, salaryHistory, shiftHistory, TODAY } from "../../data/seed";
import { attendance, clientName, siteName, useDB } from "../../data/store";
import { useAuth } from "../../lib/auth";
import { fmtDate, fmtMonth, fmtShort, pkr } from "../../lib/format";
import { useTheme } from "../../theme/ThemeProvider";
import { MARK } from "../attendance/marks";
import { EmpAction, EmployeeActionSheets } from "./actions";
import { cnicExpired } from "./Employees";

/** "Employee Profile" modal → a full screen with Profile | History tabs. */
export default function EmployeeDetail() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db } = useDB();
  const { can, canAny } = useAuth();
  const { toast } = useOverlay();
  const [tab, setTab] = useState<"profile" | "history">("profile");
  const [more, setMore] = useState(false);
  const [action, setAction] = useState<EmpAction>(null);
  const e = db.employees.find((x) => x.id === id);
  if (!e) return <Screen title="Employee"><Empty title="Employee not found" /></Screen>;

  const pay = canAny(["assignments.accounts", "payroll.view"]);
  const slips = db.payslips.filter((p) => p.employee_id === e.id);
  const adj = db.adjustments.filter((a) => a.employee_id === e.id);
  const today = attendance(db, e.id, TODAY);
  const hr = canAny(["assignments.hr", "employees.edit"]);

  return (
    <Screen
      eyebrow={e.code}
      title={e.name}
      actions={
        <>
          <IconBtn icon={Phone} label="Call" onPress={() => Linking.openURL(`tel:${e.phone}`).catch(() => {})} />
          {can("employees.edit") && <IconBtn icon={Pencil} label="Edit" onPress={() => router.push(`/employees/form?id=${e.id}`)} />}
          {hr && e.lifecycle === "active" && <IconBtn icon={MoreHorizontal} label="More actions" onPress={() => setMore(true)} />}
        </>
      }
      sticky={<Tabs value={tab} onChange={setTab} items={[{ key: "profile", label: "Profile" }, { key: "history", label: "History" }]} />}
    >
      <Card>
        <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
          <Avatar name={e.name} size={56} tone={e.lifecycle === "terminated" ? "danger" : "brand"} />
          <View style={{ flex: 1, gap: 6 }}>
            <T v="small" muted>{e.department} · {clientName(db, e.client_id)}</T>
            <HStack wrap gap={6}>
              <Badge label={e.status} tone={e.status === "On Leave" ? "warning" : toneOf(e.status)} dot />
              {today && e.lifecycle === "active" ? <Badge label={`Today: ${MARK[today].label}`} tone={MARK[today].tone} /> : null}
              {e.verified ? <Badge label="Identity verified" tone="success" small /> : <Badge label="Unverified" tone="warning" small />}
            </HStack>
          </View>
        </View>
      </Card>

      {tab === "profile" && (
        <>
          {(e.incomplete.length > 0 || cnicExpired(e)) && (
            <Card accent="warning" style={{ marginTop: 12 }}>
              <T v="smallStrong">Record needs attention</T>
              <T v="small" muted style={{ marginTop: 4 }}>{[...e.incomplete, ...(cnicExpired(e) ? ["CNIC expired " + fmtShort(e.cnic_expiry)] : [])].join(" · ")}</T>
            </Card>
          )}
          <Section title="Identity">
            <Card><Fields items={[
              { label: "Father's name", value: e.father_name },
              { label: "Date of birth", value: fmtDate(e.dob) },
              { label: "CNIC", value: e.cnic, mono: true },
              { label: "CNIC expiry", value: fmtDate(e.cnic_expiry), tone: cnicExpired(e) ? "danger" : undefined },
              { label: "Phone", value: e.phone, mono: true },
              { label: "Blood group", value: e.blood_group },
              { label: "Education", value: e.education },
              { label: "Ex-service", value: e.ex_service ? "Yes" : "No" },
              { label: "Address", value: e.address, full: true },
            ]} /></Card>
          </Section>
          <Section title="Posting">
            <Card><Fields items={[
              { label: "Client", value: clientName(db, e.client_id) },
              { label: "Site", value: siteName(db, e.site_id) },
              { label: "Shift", value: e.shift },
              { label: "Category", value: e.category.replace("_", " ") },
              { label: "Joined", value: fmtDate(e.join_date) },
              { label: "Region", value: db.branches.find((b) => b.id === e.branch_id)?.name ?? "—" },
            ]} /></Card>
          </Section>
          {pay && (
            <Section title="Pay">
              <Card><Fields items={[
                { label: "Base", value: pkr(e.base), mono: true },
                { label: "Allowance", value: pkr(e.allowance), mono: true },
                { label: "Per day", value: pkr(e.per_day), mono: true },
                { label: "Pay mode", value: e.pay_mode },
                { label: "Bank", value: e.bank },
                { label: "Account", value: e.account, mono: true },
              ]} /></Card>
            </Section>
          )}
          <Section title="Vetting & emergency">
            <Card><Fields items={[
              { label: "Police verification", value: <Badge label={e.police_verification} small /> },
              { label: "NADRA Verisys", value: <Badge label={e.verisys} small /> },
              { label: "Emergency contact", value: e.emergency_name },
              { label: "Emergency phone", value: e.emergency_phone, mono: true },
            ]} /></Card>
          </Section>
          <Section title="Documents" count={documentsFor(e).length}>
            <ListCard>
              {documentsFor(e).map((d, i, a) => <Row key={d.id} last={i === a.length - 1} title={d.name} meta={`${d.kind} · ${fmtShort(d.at)}`} onPress={() => toast(`Opening ${d.name}`, "info")} />)}
            </ListCard>
          </Section>
          <HStack style={{ marginTop: 16 }}>
            <Button label="Form PDF" icon={FileDown} variant="secondary" full onPress={() => toast("Employee form PDF saved", "info")} />
            <Button label="ID card" icon={IdCard} variant="secondary" full onPress={() => toast("ID card PDF saved", "info")} />
          </HStack>
        </>
      )}

      {tab === "history" && (
        <>
          <Section title="Employee ID history">
            <ListCard>
              <Row title={e.code} meta={`current · since ${fmtShort(e.join_date)}`} />
              <Row last title={e.permanent_code} meta="permanent code" />
            </ListCard>
          </Section>
          <Section title="Shift changes">
            <ListCard>{shiftHistory(e).map((s, i, a) => <Row key={i} last={i === a.length - 1} title={s.to} meta={`${fmtShort(s.date)} · by ${s.by}`} />)}</ListCard>
          </Section>
          {pay && (
            <Section title="Salary history">
              <ListCard>{salaryHistory(e).map((s, i, a) => <Row key={i} last={i === a.length - 1} title={pkr(s.base)} subtitle={s.reason} meta={`${fmtShort(s.effective)} · allowance ${pkr(s.allowance)}`} />)}</ListCard>
            </Section>
          )}
          {canAny(["payroll.view"]) && (
            <Section title="Payroll disbursements" count={slips.length}>
              <ListCard>
                {slips.map((p, i) => <Row key={p.id} last={i === slips.length - 1} title={fmtMonth(p.month)} meta={p.paid_on ? `${p.mode} · ${fmtShort(p.paid_on)}` : "not paid"} right={<View style={{ alignItems: "flex-end", gap: 4 }}><T v="mono">{pkr(p.net)}</T><Badge label={p.status} small /></View>} onPress={() => router.push(`/payroll/${p.id}`)} />)}
              </ListCard>
            </Section>
          )}
          {canAny(["payroll.adjust", "payroll.view"]) && (
            <Section title="Payslip corrections" count={adj.length}>
              {adj.length ? <ListCard>{adj.map((a, i) => <Row key={a.id} last={i === adj.length - 1} title={a.reason} meta={fmtMonth(a.month)} right={<T v="mono" color={a.amount < 0 ? t.tone("danger").text : t.tone("success").text}>{pkr(a.amount, { sign: true })}</T>} />)}</ListCard> : <T v="small" muted>None.</T>}
            </Section>
          )}
          {canAny(["attendance.view"]) && <Button label="Open attendance timesheet" icon={CalendarRange} variant="secondary" style={{ marginTop: 16 }} onPress={() => router.push(`/attendance/timesheet?employee=${e.id}`)} />}
        </>
      )}

      <Sheet open={more} onClose={() => setMore(false)} title="Actions" subtitle={e.name}>
        {([["client", "Change client"], ["category", "Change category"], ["shift", "Change shift"], ["transfer", "Transfer"], ["warnings", "Disciplinary warnings"], ["fire", "Fire / Resign"]] as [EmpAction, string][]).map(([k, label]) => (
          <Row key={k} title={<T v="bodyStrong" color={k === "fire" ? t.tone("danger").text : undefined}>{label}</T>} onPress={() => { setMore(false); setTimeout(() => setAction(k), 300); }} />
        ))}
      </Sheet>
      <EmployeeActionSheets e={e} action={action} onClose={() => setAction(null)} />
    </Screen>
  );
}
