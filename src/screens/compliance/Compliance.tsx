import { BellRing, CalendarPlus, FolderOpen, Plus, Trash2, Upload } from "lucide-react-native";
import React, { useState } from "react";
import { View } from "react-native";
import { Progress } from "../../components/Charts";
import { MonthGrid, MonthStepper } from "../../components/MonthGrid";
import { Screen } from "../../components/Screen";
import { Select, Sheet, useOverlay } from "../../components/Sheet";
import { T } from "../../components/Text";
import { Badge, Button, Card, Chips, Empty, HStack, IconBtn, Input, ListCard, RecordCard, Row, SearchBar, Section, Segmented, Tabs, toneOf } from "../../components/ui";
import { documentsFor, ImportantDate, RecurringAlert, THIS_MONTH, TODAY } from "../../data/seed";
import { clientName, useDB } from "../../data/store";
import { useAuth } from "../../lib/auth";
import { daysBetween, fmtShort } from "../../lib/format";
import { useTheme } from "../../theme/ThemeProvider";

export default function Compliance() {
  const { can } = useAuth();
  const [tab, setTab] = useState<"calendar" | "licences" | "renewals">("calendar");
  const [addDate, setAddDate] = useState(false);
  const [addAlert, setAddAlert] = useState(false);
  return (
    <Screen
      eyebrow="Compliance"
      title="Compliance"
      actions={can("compliance.edit") && tab === "calendar" ? <>
        <IconBtn icon={BellRing} label="Add recurring alert" onPress={() => setAddAlert(true)} />
        <IconBtn icon={CalendarPlus} label="Add important date" filled onPress={() => setAddDate(true)} />
      </> : undefined}
      sticky={<Tabs value={tab} onChange={setTab} items={[{ key: "calendar", label: "Calendar" }, { key: "licences", label: "Licences & renewals" }, { key: "renewals", label: "Contract renewals" }]} />}
    >
      {tab === "calendar" && <Calendar />}
      {tab === "licences" && <Licences />}
      {tab === "renewals" && <Renewals />}
      <DateSheet open={addDate} onClose={() => setAddDate(false)} />
      <AlertSheet open={addAlert} onClose={() => setAddAlert(false)} />
    </Screen>
  );
}

