import { Download, Plus } from "lucide-react-native";
import React, { useState } from "react";
import { View } from "react-native";
import { Bars } from "../../components/Charts";
import { Screen } from "../../components/Screen";
import { Select, Sheet, useOverlay } from "../../components/Sheet";
import { T } from "../../components/Text";
import { Badge, Button, Card, IconBtn, Input, Ledger, ListCard, RecordCard, Row, Section, Segmented, StatGrid, Tabs } from "../../components/ui";
import { LAST_MONTH, TODAY } from "../../data/seed";
import { clientName, invoiceReceived, roster, useDB } from "../../data/store";
import { useAuth } from "../../lib/auth";
import { fmtMonth, fmtShort, pkr } from "../../lib/format";

// Pure report maths — no DOM, shareable with web.
export function pnl(db: ReturnType<typeof useDB>["db"], month: string) {
  const revenue = db.invoices.filter((i) => i.month === month).reduce((a, i) => a + i.amount / 1.16, 0);
  const salaries = db.payslips.filter((p) => p.month === month).reduce((a, p) => a + p.base + p.allowance + p.bonus, 0);
  const exp = db.expenses.filter((x) => x.date.startsWith(month));
  const cos = exp.filter((x) => x.nature === "Cost of Services");
  const opex = exp.filter((x) => x.nature === "Operating Expense");
  const group = (xs: typeof exp) => Object.entries(xs.reduce<Record<string, number>>((a, x) => ((a[x.category] = (a[x.category] ?? 0) + x.amount), a), {}));
  const cosTotal = salaries + cos.reduce((a, x) => a + x.amount, 0);
  const opexTotal = opex.reduce((a, x) => a + x.amount, 0);
  return { revenue, salaries, cos: group(cos), opex: group(opex), cosTotal, opexTotal, gross: revenue - cosTotal, net: revenue - cosTotal - opexTotal };
}

export default function Reports() {
  const { can } = useAuth();
  const { toast } = useOverlay();
  const [basis, setBasis] = useState<"revenue" | "cash">("revenue");
  const [tab, setTab] = useState<"pl" | "regional" | "clients" | "cover">("pl");
  return (
    <Screen
      region
      eyebrow="Finance"
      title="Financial Reports"
      actions={<IconBtn icon={Download} label="Export" onPress={() => toast("Report exported", "info")} />}
      sticky={<>
        {can("cashflow.view") && <Segmented value={basis} onChange={setBasis} items={[{ key: "revenue", label: "Revenue basis" }, { key: "cash", label: "Cash basis" }]} />}
        {basis === "revenue" && <Tabs value={tab} onChange={setTab} items={[{ key: "pl", label: "Profit & Loss" }, { key: "regional", label: "Regional" }, { key: "clients", label: "Client statements" }, { key: "cover", label: "Contracted vs deployed" }]} />}
      </>}
    >
      {basis === "cash" ? <CashflowBody /> : tab === "pl" ? <PL /> : tab === "regional" ? <Regional /> : tab === "clients" ? <ClientStatements /> : <Cover />}
    </Screen>
  );
}

function PL() {
  const { db } = useDB();
  const months = db.periods.map((p) => p.month);
  const [month, setMonth] = useState(LAST_MONTH);
  const r = pnl(db, month);
  return (
    <>
      <Select compact label="Month" value={month} onChange={setMonth} options={months.map((m) => ({ value: m, label: fmtMonth(m) }))} />
      <View style={{ height: 12 }} />
      <StatGrid items={[{ label: "Revenue", value: pkr(r.revenue, { compact: true }), tone: "brand" }, { label: "Net profit", value: pkr(r.net, { compact: true }), tone: r.net >= 0 ? "success" : "danger", hint: r.revenue ? `${Math.round((r.net / r.revenue) * 100)}% margin` : undefined }]} />
      <Section title="Profit & Loss statement">
        <Card>
          <T v="eyebrow" muted>Revenue</T>
          <Ledger label="Guarding services" value={pkr(r.revenue)} indent />
          <Ledger label="Total revenue" value={pkr(r.revenue)} strong top />
          <T v="eyebrow" muted style={{ marginTop: 14 }}>Cost of services</T>
          <Ledger label="Guard salaries" value={pkr(r.salaries)} indent />
          {r.cos.map(([k, v]) => <Ledger key={k} label={k} value={pkr(v)} indent />)}
          <Ledger label="Total cost of services" value={pkr(r.cosTotal)} strong top />
          <Ledger label="Gross profit" value={pkr(r.gross)} strong tone={r.gross >= 0 ? "success" : "danger"} />
          <T v="eyebrow" muted style={{ marginTop: 14 }}>Operating expenses</T>
          {r.opex.map(([k, v]) => <Ledger key={k} label={k} value={pkr(v)} indent />)}
          <Ledger label="Total operating expenses" value={pkr(r.opexTotal)} strong top />
          <Ledger label="Net profit" value={pkr(r.net)} strong top tone={r.net >= 0 ? "success" : "danger"} />
        </Card>
      </Section>
    </>
  );
}

