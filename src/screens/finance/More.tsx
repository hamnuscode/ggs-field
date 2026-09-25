import { Lock, LockOpen, Plus, Send, Undo2 } from "lucide-react-native";
import React, { useState } from "react";
import { View } from "react-native";
import { Bars, Columns, Progress } from "../../components/Charts";
import { Screen } from "../../components/Screen";
import { Select, Sheet, useOverlay } from "../../components/Sheet";
import { T } from "../../components/Text";
import { Badge, Banner, Button, Card, HStack, IconBtn, Input, Ledger, ListCard, RecordCard, Row, Section, StatGrid, Tabs } from "../../components/ui";
import { LAST_MONTH, TODAY } from "../../data/seed";
import { useDB } from "../../data/store";
import { useAuth } from "../../lib/auth";
import { addDays, fmtMonth, fmtShort, pkr } from "../../lib/format";
import { pnl } from "./Reports";

// ---------------------------------------------------------------- Partnership Run
export function PartnershipRun() {
  const { db } = useDB();
  const { can } = useAuth();
  const { toast, confirm } = useOverlay();
  const [month, setMonth] = useState(LAST_MONTH);
  const [state, setState] = useState<"none" | "draft" | "posted">("none");
  const profit = Math.max(0, pnl(db, month).net);
  const closed = db.periods.find((p) => p.month === month)?.status === "closed";
  return (
    <Screen eyebrow="Finance" title="Partnership Run" subtitle={fmtMonth(month)}
      footer={can("partnership.post") ? (
        state === "posted"
          ? <Button label="Reverse run" icon={Undo2} variant="danger" full onPress={async () => { if (await confirm({ title: "Reverse this run?", message: "Removes every partner allocation for the month.", confirmLabel: "Reverse", tone: "danger" })) { setState("draft"); toast("Run reversed", "warning"); } }} />
          : <>
            <Button label="Draft" variant="secondary" full onPress={() => { setState("draft"); toast("Draft calculated"); }} />
            <Button label="Post" icon={Send} full disabled={state !== "draft" || !closed} onPress={async () => { if (await confirm({ title: `Post ${fmtMonth(month)}?`, message: `Allocates ${pkr(profit)} across partners.`, confirmLabel: "Post" })) { setState("posted"); toast("Partnership run posted"); } }} />
          </>
      ) : undefined}>
      <Select compact label="Month" value={month} onChange={(m) => { setMonth(m); setState("none"); }} options={db.periods.map((p) => ({ value: p.month, label: fmtMonth(p.month), sub: p.status }))} />
      <View style={{ height: 12 }} />
      {!closed && <Banner tone="warning" title="Month is still open" sub="Close the period before posting a partnership run." />}
      <StatGrid items={[{ label: "Distributable profit", value: pkr(profit, { compact: true }), tone: "success" }, { label: "Run status", value: state === "none" ? "Not run" : state === "draft" ? "Draft" : "Posted", tone: state === "posted" ? "success" : state === "draft" ? "info" : "neutral" }]} />
      <Section title="What this run pays">
        {db.partners.map((p) => (
          <RecordCard key={p.id} title={p.name} subtitle={p.method} fields={[
            { label: "Share", value: `${p.share}%`, mono: true }, { label: "Base", value: pkr(profit, { compact: true }), mono: true },
            { label: "Amount", value: pkr(profit * (p.share / 100)), mono: true, tone: "success" }, { label: "Net position", value: pkr(p.contributed + p.allocated - p.drawn + (state === "posted" ? profit * (p.share / 100) : 0), { compact: true }), mono: true },
          ]} />
        ))}
      </Section>
      <Section title="Live but never billed">
        <ListCard>{db.contracts.filter((k) => k.status === "active" && !db.invoices.some((i) => i.contract_id === k.id && i.month === month)).map((k, i, a) => <Row key={k.id} last={i === a.length - 1} title={k.code} subtitle="No invoice this month" />)}</ListCard>
      </Section>
    </Screen>
  );
}