function Calendar() {
  const t = useTheme();
  const { db, commit } = useDB();
  const { can } = useAuth();
  const { toast } = useOverlay();
  const [month, setMonth] = useState(THIS_MONTH);
  const [sub, setSub] = useState<"dates" | "alerts">("dates");
  const [day, setDay] = useState<string | null>(null);
  const active = db.employees.filter((e) => e.lifecycle === "active");
  const coverage = [
    { label: "Police verification", n: active.filter((e) => e.police_verification === "cleared").length },
    { label: "NADRA Verisys", n: active.filter((e) => e.verisys === "cleared").length },
    { label: "CNIC number", n: active.filter((e) => e.cnic).length },
    { label: "CNIC expiry", n: active.filter((e) => e.cnic_expiry).length },
  ];
  const upcoming = db.importantDates.filter((d) => daysBetween(TODAY, d.date) <= 60).sort((a, b) => a.date.localeCompare(b.date));
  return (
    <>
      <Section title="Guard data coverage" style={{ marginTop: 0 }}>
        <Card>
          {coverage.map((c) => (
            <View key={c.label} style={{ marginBottom: 10 }}>
              <HStack style={{ marginBottom: 4 }}><T v="small" soft style={{ flex: 1, fontSize: 14 }}>{c.label}</T><T v="mono">{c.n}/{active.length}</T></HStack>
              <Progress value={c.n} max={active.length} tone={c.n / active.length > 0.9 ? "success" : "warning"} />
            </View>
          ))}
        </Card>
      </Section>
      <Section title="Raised alerts" count={db.systemAlerts.length}>
        <ListCard>{db.systemAlerts.map((a, i) => <Row key={a.id} last={i === db.systemAlerts.length - 1} title={a.text} meta={fmtShort(a.at)} right={<Badge label={a.level} tone={a.level === "blocking" ? "danger" : "warning"} small />} />)}</ListCard>
      </Section>
      <Section title="Calendar">
        <MonthStepper month={month} onChange={setMonth} max="2099-12" />
        <Card pad={10} style={{ marginTop: 10 }}>
          <MonthGrid month={month} selected={day} onPress={setDay} render={(d) => {
            const n = db.importantDates.filter((x) => x.date === d);
            return n.length ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.tone(n.some((x) => x.priority === "high") ? "danger" : "warning").solid }} /> : null;
          }} />
        </Card>
        {day && <View style={{ marginTop: 8 }}>{db.importantDates.filter((x) => x.date === day).map((x) => <T key={x.id} v="smallStrong">{x.title}</T>)}{!db.importantDates.some((x) => x.date === day) && <T v="small" muted>Nothing on {fmtShort(day)}.</T>}</View>}
      </Section>
      <Section title="Upcoming" count={upcoming.length}>
        <ListCard>{upcoming.map((d, i) => { const n = daysBetween(TODAY, d.date); return <Row key={d.id} last={i === upcoming.length - 1} title={d.title} subtitle={`${d.category} · ${fmtShort(d.date)}`} right={<Badge label={n < 0 ? `${-n}d overdue` : `${n}d`} tone={n < 0 ? "danger" : n <= d.notice ? "warning" : "neutral"} small />} />; })}</ListCard>
      </Section>
      <View style={{ marginTop: 22 }}>
        <Segmented value={sub} onChange={setSub} items={[{ key: "dates", label: "Important dates", count: db.importantDates.length }, { key: "alerts", label: "Recurring alerts", count: db.recurringAlerts.length }]} />
      </View>
      <View style={{ marginTop: 12 }}>
        {sub === "dates" ? db.importantDates.map((d) => (
          <RecordCard key={d.id} title={d.title} subtitle={d.category} badge={<Badge label={d.priority} tone={toneOf(d.priority)} small />}
            fields={[{ label: "Date", value: fmtShort(d.date) }, { label: "Days remaining", value: String(daysBetween(TODAY, d.date)), mono: true, tone: d.date < TODAY ? "danger" : undefined }, { label: "Advance notice", value: `${d.notice} days` }]}
            actions={can("compliance.edit") ? [{ label: "Delete", icon: Trash2, tone: "danger", onPress: () => { commit((db2) => { db2.importantDates = db2.importantDates.filter((x) => x.id !== d.id); }); toast("Date removed", "warning"); } }] : undefined} />
        )) : db.recurringAlerts.map((a) => (
          <RecordCard key={a.id} title={a.name} subtitle={a.category} badge={<Badge label={a.active ? "Active" : "Paused"} tone={a.active ? "success" : "neutral"} small />}
            fields={[{ label: "Frequency", value: a.frequency }, { label: "Trigger day", value: String(a.trigger_day), mono: true }, { label: "Advance notice", value: `${a.notice} days` }]}
            actions={can("compliance.edit") ? [{ label: a.active ? "Pause" : "Resume", onPress: () => commit((db2) => { const x = db2.recurringAlerts.find((y) => y.id === a.id)!; x.active = !x.active; }) }] : undefined} />
        ))}
      </View>
    </>
  );
}

function DateSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { commit } = useDB();
  const { toast } = useOverlay();
  const [f, setF] = useState<Omit<ImportantDate, "id">>({ title: "", date: TODAY, category: "Licence", notice: 14, priority: "medium" });
  return (
    <Sheet open={open} onClose={onClose} title="Add important date" footer={<Button label="Add" full disabled={!f.title} onPress={() => { commit((d) => { d.importantDates.push({ ...f, id: `id${Date.now()}` }); }); toast("Date added"); onClose(); }} />}>
      <Input label="Title" required value={f.title} onChangeText={(v) => setF({ ...f, title: v })} />
      <Input label="Date" value={f.date} onChangeText={(v) => setF({ ...f, date: v })} placeholder="YYYY-MM-DD" />
      <Select label="Category" value={f.category} onChange={(v) => setF({ ...f, category: v })} options={["Licence", "Statutory", "Weapons", "Contract", "Safety", "Tax"].map((x) => ({ value: x, label: x }))} />
      <Input label="Advance notice (days)" keyboardType="numeric" value={String(f.notice)} onChangeText={(v) => setF({ ...f, notice: Number(v) || 0 })} />
      <Select label="Priority" value={f.priority} onChange={(v) => setF({ ...f, priority: v as ImportantDate["priority"] })} options={["low", "medium", "high"].map((x) => ({ value: x, label: x }))} />
    </Sheet>
  );
}

function AlertSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { commit } = useDB();
  const { toast } = useOverlay();
  const [f, setF] = useState<Omit<RecurringAlert, "id">>({ name: "", category: "Statutory", frequency: "Monthly", trigger_day: 1, notice: 5, active: true });
  return (
    <Sheet open={open} onClose={onClose} title="Add recurring alert" footer={<Button label="Add" full disabled={!f.name} onPress={() => { commit((d) => { d.recurringAlerts.push({ ...f, id: `ra${Date.now()}` }); }); toast("Alert added"); onClose(); }} />}>
      <Input label="Name" required value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
      <Select label="Category" value={f.category} onChange={(v) => setF({ ...f, category: v })} options={["Statutory", "Tax", "Training", "Licence"].map((x) => ({ value: x, label: x }))} />
      <Select label="Frequency" value={f.frequency} onChange={(v) => setF({ ...f, frequency: v })} options={["Monthly", "Quarterly", "Yearly"].map((x) => ({ value: x, label: x }))} />
      <HStack gap={10}>
        <Input style={{ flex: 1 }} label="Trigger day" keyboardType="numeric" value={String(f.trigger_day)} onChangeText={(v) => setF({ ...f, trigger_day: Number(v) || 1 })} />
        <Input style={{ flex: 1 }} label="Notice (days)" keyboardType="numeric" value={String(f.notice)} onChangeText={(v) => setF({ ...f, notice: Number(v) || 0 })} />
      </HStack>
    </Sheet>
  );
}