function Regional() {
  const { db } = useDB();
  const rows = db.branches.map((b) => {
    const cl = db.clients.filter((c) => c.branch_id === b.id).map((c) => c.id);
    const revenue = db.invoices.filter((i) => cl.includes(i.client_id) && i.month === LAST_MONTH).reduce((a, i) => a + i.amount / 1.16, 0);
    const own = db.payslips.filter((p) => p.month === LAST_MONTH && db.employees.find((e) => e.id === p.employee_id)?.branch_id === b.id).reduce((a, p) => a + p.net, 0);
    return { b, revenue, own };
  });
  const hoPool = db.expenses.filter((x) => x.nature === "Operating Expense").reduce((a, x) => a + x.amount, 0);
  const regional = rows.filter((r) => !r.b.ho_excluded);
  const revTot = regional.reduce((a, r) => a + r.revenue, 0) || 1;
  return (
    <>
      {rows.map((r) => {
        const ho = r.b.ho_excluded ? 0 : hoPool * (r.revenue / revTot);
        const net = r.revenue - r.own - ho;
        return (
          <RecordCard key={r.b.id} title={r.b.name} subtitle={r.b.kind === "head_office" ? "Head office" : "Regional"} badge={r.b.ho_excluded ? <Badge label="HO excluded" small tone="neutral" /> : undefined}
            fields={[{ label: "Revenue", value: pkr(r.revenue, { compact: true }), mono: true }, { label: "Own cost", value: pkr(r.own, { compact: true }), mono: true }, { label: "HO allocated", value: pkr(ho, { compact: true }), mono: true }, { label: "Total cost", value: pkr(r.own + ho, { compact: true }), mono: true }, { label: "Net", value: pkr(net, { compact: true }), mono: true, tone: net >= 0 ? "success" : "danger", full: true }]} />
        );
      })}
      <Section title="Head office pool"><Card><Ledger label="Operating expenses shared by revenue" value={pkr(hoPool)} strong /></Card></Section>
      <Section title="Own cost by category">
        <Card><Bars data={Object.entries(db.expenses.reduce<Record<string, number>>((a, x) => ((a[x.category] = (a[x.category] ?? 0) + x.amount), a), {})).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value]) => ({ label, value }))} format={(n) => pkr(n, { compact: true })} /></Card>
      </Section>
    </>
  );
}