// ---------------------------------------------------------------- Period Close
export function PeriodClose() {
  const { db, commit } = useDB();
  const { toast, confirm } = useOverlay();
  return (
    <Screen eyebrow="Finance" title="Period Close" subtitle="Closed months are locked against every write.">
      {db.periods.map((p) => (
        <RecordCard key={p.month} title={fmtMonth(p.month)} badge={<Badge label={p.status === "closed" ? "Closed" : "Open"} tone={p.status === "closed" ? "success" : "warning"} dot />}
          fields={[
            { label: "Invoices", value: String(p.invoices), mono: true }, { label: "Payments", value: String(p.payments), mono: true }, { label: "Expenses", value: String(p.expenses), mono: true },
            { label: "Payslips", value: String(p.payslips), mono: true }, { label: "Advances", value: String(p.advances), mono: true }, { label: "Cheques", value: String(p.cheques), mono: true },
          ]}
          actions={[p.status === "closed"
            ? { label: "Reopen", icon: LockOpen, onPress: async () => { if (await confirm({ title: `Reopen ${fmtMonth(p.month)}`, message: "Every page will accept changes to this month again.", confirmLabel: "Reopen", tone: "danger", typed: p.month })) { commit((d) => { d.periods.find((x) => x.month === p.month)!.status = "open"; }); toast(`${fmtMonth(p.month)} reopened`, "warning"); } } }
            : { label: "Close", icon: Lock, tone: "brand", onPress: async () => { if (await confirm({ title: `Close ${fmtMonth(p.month)}`, message: "Locks invoices, payslips, expenses and cheques for the month.", confirmLabel: "Close month", typed: p.month })) { commit((d) => { d.periods.find((x) => x.month === p.month)!.status = "closed"; }); toast(`${fmtMonth(p.month)} closed`); } } }]} />
      ))}
    </Screen>
  );
}

