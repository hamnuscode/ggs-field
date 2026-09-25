import { CheckCircle2, Download, Eye, Lock, Pencil, Plus, Store, Tags, Trash2 } from "lucide-react-native";
import React, { useState } from "react";
import { View } from "react-native";
import { Bars, Progress } from "../../components/Charts";
import { PaymentFields, PayForm } from "../../components/PaymentFields";
import { Screen } from "../../components/Screen";
import { Select, Sheet, useOverlay } from "../../components/Sheet";
import { T } from "../../components/Text";
import { Badge, Banner, Button, Card, Chips, Empty, Fields, HStack, IconBtn, Input, ListCard, RecordCard, Row, SearchBar, Section, StatGrid, Tabs, toneOf } from "../../components/ui";
import { Expense, THIS_MONTH, TODAY } from "../../data/seed";
import { clientName, useDB } from "../../data/store";
import { useAuth } from "../../lib/auth";
import { fmtMonth, fmtShort, pkr } from "../../lib/format";

type Tab = "expenses" | "fixed" | "advances" | "deferred";
const blankPay = (): PayForm => ({ amount: "", date: TODAY, mode: "Cash", account: "", notes: "" });

export default function Expenses() {
  const { can } = useAuth();
  const { db } = useDB();
  const { toast } = useOverlay();
  const [tab, setTab] = useState<Tab>("expenses");
  const [add, setAdd] = useState<Expense | "new" | null>(null);
  const [addAdv, setAddAdv] = useState(false);
  const [vendors, setVendors] = useState(false);
  const [cats, setCats] = useState(false);
  const canEdit = can("expenses.edit");
  const pendingFixed = db.fixedInstances.filter((f) => f.status === "Awaiting").length;
  return (
    <Screen
      region
      eyebrow="Finance"
      title="Expenses & Advances"
      actions={<>
        <IconBtn icon={Download} label="Export" onPress={() => toast("Expenses exported", "info")} />
        {canEdit && <IconBtn icon={Store} label="Manage vendors" onPress={() => setVendors(true)} />}
        {canEdit && <IconBtn icon={Tags} label="Categories" onPress={() => setCats(true)} />}
        {canEdit && (tab === "expenses" || tab === "advances") && <IconBtn icon={Plus} label={tab === "advances" ? "Add advance" : "Add expense"} filled onPress={() => (tab === "advances" ? setAddAdv(true) : setAdd("new"))} />}
      </>}
      sticky={<Tabs value={tab} onChange={setTab} items={[{ key: "expenses", label: "Expenses" }, { key: "fixed", label: "Fixed", count: pendingFixed || undefined }, { key: "advances", label: "Advances" }, { key: "deferred", label: "Deferred", count: db.deferred.length }]} />}
    >
      {tab === "expenses" && <ExpenseList onEdit={setAdd} />}
      {tab === "fixed" && <Fixed />}
      {tab === "advances" && <Advances />}
      {tab === "deferred" && <Deferred />}
      <ExpenseForm key={add === "new" ? "new" : add?.id ?? "none"} expense={add} onClose={() => setAdd(null)} />
      <AdvanceForm open={addAdv} onClose={() => setAddAdv(false)} />
      <Sheet open={vendors} onClose={() => setVendors(false)} title="Manage vendors">
        <ListCard>{db.vendors.map((v, i) => <Row key={v} last={i === db.vendors.length - 1} title={v} right={<Pencil size={14} />} />)}</ListCard>
        <View style={{ marginTop: 12 }}><Input label="Add vendor" onSubmitEditing={(e) => { toast(`${e.nativeEvent.text} added`); }} /></View>
      </Sheet>
      <Sheet open={cats} onClose={() => setCats(false)} title="Category management">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {db.expenseCategories.map((c) => <Badge key={c} label={c} tone="neutral" />)}
        </View>
        <View style={{ marginTop: 14 }}><Input label="Add category" onSubmitEditing={(e) => toast(`${e.nativeEvent.text} added`)} /></View>
      </Sheet>
    </Screen>
  );
}