function ClientStatements({ cash }: { cash?: boolean }) {
  const { db } = useDB();
  const [open, setOpen] = useState<string | null>(null);
  const rows = db.clients.filter((c) => c.status === "active").map((c) => {
    const inv = db.invoices.filter((i) => i.client_id === c.id);
    const invoiced = inv.reduce((a, i) => a + i.amount, 0);
    const received = inv.reduce((a, i) => a + invoiceReceived(i), 0);
    const payroll = db.payslips.filter((p) => db.employees.find((e) => e.id === p.employee_id)?.client_id === c.id).reduce((a, p) => a + p.net, 0);
    const direct = db.expenses.filter((x) => x.client_id === c.id).reduce((a, x) => a + x.amount, 0);
    const overhead = Math.round(invoiced * 0.04);
    const top = cash ? received : invoiced;
    return { c, invoiced, received, payroll, direct, overhead, income: top - payroll - direct - overhead };
  });
  const tot = rows.reduce((a, r) => ({ inv: a.inv + (cash ? r.received : r.invoiced), pay: a.pay + r.payroll, dir: a.dir + r.direct, oh: a.oh + r.overhead, inc: a.inc + r.income }), { inv: 0, pay: 0, dir: 0, oh: 0, inc: 0 });
  const cur = rows.find((r) => r.c.id === open);
  return (
    <>
      <StatGrid items={[
        { label: cash ? "Cash received" : "Invoiced", value: pkr(tot.inv, { compact: true }), tone: "brand" }, { label: "Payroll", value: pkr(tot.pay, { compact: true }), tone: "danger" },
        { label: "Direct expenses", value: pkr(tot.dir, { compact: true }), tone: "warning" }, { label: "Regional overhead", value: pkr(tot.oh, { compact: true }) },
        { label: cash ? "Net cash" : "Total income", value: pkr(tot.inc, { compact: true }), tone: tot.inc >= 0 ? "success" : "danger" },
      ]} />
      <View style={{ height: 12 }} />
      {rows.map((r) => (
        <RecordCard key={r.c.id} title={r.c.name} onPress={() => setOpen(r.c.id)} fields={[
          { label: cash ? "Cash received" : "Invoiced", value: pkr(cash ? r.received : r.invoiced, { compact: true }), mono: true }, { label: "Payroll", value: pkr(r.payroll, { compact: true }), mono: true },
          { label: "Direct", value: pkr(r.direct, { compact: true }), mono: true }, { label: "Overhead", value: pkr(r.overhead, { compact: true }), mono: true },
          { label: cash ? "Net cash" : "Income", value: pkr(r.income), mono: true, tone: r.income >= 0 ? "success" : "danger", full: true },
        ]} />
      ))}
      <Sheet open={!!cur} onClose={() => setOpen(null)} title={cash ? "Full client statement (cash basis)" : "Full client statement"} subtitle={cur?.c.name}>
        {cur && (
          <>
            <Ledger label={cash ? "Cash received" : "Invoiced"} value={pkr(cash ? cur.received : cur.invoiced)} />
            <Ledger label="Payroll expense" value={pkr(-cur.payroll)} />
            <Ledger label="Direct expenses" value={pkr(-cur.direct)} />
            <Ledger label="Regional overhead" value={pkr(-cur.overhead)} />
            <Ledger label={cash ? "Net cash" : "Total income"} value={pkr(cur.income)} strong top tone={cur.income >= 0 ? "success" : "danger"} />
            <Section title="Invoices">
              <ListCard>{db.invoices.filter((i) => i.client_id === cur.c.id).map((i, n, a) => <Row key={i.id} last={n === a.length - 1} title={i.number} meta={fmtMonth(i.month)} right={<T v="mono">{pkr(i.amount, { compact: true })}</T>} />)}</ListCard>
            </Section>
          </>
        )}
      </Sheet>
    </>
  );
}