// ---------------------------------------------------------------- Treasury
export function Treasury() {
  const { db } = useDB();
  const { toast } = useOverlay();
  const [tab, setTab] = useState<"forecast" | "entitlement" | "regional" | "reserves" | "capital">("forecast");
  const [req, setReq] = useState(false);
  const opening = db.banks.reduce((a, b) => a + b.balance, 0);
  const flows = Array.from({ length: 13 }, (_, i) => ({ inflow: 1_400_000 + ((i * 37) % 5) * 180_000, outflow: i % 4 === 0 ? 3_300_000 : 420_000 + ((i * 13) % 4) * 60_000 }));
  const weeks = flows.map((f, i) => {
    const o = opening + flows.slice(0, i).reduce((a, x) => a + x.inflow - x.outflow, 0);
    return { w: `W${i + 1}`, date: addDays(TODAY, i * 7), opening: o, inflow: f.inflow, outflow: f.outflow, closing: o + f.inflow - f.outflow };
  });
  return (
    <Screen eyebrow="Finance" title="Treasury" sticky={<Tabs value={tab} onChange={setTab} items={[{ key: "forecast", label: "13-week forecast" }, { key: "entitlement", label: "Cash entitlement" }, { key: "regional", label: "Regional P&L" }, { key: "reserves", label: "Reserves" }, { key: "capital", label: "Partner capital" }]} />}>
      {tab === "forecast" && (
        <>
          <Card><Columns data={weeks.map((w) => ({ label: w.w.slice(1), value: Math.max(0, w.closing) }))} format={(n) => `closing ${pkr(n, { compact: true })}`} /></Card>
          <View style={{ height: 10 }} />
          {weeks.map((w) => (
            <RecordCard key={w.w} title={`${w.w} · ${fmtShort(w.date)}`} fields={[{ label: "Opening", value: pkr(w.opening, { compact: true }), mono: true }, { label: "Inflow", value: pkr(w.inflow, { compact: true }), mono: true, tone: "success" }, { label: "Outflow", value: pkr(w.outflow, { compact: true }), mono: true, tone: "danger" }, { label: "Closing", value: pkr(w.closing, { compact: true }), mono: true, tone: w.closing < 0 ? "danger" : "brand" }]} />
          ))}
        </>
      )}
      {tab === "entitlement" && db.branches.map((b, i) => {
        const ent = [3_200_000, 2_100_000, 1_600_000][i]!;
        const res = [400_000, 250_000, 300_000][i]!;
        return <RecordCard key={b.id} title={b.name} fields={[{ label: "Entitlement", value: pkr(ent, { compact: true }), mono: true }, { label: "Restricted reserve", value: pkr(res, { compact: true }), mono: true }, { label: "Free", value: pkr(ent - res, { compact: true }), mono: true, tone: "success" }, { label: "Inter-region net", value: pkr([150_000, -90_000, -60_000][i]!, { compact: true, sign: true }), mono: true }]} />;
      })}
      {tab === "regional" && db.periods.slice(0, 3).flatMap((p) => db.branches.filter((b) => !b.ho_excluded).map((b, i) => {
        const rev = [2_900_000, 2_300_000][i]! + p.invoices * 1000;
        return <RecordCard key={p.month + b.id} title={`${b.name} · ${fmtMonth(p.month)}`} fields={[{ label: "Revenue", value: pkr(rev, { compact: true }), mono: true }, { label: "Direct cost", value: pkr(rev * 0.62, { compact: true }), mono: true }, { label: "Allocated HO", value: pkr(rev * 0.12, { compact: true }), mono: true }, { label: "Net profit", value: pkr(rev * 0.26, { compact: true }), mono: true, tone: "success" }]} />;
      }))}
      {tab === "reserves" && [["Gratuity", 1_200_000, 1_800_000], ["Weapon replacement", 450_000, 500_000], ["Contingency", 900_000, 1_000_000]].map(([n, b, tg]) => (
        <Card key={n as string} style={{ marginBottom: 10 }}>
          <HStack><T v="bodyStrong" style={{ flex: 1 }}>{n}</T><T v="mono">{pkr(b as number, { compact: true })} / {pkr(tg as number, { compact: true })}</T></HStack>
          <View style={{ marginVertical: 10 }}><Progress value={b as number} max={tg as number} tone={(b as number) < (tg as number) ? "warning" : "success"} /></View>
          <HStack><T v="small" muted style={{ flex: 1 }}>Shortfall {pkr((tg as number) - (b as number))}</T><Button size="sm" variant="secondary" label="Fund" onPress={() => toast(`${n} funding queued`)} /></HStack>
        </Card>
      ))}
      {tab === "capital" && (
        <>
          <ListCard>{db.partners.map((p, i) => <Row key={p.id} last={i === db.partners.length - 1} title={p.name} subtitle={p.scope} right={<T v="mono">{pkr(p.contributed - p.drawn, { compact: true })}</T>} />)}</ListCard>
          <Section title="Cash sub-ledgers">
            <ListCard>{db.custodians.map((c, i) => <Row key={c.id} last={i === db.custodians.length - 1} title={c.location} subtitle={c.holder} right={<T v="mono">{pkr(c.held, { compact: true })}</T>} />)}</ListCard>
          </Section>
        </>
      )}
      <Button label="Request inter-region funding" variant="secondary" style={{ marginTop: 18 }} onPress={() => setReq(true)} />
      <Sheet open={req} onClose={() => setReq(false)} title="Request inter-region funding" footer={<Button label="Send request" full onPress={() => { setReq(false); toast("Request sent for approval"); }} />}>
        <Select label="From region" value="b1" onChange={() => {}} options={db.branches.map((b) => ({ value: b.id, label: b.name }))} />
        <Select label="To region" value="b2" onChange={() => {}} options={db.branches.map((b) => ({ value: b.id, label: b.name }))} />
        <Input label="Amount" amount />
        <Input label="Purpose" multiline />
      </Sheet>
    </Screen>
  );
}