function Licences() {
  const { db } = useDB();
  const [bucket, setBucket] = useState("all");
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const b = (d: number) => (d < 0 ? "expired" : d < 30 ? "30" : d < 90 ? "90" : "later");
  const list = db.licences.filter((l) => (bucket === "all" || b(daysBetween(TODAY, l.expiry)) === bucket) && (!cat || l.category === cat) && (!q || l.item.toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <Chips value={bucket} onChange={setBucket} items={[{ key: "all", label: "All" }, { key: "expired", label: "Expired" }, { key: "30", label: "< 30 days" }, { key: "90", label: "< 90 days" }, { key: "later", label: "> 90 days" }]} />
      <View style={{ gap: 8, marginTop: 8, marginBottom: 12 }}>
        <Select compact clearable label="Category" value={cat} onChange={setCat} placeholder="All" options={[...new Set(db.licences.map((l) => l.category))].map((c) => ({ value: c, label: c }))} />
        <SearchBar value={q} onChange={setQ} placeholder="Item" />
      </View>
      {list.map((l) => {
        const d = daysBetween(TODAY, l.expiry);
        return <RecordCard key={l.id} title={l.item} subtitle={l.authority} accent={d < 0 ? "danger" : d < 30 ? "warning" : undefined} badge={<Badge label={d < 0 ? "Expired" : d < 30 ? "Due soon" : "Valid"} tone={d < 0 ? "danger" : d < 30 ? "warning" : "success"} small />}
          fields={[{ label: "Category", value: l.category }, { label: "Expiry", value: fmtShort(l.expiry) }, { label: "Days", value: String(d), mono: true, tone: d < 0 ? "danger" : undefined }]} />;
      })}
      {list.length === 0 && <Empty title="Nothing in this window" />}
    </>
  );
}

function Renewals() {
  const { db, commit } = useDB();
  const { can } = useAuth();
  const { toast } = useOverlay();
  const [client, setClient] = useState("");
  const [date, setDate] = useState("");
  return (
    <>
      {db.contractRenewals.map((r) => (
        <RecordCard key={r.id} title={clientName(db, r.client_id)} badge={<Badge label={r.stage} tone={toneOf(r.stage)} small />} fields={[{ label: "Expected close", value: fmtShort(r.expected) }, { label: "Days", value: String(daysBetween(TODAY, r.expected)), mono: true }]} />
      ))}
      {can("compliance.edit") && (
        <Card style={{ marginTop: 10 }}>
          <T v="h3" style={{ marginBottom: 10 }}>Add renewal</T>
          <Select label="Client" value={client} onChange={setClient} options={db.clients.map((c) => ({ value: c.id, label: c.name }))} />
          <Input label="Expected close" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
          <Button label="Add" icon={Plus} disabled={!client || !date} onPress={() => { commit((d) => { d.contractRenewals.push({ id: `cr${Date.now()}`, client_id: client, expected: date, stage: "Proposal sent" }); }); setClient(""); setDate(""); toast("Renewal added"); }} />
        </Card>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Compliance Cases
export function ComplianceCases() {
  const { db, commit } = useDB();
  const { can } = useAuth();
  const { toast } = useOverlay();
  const [tab, setTab] = useState<"cases" | "filings" | "visits">("cases");
  const [f, setF] = useState({ a: "", b: "", c: "" });
  return (
    <Screen eyebrow="Compliance" title="Compliance Cases" sticky={<Tabs value={tab} onChange={setTab} items={[{ key: "cases", label: "Cases", count: db.complianceCases.length }, { key: "filings", label: "Filings", count: db.filings.length }, { key: "visits", label: "Government visits" }]} />}>
      {tab === "cases" && (
        <>
          {db.complianceCases.map((c) => <RecordCard key={c.id} title={c.case} subtitle={`${c.authority} · ${c.jurisdiction}`} badge={<Badge label={c.stage} tone="info" small />} fields={[{ label: "Target", value: fmtShort(c.target) }, { label: "Days", value: String(daysBetween(TODAY, c.target)), mono: true }]}
            actions={can("compliance.edit") ? [{ label: "Advance stage", onPress: () => { commit((d) => { d.complianceCases.find((x) => x.id === c.id)!.stage = "Hearing scheduled"; }); toast("Stage advanced"); } }] : undefined} />)}
          {can("compliance.edit") && <Card style={{ marginTop: 6 }}><T v="h3" style={{ marginBottom: 10 }}>New case</T>
            <Input label="Case" value={f.a} onChangeText={(v) => setF({ ...f, a: v })} /><Input label="Authority" value={f.b} onChangeText={(v) => setF({ ...f, b: v })} />
            <Button label="Add case" disabled={!f.a} onPress={() => { commit((d) => { d.complianceCases.push({ id: `cs${Date.now()}`, case: f.a, jurisdiction: "Punjab", authority: f.b, target: TODAY, stage: "Opened" }); }); setF({ a: "", b: "", c: "" }); toast("Case opened"); }} /></Card>}
        </>
      )}
      {tab === "filings" && db.filings.map((x) => (
        <RecordCard key={x.id} title={x.type} subtitle={x.period} badge={<Badge label={x.status} tone={toneOf(x.status)} small />} fields={[{ label: "Due", value: fmtShort(x.due) }, { label: "Amount", value: x.amount ? `PKR ${x.amount.toLocaleString("en-US")}` : "—", mono: true }]}
          actions={can("compliance.filings") && x.status !== "filed" ? [{ label: "Mark filed", tone: "success", onPress: () => { commit((d) => { d.filings.find((y) => y.id === x.id)!.status = "filed"; }); toast("Filing recorded"); } }] : undefined} />
      ))}
      {tab === "visits" && <ListCard>{db.govVisits.map((v, i) => <Row key={v.id} last={i === db.govVisits.length - 1} title={v.authority} subtitle={v.note} meta={fmtShort(v.date)} />)}</ListCard>}
    </Screen>
  );
}

// ---------------------------------------------------------------- Documents
export function Documents() {
  const { db } = useDB();
  const { can } = useAuth();
  const { toast } = useOverlay();
  const [q, setQ] = useState("");
  const [client, setClient] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [upload, setUpload] = useState(false);
  const list = db.employees.filter((e) => e.lifecycle === "active" && (!client || e.client_id === client) && (!q || (e.name + e.code).toLowerCase().includes(q.toLowerCase())));
  const e = db.employees.find((x) => x.id === open);
  return (
    <Screen eyebrow="Compliance" title="Documents" actions={can("documents.edit") ? <IconBtn icon={Upload} label="Upload documents" filled onPress={() => setUpload(true)} /> : undefined}
      sticky={<SearchBar value={q} onChange={setQ} placeholder="Employee" />}>
      <Select compact clearable label="Client" value={client} onChange={setClient} placeholder="All" options={db.clients.map((c) => ({ value: c.id, label: c.name }))} />
      <View style={{ height: 12 }} />
      {list.slice(0, 40).map((x) => {
        const docs = documentsFor(x);
        return <RecordCard key={x.id} title={x.name} subtitle={x.code} onPress={() => setOpen(x.id)} leading={<FolderOpen size={20} />}
          fields={[{ label: "Client", value: clientName(db, x.client_id) }, { label: "Shift", value: x.shift }, { label: "Documents", value: String(docs.length), mono: true, tone: docs.length < 3 ? "warning" : undefined }, { label: "Last updated", value: fmtShort(docs[docs.length - 1]?.at) }]} />;
      })}
      <Sheet open={!!e} onClose={() => setOpen(null)} title="Employee documents" subtitle={e?.name}>
        {e && <ListCard>{documentsFor(e).map((d, i, a) => <Row key={d.id} last={i === a.length - 1} title={d.name} meta={`${d.kind} · ${fmtShort(d.at)}`} onPress={() => toast(`Opening ${d.name}`, "info")} right={can("documents.edit") ? <Trash2 size={15} /> : undefined} />)}</ListCard>}
      </Sheet>
      <Sheet open={upload} onClose={() => setUpload(false)} title="Upload documents" footer={<Button label="Choose files" full onPress={() => { setUpload(false); toast("File picker opens on a device build", "info"); }} />}>
        <Select label="Employee" searchable value={null} onChange={() => {}} options={db.employees.filter((x) => x.lifecycle === "active").map((x) => ({ value: x.id, label: x.name, sub: x.code }))} />
        <Select label="Document type" value="CNIC" onChange={() => {}} options={["CNIC", "Vetting", "Form", "Certificate"].map((x) => ({ value: x, label: x }))} />
      </Sheet>
    </Screen>
  );
}

// ---------------------------------------------------------------- Alerts
export function Alerts() {
  const { db, commit } = useDB();
  const { toast } = useOverlay();
  const expiredCnic = db.employees.filter((e) => e.lifecycle === "active" && e.cnic_expiry && e.cnic_expiry < TODAY).length;
  return (
    <Screen eyebrow="Compliance" title="Alerts">
      <Section title="Open alerts" count={db.systemAlerts.length} style={{ marginTop: 0 }}>
        {db.systemAlerts.map((a) => (
          <RecordCard key={a.id} title={a.text} subtitle={fmtShort(a.at)} accent={a.level === "blocking" ? "danger" : "warning"} badge={<Badge label={a.level} tone={a.level === "blocking" ? "danger" : "warning"} small />}
            actions={[{ label: "Acknowledge", onPress: () => { commit((d) => { d.systemAlerts = d.systemAlerts.filter((x) => x.id !== a.id); }); toast("Acknowledged"); } }]} />
        ))}
        {db.systemAlerts.length === 0 && <Empty title="No open alerts" />}
      </Section>
      <Section title="Live warnings">
        <ListCard>
          <Row title={`${expiredCnic} guards with an expired CNIC`} />
          <Row title={`${db.vacancies.length} vacancies open`} />
          <Row last title={`${db.licences.filter((l) => l.expiry < TODAY).length} licences expired`} />
        </ListCard>
      </Section>
      <Section title="Dashboard summary">
        <Card><T v="body" soft>{db.incidents.filter((i) => i.status === "open").length} open incidents · {db.importantDates.filter((d) => daysBetween(TODAY, d.date) <= 30).length} compliance dates within 30 days.</T></Card>
      </Section>
    </Screen>
  );
}
