import React, { useState } from "react";
import { View } from "react-native";
import { Screen } from "../../components/Screen";
import { Select, useOverlay } from "../../components/Sheet";
import { T } from "../../components/Text";
import { Badge, Button, Card, HStack, Input, ListCard, RecordCard, Row, Section, Toggle } from "../../components/ui";
import { THIS_MONTH } from "../../data/seed";
import { useDB } from "../../data/store";
import { useAuth } from "../../lib/auth";
import { fmtMonth, pkr } from "../../lib/format";
import { useTheme } from "../../theme/ThemeProvider";

const RAG = { green: "success", amber: "warning", red: "danger" } as const;
const CRITERIA = ["Punctuality", "Discipline", "Client feedback", "Initiative", "Teamwork"];

export default function Performance() {
  const t = useTheme();
  const { db, commit } = useDB();
  const { can } = useAuth();
  const { toast } = useOverlay();
  const approve = can("performance.approve");
  const staff = db.employees.filter((e) => e.category === "office_staff");
  const [enrolled, setEnrolled] = useState<Record<string, boolean>>(Object.fromEntries(staff.map((e, i) => [e.id, i < 3])));
  const [who, setWho] = useState(staff[0]!.id);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [pct, setPct] = useState("5");
  const avg = CRITERIA.reduce((a, c) => a + (Number(scores[c]) || 0), 0) / CRITERIA.length;

  return (
    <Screen eyebrow="Workforce" title="Performance">
      <Section title="Enrollment" hint="Salaried staff in the appraisal scheme.">
        <Card>{staff.map((e) => <Toggle key={e.id} label={e.name} sub={e.department} value={!!enrolled[e.id]} onChange={(v) => approve ? setEnrolled({ ...enrolled, [e.id]: v }) : toast("Needs performance approval", "danger")} />)}</Card>
      </Section>

      <Section title="KPI dashboard">
        {db.kpis.map((k) => (
          <RecordCard key={k.employee_id} title={db.employees.find((e) => e.id === k.employee_id)!.name} subtitle={k.kpi} badge={<Badge label={k.rag.toUpperCase()} tone={RAG[k.rag]} />} fields={[{ label: "Target", value: k.target, mono: true }, { label: "Value", value: k.value, mono: true }]} />
        ))}
      </Section>

      <Section title="New appraisal">
        <Card>
          <Select label="Employee" value={who} onChange={setWho} options={staff.map((e) => ({ value: e.id, label: e.name }))} />
          {CRITERIA.map((c) => (
            <HStack key={c} style={{ marginBottom: 8 }}>
              <T v="small" soft style={{ flex: 1, fontSize: 14 }}>{c}</T>
              <View style={{ flexDirection: "row", gap: 4 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Button key={n} size="sm" label={String(n)} variant={scores[c] === String(n) ? "primary" : "secondary"} onPress={() => setScores({ ...scores, [c]: String(n) })} style={{ width: 38, paddingHorizontal: 0 }} />
                ))}
              </View>
            </HStack>
          ))}
          <T v="small" muted style={{ marginVertical: 8 }}>Average {avg ? avg.toFixed(1) : "—"} / 5</T>
          <Button label="Submit appraisal" disabled={Object.keys(scores).length < CRITERIA.length} onPress={() => {
            commit((d) => { d.appraisals.unshift({ id: `ap${Date.now()}`, employee_id: who, period: "H2 2026", score: Number(avg.toFixed(1)), status: "pending" }); });
            setScores({}); toast("Appraisal submitted for approval");
          }} />
        </Card>
      </Section>

      <Section title="Appraisals" count={db.appraisals.length}>
        <ListCard>
          {db.appraisals.map((a, i) => (
            <Row key={a.id} last={i === db.appraisals.length - 1} title={db.employees.find((e) => e.id === a.employee_id)!.name} subtitle={`${a.period} · ${a.score}/5`}
              right={a.status === "pending" && approve ? <Button size="sm" label="Approve" onPress={() => { commit((d) => { d.appraisals.find((x) => x.id === a.id)!.status = "approved"; }); toast("Appraisal approved"); }} /> : <Badge label={a.status} small />} />
          ))}
        </ListCard>
      </Section>

      <Section title="Appreciation" hint="Annual flat percentage for enrolled staff.">
        <Card>
          <Input label="Flat %" keyboardType="numeric" value={pct} onChangeText={setPct} />
          <Button label="Apply appreciation" variant="secondary" disabled={!approve} onPress={() => toast(`${pct}% appreciation queued for ${Object.values(enrolled).filter(Boolean).length} staff`)} />
        </Card>
      </Section>

      <Section title="Accrue bonuses">
        <Card>
          <T v="body" soft>Bonus pool for {fmtMonth(THIS_MONTH)}: <T v="mono">{pkr(120000)}</T></T>
          <Button label="Accrue pool" style={{ marginTop: 12 }} disabled={!approve} onPress={() => toast("Bonus pool accrued")} />
        </Card>
      </Section>

      <Section title="Guard bonus ledger">
        <ListCard>
          {db.payslips.filter((p) => p.bonus > 0 && p.month === THIS_MONTH).slice(0, 6).map((p, i, a) => (
            <Row key={p.id} last={i === a.length - 1} title={db.employees.find((e) => e.id === p.employee_id)!.name} subtitle="Double-duty bonus" right={<T v="mono" color={t.tone("success").text}>{pkr(p.bonus)}</T>} />
          ))}
        </ListCard>
      </Section>
    </Screen>
  );
}