function ExpenseList({ onEdit }: { onEdit: (e: Expense) => void }) {
  const { db, commit } = useDB();
  const { can } = useAuth();
  const { toast, confirm } = useOverlay();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [mode, setMode] = useState("all");
  const [month, setMonth] = useState(THIS_MONTH);
  const [view, setView] = useState<Expense | null>(null);
  const list = db.expenses.filter((x) => x.date.startsWith(month) && (!cat || x.category === cat) && (mode === "all" || x.mode === mode) && (!q || (x.description + x.vendor).toLowerCase().includes(q.toLowerCase())));
  const byCat = Object.entries(list.reduce<Record<string, number>>((a, x) => ((a[x.category] = (a[x.category] ?? 0) + x.amount), a), {})).sort((a, b) => b[1] - a[1]);
  const total = list.reduce((a, x) => a + x.amount, 0);
  const months = [...new Set(db.expenses.map((x) => x.date.slice(0, 7)))].sort().reverse();
  return (
    <>
      <StatGrid items={[{ label: `Spend · ${fmtMonth(month)}`, value: pkr(total, { compact: true }), tone: "danger" }, { label: "Awaiting approval", value: String(list.filter((x) => !x.approved).length), tone: "warning" }]} />
      <Section title="By category">
        <Card><Bars data={byCat.slice(0, 6).map(([label, value]) => ({ label, value, sub: `${Math.round((value / Math.max(1, total)) * 100)}% of month` }))} format={(n) => pkr(n, { compact: true })} /></Card>
      </Section>
      <View style={{ gap: 8, marginTop: 16, marginBottom: 12 }}>
        <SearchBar value={q} onChange={setQ} placeholder="Description or vendor" />
        <HStack>
          <View style={{ flex: 1 }}><Select compact label="Month" value={month} onChange={setMonth} options={months.map((m) => ({ value: m, label: fmtMonth(m) }))} /></View>
          <View style={{ flex: 1 }}><Select compact clearable label="Category" value={cat} onChange={setCat} placeholder="All" options={db.expenseCategories.map((c) => ({ value: c, label: c }))} /></View>
        </HStack>
        <Chips value={mode} onChange={setMode} items={["all", "Cash", "Bank", "Cheque", "Payable"].map((m) => ({ key: m, label: m === "all" ? "Any mode" : m }))} />
      </View>
      {list.map((x) => (
        <RecordCard key={x.id} title={x.description} subtitle={`${fmtShort(x.date)} · ${x.vendor}`}
          badge={<Badge label={x.mode} tone={x.mode === "Payable" ? "warning" : "neutral"} small />}
          right={<T v="monoLg" style={{ fontSize: 15 }}>{pkr(x.amount, { compact: true })}</T>}
          fields={[{ label: "Category", value: x.category }, { label: "Client", value: x.client_id ? clientName(db, x.client_id) : "Office" }, { label: "By", value: x.by }, { label: "Status", value: x.approved ? "Approved · locked" : "Awaiting approval", tone: x.approved ? "success" : "warning" }]}
          actions={[
            { label: "View", icon: Eye, onPress: () => setView(x) },
            ...(can("expenses.edit") && !x.approved ? [{ label: "Edit", icon: Pencil, onPress: () => onEdit(x) }] : []),
            ...(can("expenses.approve") ? [{ label: x.approved ? "Unapprove" : "Approve", icon: x.approved ? Lock : CheckCircle2, tone: x.approved ? undefined : ("success" as const), onPress: async () => {
              if (await confirm({ title: `${x.approved ? "Unapprove" : "Approve"} expense?`, message: x.approved ? "Unlocks it for edits." : "Locks it against further edits.", confirmLabel: x.approved ? "Unapprove" : "Approve" })) {
                commit((d) => { d.expenses.find((y) => y.id === x.id)!.approved = !x.approved; }); toast(x.approved ? "Expense unlocked" : "Expense approved");
              }
            } }] : []),
          ]} />
      ))}
      {list.length === 0 && <Empty title="No expenses this month" />}
      <Sheet open={!!view} onClose={() => setView(null)} title="Expense details" footer={can("expenses.edit") && view && !view.approved ? <Button label="Delete" icon={Trash2} variant="danger" full onPress={async () => {
        if (await confirm({ title: "Delete expense?", confirmLabel: "Delete", tone: "danger" })) { commit((d) => { d.expenses = d.expenses.filter((y) => y.id !== view.id); }); setView(null); toast("Expense deleted", "warning"); }
      }} /> : undefined}>
        {view && <Fields items={[
          { label: "Amount", value: pkr(view.amount), mono: true }, { label: "Date", value: fmtShort(view.date) }, { label: "Category", value: view.category }, { label: "Nature", value: view.nature },
          { label: "Vendor", value: view.vendor }, { label: "Client", value: view.client_id ? clientName(db, view.client_id) : "Office (no client)" }, { label: "Mode", value: view.mode }, { label: "Expense by", value: view.by },
          { label: "Description", value: view.description, full: true }, { label: "Receipts", value: "1 image", full: true },
        ]} />}
      </Sheet>
    </>
  );
}

