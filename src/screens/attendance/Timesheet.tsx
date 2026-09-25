import { useLocalSearchParams, useRouter } from "expo-router";
import { Download, Wallet } from "lucide-react-native";
import React, { useState } from "react";
import { View } from "react-native";
import { MonthGrid, MonthStepper } from "../../components/MonthGrid";
import { Screen } from "../../components/Screen";
import { Select, Sheet, useOverlay } from "../../components/Sheet";
import { T } from "../../components/Text";
import { Badge, Button, Card, Empty, IconBtn, ListCard, Row, SearchBar, Section, StatGrid } from "../../components/ui";
import { AttStatus, THIS_MONTH, TODAY } from "../../data/seed";
import { attendance, clientName, siteName, useDB } from "../../data/store";
import { useAuth } from "../../lib/auth";
import { daysInMonth, fmtDay, fmtShort } from "../../lib/format";
import { MARK, MarkTag, StatusPick } from "./marks";

/** AttendanceManagement: per-employee month calendar for corrections. With `relieversOnly` it's the Relievers page. */
export default function Timesheet({ relieversOnly }: { relieversOnly?: boolean }) {
  const params = useLocalSearchParams<{ employee?: string }>();
  const { db, commit } = useDB();
  const { can } = useAuth();
  const router = useRouter();
  const { toast } = useOverlay();
  const pool = db.employees.filter((e) => e.lifecycle === "active" && (relieversOnly ? e.category === "reliever" : true));
  const [emp, setEmp] = useState(params.employee ?? (relieversOnly ? pool[0]?.id ?? "" : ""));
  const [month, setMonth] = useState(THIS_MONTH);
  const [day, setDay] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [cover, setCover] = useState("");
  const e = db.employees.find((x) => x.id === emp);

  const days = Array.from({ length: daysInMonth(month) }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`).filter((d) => d <= TODAY);
  const tally = (s: AttStatus) => (e ? days.filter((d) => attendance(db, e.id, d) === s).length : 0);

  if (!e) {
    const list = pool.filter((x) => !q || (x.name + x.code).toLowerCase().includes(q.toLowerCase()));
    return (
      <Screen eyebrow="Workforce" title={relieversOnly ? "Relievers" : "Attendance timesheet"} subtitle="Pick an employee to open their month.">
        <SearchBar value={q} onChange={setQ} placeholder="Name or code" />
        <ListCard style={{ marginTop: 12 }}>
          {list.slice(0, 60).map((x, i) => (
            <Row key={x.id} last={i === Math.min(list.length, 60) - 1} title={x.name} meta={`${x.code} · ${clientName(db, x.client_id)}`} right={<MarkTag s={attendance(db, x.id, TODAY)} />} onPress={() => setEmp(x.id)} />
          ))}
        </ListCard>
      </Screen>
    );
  }

  return (
    <Screen
      eyebrow={relieversOnly ? "Relievers" : "Timesheet"}
      title={e.name}
      subtitle={`${e.code} · ${e.department} · ${clientName(db, e.client_id)}`}
      actions={<>
        {relieversOnly && can("payroll.view") && <IconBtn icon={Wallet} label="Reliever payroll" onPress={() => router.push("/relievers/payroll")} />}
        <IconBtn icon={Download} label="Export to Excel" onPress={() => toast("Timesheet exported", "info")} />
      </>}
    >
      <Select label="Employee" searchable value={emp} onChange={(v) => { setEmp(v); setDay(null); }} options={pool.map((x) => ({ value: x.id, label: x.name, sub: x.code }))} />
      <MonthStepper month={month} onChange={setMonth} />
      <View style={{ marginTop: 12 }}>
        <StatGrid cols={3} items={[
          { label: "Present", value: String(tally("present") + tally("double_duty")), tone: "success" },
          { label: "Absent", value: String(tally("absent")), tone: "danger" },
          { label: "Leave", value: String(tally("leave")), tone: "warning" },
        ]} />
      </View>
      <Card style={{ marginTop: 12 }} pad={10}>
        <MonthGrid month={month} selected={day} onPress={(d) => d <= TODAY && setDay(d)} render={(d) => <MarkTag s={attendance(db, e.id, d)} />} />
      </Card>
      <T v="small" muted style={{ marginTop: 8 }}>Tap a day to correct it.</T>

      <Section title="History" count={days.length}>
        <ListCard>
          {days.slice().reverse().slice(0, 14).map((d, i) => {
            const s = attendance(db, e.id, d);
            return <Row key={d} last={i === 13} title={fmtDay(d)} subtitle={relieversOnly && s === "relief_cover" ? "Covered a post" : siteName(db, e.site_id)} right={s ? <Badge label={MARK[s].label} tone={MARK[s].tone} small /> : null} onPress={() => setDay(d)} />;
          })}
        </ListCard>
      </Section>

      <Sheet open={!!day} onClose={() => setDay(null)} title={day ? fmtDay(day) : ""} subtitle={`Attendance details — ${e.name}`}
        footer={<Button label="Done" full onPress={() => setDay(null)} />}
      >
        {day && (
          <>
            <T v="eyebrow" muted style={{ marginBottom: 8 }}>Mark</T>
            <StatusPick
              value={attendance(db, e.id, day)}
              disabled={!can("attendance.edit")}
              onChange={(s) => { commit((d) => { d.attOverride[`${e.id}|${day}`] = s; }); toast(`${fmtShort(day)} → ${MARK[s].label}`); }}
            />
            {relieversOnly && (
              <View style={{ marginTop: 16 }}>
                <Select label="Site covered" value={cover} onChange={(v) => { setCover(v); commit((d) => { d.attOverride[`${e.id}|${day}`] = "relief_cover"; }); toast("Relief cover recorded"); }}
                  options={db.sites.map((s) => ({ value: s.id, label: s.name, sub: clientName(db, s.client_id) }))} />
              </View>
            )}
            {!can("attendance.edit") && <T v="small" muted style={{ marginTop: 10 }}>You can view but not change attendance.</T>}
          </>
        )}
      </Sheet>
      {pool.length === 0 && <Empty title="No one to show" />}
    </Screen>
  );
}