// ---------------------------------------------------------------- Regional Scorecard
export function RegionalScorecard() {
  const { db } = useDB();
  const byRegion = db.branches.map((b, i) => {
    const staff = db.employees.filter((e) => e.branch_id === b.id && e.lifecycle === "active").length;
    const opex = db.expenses.filter((x) => (x.client_id ? db.clients.find((c) => c.id === x.client_id)?.branch_id === b.id : i === 2)).reduce((a, x) => a + x.amount, 0);
    return { b, staff, opex, perGuard: staff ? opex / staff : 0 };
  });
  return (
    <Screen eyebrow="Finance" title="Regional Scorecard" subtitle="Regional operating expenses">
      <StatGrid cols={3} items={byRegion.map((r) => ({ label: r.b.name, value: pkr(r.opex, { compact: true }), hint: `${r.staff} staff` }))} />
      <Section title="Spend per head">
        <Card><Bars data={byRegion.map((r) => ({ label: r.b.name, value: Math.round(r.perGuard), sub: `${r.staff} active staff` }))} format={(n) => pkr(n)} /></Card>
      </Section>
      {byRegion.map((r) => (
        <Section key={r.b.id} title={r.b.name}>
          <Card>
            {Object.entries(db.expenses.filter((x) => (x.client_id ? db.clients.find((c) => c.id === x.client_id)?.branch_id === r.b.id : r.b.kind === "head_office")).reduce<Record<string, number>>((a, x) => ((a[x.category] = (a[x.category] ?? 0) + x.amount), a), {})).map(([k, v]) => <Ledger key={k} label={k} value={pkr(v)} />)}
            <Ledger label="Total" value={pkr(r.opex)} strong top />
          </Card>
        </Section>
      ))}
    </Screen>
  );
}

// ---------------------------------------------------------------- Partner Accounts
export function Partners() {
  const { db, commit } = useDB();
  const { can } = useAuth();
  const { toast } = useOverlay();
  const [tab, setTab] = useState<"partners" | "ledger" | "rmd">("partners");
  const [entry, setEntry] = useState<null | "drawing" | "contribution" | "allocation">(null);
  const [f, setF] = useState({ partner: db.partners[0]!.id, amount: "" });
  return (
    <Screen eyebrow="Finance" title="Partner Accounts" actions={can("accounting.edit") ? <IconBtn icon={Plus} label="Record entry" filled onPress={() => setEntry("drawing")} /> : undefined}
      sticky={<Tabs value={tab} onChange={setTab} items={[{ key: "partners", label: "Partners" }, { key: "ledger", label: "Ledger" }, { key: "rmd", label: "RMD statements" }]} />}>
      {tab === "partners" && db.partners.map((p) => (
        <RecordCard key={p.id} title={p.name} subtitle={p.scope} badge={<Badge label={p.status} small />} fields={[{ label: "Method", value: p.method }, { label: "Profit share", value: `${p.share}%`, mono: true }]} />
      ))}
      {tab === "ledger" && db.partners.map((p) => (
        <Section key={p.id} title={p.name}>
          <Card>
            <Ledger label="Contribution (in)" value={pkr(p.contributed)} tone="success" />
            <Ledger label="Allocation (in)" value={pkr(p.allocated)} tone="success" />
            <Ledger label="Drawing (out)" value={pkr(-p.drawn)} tone="danger" />
            <Ledger label="Balance" value={pkr(p.contributed + p.allocated - p.drawn)} strong top />
          </Card>
        </Section>
      ))}
      {tab === "rmd" && db.partners.map((p) => (
        <RecordCard key={p.id} title={p.name} subtitle={p.scope} fields={[
          { label: "Opening", value: pkr(p.contributed, { compact: true }), mono: true }, { label: "Profit share", value: pkr(p.allocated, { compact: true }), mono: true },
          { label: "Holding for co.", value: pkr(p.id === "pt1" ? 300_000 : 0, { compact: true }), mono: true }, { label: "Paid out", value: pkr(p.drawn, { compact: true }), mono: true },
          { label: "Net owed", value: pkr(p.allocated - p.drawn), mono: true, tone: "warning", full: true },
        ]} />
      ))}
      <Sheet open={!!entry} onClose={() => setEntry(null)} title="Record partner entry" footer={<Button label="Record" full disabled={!Number(f.amount)} onPress={() => {
        commit((d) => { const p = d.partners.find((x) => x.id === f.partner)!; const n = Number(f.amount); if (entry === "drawing") p.drawn += n; else if (entry === "contribution") p.contributed += n; else p.allocated += n; });
        setEntry(null); setF({ ...f, amount: "" }); toast("Entry recorded");
      }} />}>
        <Select label="Type" value={entry ?? "drawing"} onChange={(v) => setEntry(v as "drawing")} options={[{ value: "drawing", label: "Drawing" }, { value: "contribution", label: "Contribution" }, { value: "allocation", label: "Profit allocation" }]} />
        <Select label="Partner" value={f.partner} onChange={(v) => setF({ ...f, partner: v })} options={db.partners.map((p) => ({ value: p.id, label: p.name }))} />
        <Input label="Amount" amount value={f.amount} onChangeText={(v) => setF({ ...f, amount: v })} />
      </Sheet>
    </Screen>
  );
}