function ExpenseForm({ expense, onClose }: { expense: Expense | "new" | null; onClose: () => void }) {
  const { db, commit } = useDB();
  const { toast, confirm } = useOverlay();
  const isNew = expense === "new";
  const ex = expense && expense !== "new" ? expense : null;
  const [f, setF] = useState(() => ({ category: ex?.category ?? "", client: ex?.client_id ?? "", vendor: ex?.vendor ?? "", description: ex?.description ?? "", nature: (ex?.nature ?? "Operating Expense") as string, coverage: "month" }));
  const [pay, setPay] = useState<PayForm>(() => (ex ? { ...blankPay(), amount: String(ex.amount), date: ex.date, mode: ex.mode } : blankPay()));
  const save = async () => {
    const amt = Number(pay.amount);
    const cust = db.custodians.find((c) => c.id === pay.account);
    if (pay.mode === "Cash" && cust && amt > cust.held && !(await confirm({ title: "More than the custodian holds", message: `${cust.holder} holds ${pkr(cust.held)}. Record anyway?`, confirmLabel: "Record" }))) return;
    commit((d) => {
      const row: Expense = { id: isNew ? `x${Date.now()}` : (expense as Expense).id, date: pay.date, category: f.category, client_id: f.client || null, vendor: f.vendor, description: f.description, amount: amt, mode: pay.mode as Expense["mode"], by: "You", approved: false, nature: f.nature as Expense["nature"] };
      if (isNew) d.expenses.unshift(row); else Object.assign(d.expenses.find((x) => x.id === row.id)!, row);
    });
    toast(isNew ? "Expense added" : "Expense saved"); onClose();
  };
  return (
    <Sheet open={!!expense} onClose={onClose} title={isNew ? "Add expense" : "Edit expense"} full footer={<><Button label="Cancel" variant="secondary" full onPress={onClose} /><Button label="Save" full disabled={!f.category || !Number(pay.amount) || (pay.mode !== "Payable" && !pay.account)} onPress={save} /></>}>
      <Select label="Category" required value={f.category} onChange={(v) => setF({ ...f, category: v })} options={db.expenseCategories.map((c) => ({ value: c, label: c }))} />
      <Select label="Client" value={f.client} onChange={(v) => setF({ ...f, client: v })} options={[{ value: "", label: "Office (no client)" }, ...db.clients.map((c) => ({ value: c.id, label: c.name }))]} />
      <Select label="Vendor" value={f.vendor} onChange={(v) => setF({ ...f, vendor: v })} options={db.vendors.map((v) => ({ value: v, label: v }))} />
      <Input label="Description" value={f.description} onChangeText={(v) => setF({ ...f, description: v })} />
      <PaymentFields f={pay} set={(p) => setPay({ ...pay, ...p })} modes={["Cash", "Bank", "Cheque", "Payable"]} />
      <Select label="Nature" value={f.nature} onChange={(v) => setF({ ...f, nature: v })} options={[{ value: "Cost of Services", label: "Cost of Services" }, { value: "Operating Expense", label: "Operating Expense" }]} />
      <Select label="Coverage" value={f.coverage} onChange={(v) => setF({ ...f, coverage: v })} options={[{ value: "month", label: "All in this month" }, { value: "period", label: "Service period" }, { value: "prepaid", label: "Prepaid schedule" }]} />
      <Button label="Attach receipt" variant="secondary" onPress={() => toast("Camera / file picker opens on a device build", "info")} />
    </Sheet>
  );
}

function AdvanceForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, commit } = useDB();
  const { toast } = useOverlay();
  const [emp, setEmp] = useState("");
  const [pay, setPay] = useState<PayForm>(blankPay());
  return (
    <Sheet open={open} onClose={onClose} title="Add advance" footer={<Button label="Save" full disabled={!emp || !Number(pay.amount) || !pay.account} onPress={() => {
      commit((d) => { d.advances.unshift({ id: `adv${Date.now()}`, date: pay.date, employee_id: emp, amount: Number(pay.amount), mode: pay.mode as "Cash", paid_by: "You", notes: pay.notes, recovered: 0 }); });
      toast("Advance recorded"); setEmp(""); setPay(blankPay()); onClose();
    }} />}>
      <Select label="Employee" required searchable value={emp} onChange={setEmp} options={db.employees.filter((e) => e.lifecycle === "active").map((e) => ({ value: e.id, label: e.name, sub: e.code }))} />
      <PaymentFields f={pay} set={(p) => setPay({ ...pay, ...p })} modes={["Cash", "Bank"]} />
    </Sheet>
  );
}

