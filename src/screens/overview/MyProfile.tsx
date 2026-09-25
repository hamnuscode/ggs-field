import React from "react";
import { View } from "react-native";
import { MonthGrid } from "../../components/MonthGrid";
import { Screen } from "../../components/Screen";
import { T } from "../../components/Text";
import { Avatar, Badge, Card, Empty, Fields, ListCard, RecordCard, Row, Section, StatGrid } from "../../components/ui";
import { documentsFor, THIS_MONTH, TODAY } from "../../data/seed";
import { attendance, clientName, useDB } from "../../data/store";
import { useAuth } from "../../lib/auth";
import { daysInMonth, fmtMonth, fmtShort, pkr } from "../../lib/format";
import { MarkTag } from "../attendance/marks";

/** A logged-in employee's own record. The employee link on the profile is the entitlement. */
export default function MyProfile() {
  const { db } = useDB();
  const { profile } = useAuth();
  const e = db.employees.find((x) => x.id === profile?.employee_id);
  if (!e) return <Screen title="My Profile"><Empty title="Your login isn't linked to an employee record" sub="An administrator can link it from Access & Governance." /></Screen>;

  const slips = db.payslips.filter((p) => p.employee_id === e.id);
  const adv = db.advances.filter((a) => a.employee_id === e.id);
  const custody = db.custodians.filter((c) => c.holder === e.name);
  const days = Array.from({ length: daysInMonth(THIS_MONTH) }, (_, i) => `${THIS_MONTH}-${String(i + 1).padStart(2, "0")}`).filter((d) => d <= TODAY);
  const count = (s: string) => days.filter((d) => attendance(db, e.id, d) === s).length;

  return (
    <Screen eyebrow="Me" title="My Profile">
      <Card>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <Avatar name={e.name} size={52} />
          <View style={{ flex: 1 }}>
            <T v="h3">{e.name}</T>
            <T v="mono" muted style={{ fontSize: 12 }}>{e.code} · {e.department}</T>
          </View>
          <Badge label={e.status} dot />
        </View>
        <View style={{ marginTop: 14 }}>
          <Fields items={[{ label: "Posting", value: clientName(db, e.client_id) }, { label: "Joined", value: fmtShort(e.join_date) }, { label: "Base", value: pkr(e.base), mono: true }, { label: "Bank", value: `${e.bank} ${e.account}` }]} />
        </View>
      </Card>

      {custody.length > 0 && (
        <Section title="Cash you hold">
          {custody.map((c) => <RecordCard key={c.id} title={c.location} accent="warning" fields={[{ label: "Held", value: pkr(c.held), mono: true }, { label: "Opening", value: pkr(c.opening), mono: true }]} />)}
        </Section>
      )}

      <Section title={`Attendance · ${fmtMonth(THIS_MONTH)}`}>
        <StatGrid cols={3} items={[{ label: "Present", value: String(count("present") + count("double_duty")), tone: "success" }, { label: "Absent", value: String(count("absent")), tone: "danger" }, { label: "Leave", value: String(count("leave")), tone: "warning" }]} />
        <Card style={{ marginTop: 10 }} pad={10}>
          <MonthGrid month={THIS_MONTH} render={(d) => <MarkTag s={attendance(db, e.id, d)} />} />
        </Card>
      </Section>

      <Section title="Payslips" count={slips.length}>
        {slips.map((p) => (
          <RecordCard key={p.id} title={fmtMonth(p.month)} badge={<Badge label={p.status} small />} fields={[
            { label: "Present", value: `${p.present} days` }, { label: "Base", value: pkr(p.base), mono: true },
            { label: "Bonus", value: pkr(p.bonus), mono: true }, { label: "Advance", value: pkr(p.advance), mono: true },
            { label: "Deductions", value: pkr(p.deductions), mono: true }, { label: "Net", value: pkr(p.net), mono: true, tone: "success" },
            { label: "Paid", value: p.paid_on ? `${p.mode} · ${fmtShort(p.paid_on)}` : "—", full: true },
          ]} />
        ))}
      </Section>

      <Section title="Advances" count={adv.length}>
        {adv.length ? <ListCard>{adv.map((a, i) => <Row key={a.id} last={i === adv.length - 1} title={pkr(a.amount)} subtitle={a.notes} meta={`${fmtShort(a.date)} · ${a.mode}`} />)}</ListCard> : <T v="small" muted>No advances.</T>}
      </Section>

      <Section title="Documents">
        <ListCard>{documentsFor(e).map((d, i, a) => <Row key={d.id} last={i === a.length - 1} title={d.name} meta={d.kind} />)}</ListCard>
      </Section>
      <Section title="Warnings">
        <T v="small" muted>{e.warnings ? `${e.warnings} warning on record.` : "None on record."}</T>
      </Section>
    </Screen>
  );
}