function Cover() {
  const { db } = useDB();
  const { toast } = useOverlay();
  const rows = db.clients.filter((c) => c.status === "active").map((c) => {
    const contracted = db.contracts.find((k) => k.client_id === c.id)?.lines.reduce((a, l) => a + l.committed, 0) ?? 0;
    const deployed = db.sites.filter((s) => s.client_id === c.id).reduce((a, s) => a + s.shifts.reduce((b, sh) => b + roster(db, s.id, sh.shift).length, 0), 0);
    const cost = db.employees.filter((e) => e.client_id === c.id && e.lifecycle === "active").reduce((a, e) => a + e.base + e.allowance, 0);
    return { c, contracted, deployed, gap: deployed - contracted, cost };
  });
  return (
    <>
      <Button size="sm" variant="secondary" icon={Download} label="Export" onPress={() => toast("Exported", "info")} />
      <View style={{ height: 12 }} />
      {rows.map((r) => (
        <RecordCard key={r.c.id} title={r.c.name} badge={r.gap ? <Badge label={`Gap ${r.gap > 0 ? "+" : ""}${r.gap}`} tone={r.gap < 0 ? "danger" : "warning"} small /> : <Badge label="Matched" tone="success" small />}
          fields={[{ label: "Contracted", value: String(r.contracted), mono: true }, { label: "Deployed", value: String(r.deployed), mono: true }, { label: "Monthly cost", value: pkr(r.cost), mono: true, full: true }]} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------- Cash basis / Cash Flow
export function CashflowBody() {
  const { db } = useDB();
  const [tab, setTab] = useState<"revenue" | "payroll" | "expenses" | "advances" | "flow" | "clients">("flow");
  const receipts = db.invoices.flatMap((i) => i.payments.map((p) => ({ ...p, client: i.client_id })));
  const paid = db.payslips.filter((p) => p.paid_on);
  const inflow = receipts.reduce((a, p) => a + p.amount, 0);
  const payroll = paid.reduce((a, p) => a + p.net, 0);
  const exp = db.expenses.filter((x) => x.mode !== "Payable").reduce((a, x) => a + x.amount, 0);
  const adv = db.advances.reduce((a, x) => a + x.amount, 0);
  const drawings = db.partners.reduce((a, p) => a + p.drawn, 0);
  return (
    <>
      <Tabs value={tab} onChange={setTab} items={[{ key: "flow", label: "Cash flow" }, { key: "revenue", label: "Revenue" }, { key: "payroll", label: "Payroll" }, { key: "expenses", label: "Expenses" }, { key: "advances", label: "Advances" }, { key: "clients", label: "Client statements" }]} />
      <View style={{ height: 14 }} />
      {tab === "flow" && (
        <Card>
          <T v="h3" style={{ marginBottom: 8 }}>Cash flow statement</T>
          <T v="eyebrow" muted>Operating</T>
          <Ledger label="Cash received from clients" value={pkr(inflow)} indent tone="success" />
          <Ledger label="Salaries paid" value={pkr(-payroll)} indent />
          <Ledger label="Expenses paid" value={pkr(-exp)} indent />
          <Ledger label="Advances to staff" value={pkr(-adv)} indent />
          <Ledger label="Net operating cash" value={pkr(inflow - payroll - exp - adv)} strong top />
          <T v="eyebrow" muted style={{ marginTop: 14 }}>Non-operating cash movements</T>
          <Ledger label="Partner drawings" value={pkr(-drawings)} indent />
          <Ledger label="Partner contributions" value={pkr(db.partners.reduce((a, p) => a + p.contributed, 0))} indent />
          <Ledger label="Net change in cash" value={pkr(inflow - payroll - exp - adv - drawings)} strong top tone="brand" />
        </Card>
      )}
      {tab === "revenue" && <ListCard>{receipts.map((p, i) => <Row key={p.id + i} last={i === receipts.length - 1} title={clientName(db, p.client)} meta={`${fmtShort(p.date)} · ${p.mode}`} right={<T v="mono">{pkr(p.amount, { compact: true })}</T>} />)}</ListCard>}
      {tab === "payroll" && <ListCard>{paid.slice(0, 40).map((p, i) => <Row key={p.id} last={i === Math.min(paid.length, 40) - 1} title={db.employees.find((e) => e.id === p.employee_id)!.name} meta={`${fmtShort(p.paid_on)} · ${p.mode}`} right={<T v="mono">{pkr(p.net, { compact: true })}</T>} />)}</ListCard>}
      {tab === "expenses" && <ListCard>{db.expenses.filter((x) => x.mode !== "Payable").map((x, i, a) => <Row key={x.id} last={i === a.length - 1} title={x.description} meta={`${fmtShort(x.date)} · ${x.mode}`} right={<T v="mono">{pkr(x.amount, { compact: true })}</T>} />)}</ListCard>}
      {tab === "advances" && <ListCard>{db.advances.map((x, i) => <Row key={x.id} last={i === db.advances.length - 1} title={db.employees.find((e) => e.id === x.employee_id)!.name} meta={`${fmtShort(x.date)} · ${x.mode}`} right={<T v="mono">{pkr(x.amount, { compact: true })}</T>} />)}</ListCard>}
      {tab === "clients" && <ClientStatements cash />}
    </>
  );
}

export function Cashflow() {
  return (
    <Screen region eyebrow="Finance" title="Cash Flow">
      <CashflowBody />
    </Screen>
  );
}

// ---------------------------------------------------------------- Partnership report (standalone)
export function PartnershipReport() {
  const { db, commit } = useDB();
  const { can } = useAuth();
  const { toast } = useOverlay();
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState(false);
  const [pay, setPay] = useState("");
  const [f, setF] = useState({ name: "", share: "", scope: "Company-wide" });
  const p = db.partners.find((x) => x.id === open);
  const profit = pnl(db, LAST_MONTH).net;
  return (
    <Screen eyebrow="Finance" title="Partnership Report" subtitle={`Profit for ${fmtMonth(LAST_MONTH)}: ${pkr(profit)}`}
      actions={can("accounting.edit") ? <IconBtn icon={Plus} label="Add partner" filled onPress={() => setForm(true)} /> : undefined}>
      {db.partners.map((x) => (
        <RecordCard key={x.id} title={x.name} subtitle={`${x.scope} · ${x.method}`} onPress={() => setOpen(x.id)} right={<T v="monoLg">{x.share}%</T>}
          fields={[{ label: "Share of profit", value: pkr(Math.max(0, profit) * (x.share / 100)), mono: true, tone: "success" }, { label: "Net position", value: pkr(x.contributed + x.allocated - x.drawn, { compact: true }), mono: true }]} />
      ))}
      <Section title="Partnership policy">
        <Card>
          <Ledger label="Retained before distribution" value="10%" />
          <Ledger label="Distribution" value="Monthly, after close" />
          <Ledger label="Unallocated share" value={`${100 - db.partners.reduce((a, x) => a + x.share, 0)}%`} strong top />
        </Card>
      </Section>
      <Sheet open={!!p} onClose={() => setOpen(null)} title={p?.name ?? ""} subtitle={p?.scope} footer={can("accounting.edit") ? <Button label="Record payment" full disabled={!pay} onPress={() => { commit((d) => { d.partners.find((x) => x.id === open)!.drawn += Number(pay); }); setPay(""); toast("Partner payment recorded"); }} /> : undefined}>
        {p && (
          <>
            <Section title="Client shares" style={{ marginTop: 0 }}>
              <ListCard>{db.clients.filter((c) => c.status === "active").slice(0, 4).map((c, i) => <Row key={c.id} last={i === 3} title={c.name} right={<T v="mono">{p.share}%</T>} />)}</ListCard>
            </Section>
            <Section title="Ledger">
              <Ledger label="Contributions" value={pkr(p.contributed)} />
              <Ledger label="Remuneration allocated" value={pkr(p.allocated)} />
              <Ledger label="Cash paid" value={pkr(-p.drawn)} />
              <Ledger label="Balance" value={pkr(p.contributed + p.allocated - p.drawn)} strong top />
            </Section>
            {can("accounting.edit") && <View style={{ marginTop: 14 }}><Input label="Record payment" amount value={pay} onChangeText={setPay} /></View>}
          </>
        )}
      </Sheet>
      <Sheet open={form} onClose={() => setForm(false)} title="Add partner" footer={<Button label="Add" full disabled={!f.name || !f.share} onPress={() => { commit((d) => { d.partners.push({ id: `pt${Date.now()}`, name: f.name, scope: f.scope, method: "Fixed %", share: Number(f.share), status: "active", allocated: 0, contributed: 0, drawn: 0 }); }); setForm(false); toast("Partner added"); }} />}>
        <Input label="Name" required value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
        <Input label="Profit share %" required keyboardType="numeric" value={f.share} onChangeText={(v) => setF({ ...f, share: v })} />
        <Select label="Scope" value={f.scope} onChange={(v) => setF({ ...f, scope: v })} options={["Company-wide", ...db.branches.map((b) => `${b.name} region`)].map((s) => ({ value: s, label: s }))} />
      </Sheet>
      <T v="small" muted style={{ marginTop: 16 }}>As of {fmtShort(TODAY)}</T>
    </Screen>
  );
}