function Fixed() {
  const { db, commit } = useDB();
  const { can } = useAuth();
  const { toast } = useOverlay();
  const count = (s: string) => db.fixedInstances.filter((f) => f.status === s).reduce((a, f) => a + f.amount, 0);
  return (
    <>
      <StatGrid items={[{ label: "Awaiting decision", value: pkr(count("Awaiting"), { compact: true }), tone: "warning" }, { label: "Approved · posted", value: pkr(count("Approved"), { compact: true }), tone: "success" }, { label: "Denied", value: pkr(count("Denied"), { compact: true }) }]} />
      <Section title={`Instances · ${fmtMonth(THIS_MONTH)}`}>
        {db.fixedInstances.map((i) => {
          const d = db.fixedDefs.find((x) => x.id === i.def_id)!;
          return (
            <RecordCard key={i.id} title={d.description} subtitle={`${d.category} · ${d.party}`} badge={<Badge label={i.status} tone={i.status === "Awaiting" ? "warning" : toneOf(i.status === "Approved" ? "approved" : "denied")} small />}
              fields={[{ label: "Amount", value: pkr(i.amount), mono: true }, { label: "Mode", value: d.mode }]}
              actions={can("expenses.approve") && i.status === "Awaiting" ? [
                { label: "Approve", tone: "success", onPress: () => { commit((db2) => { db2.fixedInstances.find((x) => x.id === i.id)!.status = "Approved"; }); toast("Approved and posted"); } },
                { label: "Deny", tone: "danger", onPress: () => { commit((db2) => { db2.fixedInstances.find((x) => x.id === i.id)!.status = "Denied"; }); toast("Denied", "warning"); } },
              ] : undefined} />
          );
        })}
      </Section>
      <Section title="Recurring definitions" count={db.fixedDefs.length}>
        {db.fixedDefs.map((d) => <RecordCard key={d.id} title={d.description} subtitle={d.category} fields={[{ label: "Party", value: d.party }, { label: "Amount", value: pkr(d.amount), mono: true }, { label: "Paid by", value: d.paid_by }, { label: "Runs", value: d.runs }]} />)}
      </Section>
    </>
  );
}

function Advances() {
  const { db } = useDB();
  const [q, setQ] = useState("");
  const list = db.advances.filter((a) => !q || (db.employees.find((e) => e.id === a.employee_id)?.name ?? "").toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <StatGrid items={[{ label: "Advanced", value: pkr(db.advances.reduce((a, x) => a + x.amount, 0), { compact: true }), tone: "danger" }, { label: "Recovered", value: pkr(db.advances.reduce((a, x) => a + x.recovered, 0), { compact: true }), tone: "success" }]} />
      <View style={{ marginVertical: 12 }}><SearchBar value={q} onChange={setQ} placeholder="Employee" /></View>
      {list.map((a) => {
        const e = db.employees.find((x) => x.id === a.employee_id)!;
        return (
          <RecordCard key={a.id} title={e.name} subtitle={`${fmtShort(a.date)} · ${a.notes}`} right={<T v="monoLg" style={{ fontSize: 15 }}>{pkr(a.amount, { compact: true })}</T>}
            fields={[{ label: "Client", value: clientName(db, e.client_id) }, { label: "Mode", value: a.mode }, { label: "Paid by", value: a.paid_by }, { label: "Recovered", value: pkr(a.recovered), mono: true, tone: a.recovered ? "success" : undefined }]} />
        );
      })}
    </>
  );
}

function Deferred() {
  const { db } = useDB();
  return (
    <>
      <Banner tone="info" title="Prepaid expenses recognised monthly" sub="Each month's share posts automatically at period close." />
      {db.deferred.map((d) => (
        <Card key={d.id} style={{ marginBottom: 10 }}>
          <T v="bodyStrong">{d.description}</T>
          <T v="small" muted>From {fmtMonth(d.start.slice(0, 7))} · {d.months} months</T>
          <View style={{ marginVertical: 10 }}><Progress value={d.recognised} max={d.months} tone="brand" /></View>
          <HStack><T v="small" soft style={{ flex: 1 }}>{d.recognised}/{d.months} recognised</T><T v="mono">{pkr((d.total / d.months) * d.recognised, { compact: true })} / {pkr(d.total, { compact: true })}</T></HStack>
        </Card>
      ))}
    </>
  );
}