// ---------------------------------------------------------------- Project Financing
export function ProjectFinancing() {
  const { db, commit } = useDB();
  const { can } = useAuth();
  const { toast } = useOverlay();
  const [inv, setInv] = useState<string | null>(null);
  const [f, setF] = useState({ name: "", amount: "" });
  return (
    <Screen eyebrow="Finance" title="Project Financing">
      {db.projects.map((p) => (
        <Card key={p.id} style={{ marginBottom: 12 }}>
          <HStack><T v="h3" style={{ flex: 1 }}>{p.name}</T><Badge label={p.raised >= p.target ? "Funded" : "Raising"} tone={p.raised >= p.target ? "success" : "warning"} small /></HStack>
          <View style={{ marginVertical: 12 }}><Progress value={p.raised} max={p.target} tone={p.raised >= p.target ? "success" : "brand"} /></View>
          <Ledger label="Raised" value={`${pkr(p.raised, { compact: true })} of ${pkr(p.target, { compact: true })}`} />
          <T v="eyebrow" muted style={{ marginTop: 12, marginBottom: 4 }}>Investors</T>
          {p.investors.map((x) => <Ledger key={x.name} label={x.name} value={pkr(x.amount, { compact: true })} sub={`${Math.round((x.amount / p.target) * 100)}% stake`} />)}
          {can("accounting.edit") && p.raised < p.target && <Button size="sm" variant="secondary" icon={Plus} label="Add investment" style={{ marginTop: 10 }} onPress={() => setInv(p.id)} />}
        </Card>
      ))}
      <Sheet open={!!inv} onClose={() => setInv(null)} title="Add investment" footer={<Button label="Record" full disabled={!f.name || !Number(f.amount)} onPress={() => {
        commit((d) => { const p = d.projects.find((x) => x.id === inv)!; p.investors.push({ name: f.name, amount: Number(f.amount) }); p.raised += Number(f.amount); });
        setInv(null); setF({ name: "", amount: "" }); toast("Investment recorded");
      }} />}>
        <Select label="Investor" value={f.name} onChange={(v) => setF({ ...f, name: v })} options={db.partners.map((p) => ({ value: p.name, label: p.name }))} />
        <Input label="Amount" amount value={f.amount} onChangeText={(v) => setF({ ...f, amount: v })} />
      </Sheet>
    </Screen>
  );
}
