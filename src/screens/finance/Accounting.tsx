import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowDownToLine, ArrowRightLeft, Banknote, FileText, History, Landmark, Pencil, Plus, Receipt, Undo2, Wallet } from "lucide-react-native";
import React, { useState } from "react";
import { View } from "react-native";
import { PaymentFields, PayForm } from "../../components/PaymentFields";
import { Screen } from "../../components/Screen";
import { Select, Sheet, useOverlay } from "../../components/Sheet";
import { T } from "../../components/Text";
import { Badge, Button, Card, Chips, Empty, HStack, IconBtn, Input, Ledger, ListCard, RecordCard, Row, SearchBar, Section, Segmented, StatGrid, Tabs, toneOf } from "../../components/ui";
import { Txn, TODAY } from "../../data/seed";
import { bankOptions, clientName, custodianOptions, receivableFor, useDB } from "../../data/store";
import { useAuth } from "../../lib/auth";
import { fmtDate, fmtShort, pkr } from "../../lib/format";
import { inRegion, useRegion } from "../../lib/region";
import { useTheme } from "../../theme/ThemeProvider";

type Tab = "receivables" | "payables" | "banks" | "custody";
const blankPay = (): PayForm => ({ amount: "", date: TODAY, mode: "Bank", account: "", notes: "" });

export default function Accounting() {
  const { tab: initial } = useLocalSearchParams<{ tab?: Tab }>();
  const { can, canAny } = useAuth();
  const tabs = [
    ...(can("receivables.view") || can("accounting.edit") ? [{ key: "receivables" as Tab, label: "Receivables" }] : []),
    ...(can("payables.view") || can("accounting.edit") ? [{ key: "payables" as Tab, label: "Payables" }] : []),
    ...(can("banks.view") ? [{ key: "banks" as Tab, label: "Bank accounts" }, { key: "custody" as Tab, label: "Cash custody" }] : []),
  ];
  const [tab, setTab] = useState<Tab>(tabs.some((x) => x.key === initial) ? initial! : tabs[0]?.key ?? "receivables");
  const [log, setLog] = useState<{ title: string; rows: Txn[] } | null>(null);
  const { db } = useDB();
  return (
    <Screen
      region
      eyebrow="Finance"
      title="Banks & Ledgers"
      actions={canAny(["banks.view"]) && (tab === "banks" || tab === "custody") ? <IconBtn icon={History} label="Transactions" onPress={() => setLog(tab === "banks" ? { title: "Transaction log", rows: db.bankTxns } : { title: "Custody transaction log", rows: db.custodyTxns })} /> : undefined}
      sticky={<Tabs value={tab} onChange={setTab} items={tabs} />}
    >
      {tab === "receivables" && <Receivables />}
      {tab === "payables" && <Payables />}
      {tab === "banks" && <Banks />}
      {tab === "custody" && <Custody />}
      <TxnLog log={log} onClose={() => setLog(null)} />
    </Screen>
  );
}

function TxnLog({ log, onClose }: { log: { title: string; rows: Txn[] } | null; onClose: () => void }) {
  const t = useTheme();
  return (
    <Sheet open={!!log} onClose={onClose} title={log?.title ?? ""} full>
      {log?.rows.map((x) => (
        <Card key={x.id} style={{ marginBottom: 8 }}>
          <HStack>
            <View style={{ flex: 1 }}>
              <T v="smallStrong" style={{ fontSize: 14 }}>{x.kind}</T>
              <T v="small" muted>{x.account} · {x.description}</T>
            </View>
            <T v="monoLg" color={x.delta < 0 ? t.tone("danger").text : t.tone("success").text}>{pkr(x.delta, { sign: true, compact: true })}</T>
          </HStack>
          <T v="mono" muted style={{ fontSize: 11, marginTop: 6 }}>{fmtShort(x.date)} · {pkr(x.before, { compact: true })} → {pkr(x.after, { compact: true })}</T>
        </Card>
      ))}
    </Sheet>
  );
}

// ---------------------------------------------------------------- Receivables
function Receivables() {
  const router = useRouter();
  const { db, commit } = useDB();
  const { can } = useAuth();
  const { regionId } = useRegion();
  const { toast } = useOverlay();
  const [q, setQ] = useState("");
  const [pay, setPay] = useState<string | null>(null);
  const [wht, setWht] = useState<string | null>(null);
  const [f, setF] = useState<PayForm>(blankPay());
  const [whtAmt, setWhtAmt] = useState("");
  const clients = db.clients.filter((c) => inRegion(regionId, c.branch_id) && (!q || c.name.toLowerCase().includes(q.toLowerCase())));
  const rows = clients.map((c) => ({ c, r: receivableFor(db, c.id) }));
  const tot = rows.reduce((a, { r }) => ({ opening: a.opening + r.opening, invoiced: a.invoiced + r.invoiced, wht: a.wht + r.wht, received: a.received + r.received, out: a.out + r.outstanding }), { opening: 0, invoiced: 0, wht: 0, received: 0, out: 0 });
  const canEdit = can("accounting.edit");

  const applyToOldest = (clientId: string, amount: number, whtOnly = false) => commit((d) => {
    let left = amount;
    for (const inv of d.invoices.filter((i) => i.client_id === clientId && i.status !== "Paid").sort((a, b) => a.month.localeCompare(b.month))) {
      if (left <= 0) break;
      const due = inv.amount - inv.payments.reduce((a, p) => a + p.amount + p.wht, 0);
      const use = Math.min(due, left);
      inv.payments.push({ id: `p${Date.now()}${inv.id}`, date: f.date, amount: whtOnly ? 0 : use, mode: (f.mode as "Bank") || "Bank", notes: whtOnly ? "WHT certificate" : f.notes, wht: whtOnly ? use : 0 });
      inv.status = use >= due ? "Paid" : "Partial";
      left -= use;
    }
  });

  return (
    <>
      <StatGrid items={[
        { label: "Opening", value: pkr(tot.opening, { compact: true }), tone: "neutral" },
        { label: "Invoiced", value: pkr(tot.invoiced, { compact: true }), tone: "brand" },
        { label: "Withholding", value: pkr(tot.wht, { compact: true }), tone: "danger" },
        { label: "Received", value: pkr(tot.received, { compact: true }), tone: "success" },
        { label: "Outstanding", value: pkr(tot.out, { compact: true }), tone: "warning" },
      ]} />
      <View style={{ marginVertical: 12 }}><SearchBar value={q} onChange={setQ} placeholder="Client" /></View>
      {rows.map(({ c, r }) => (
        <RecordCard key={c.id} title={c.name} subtitle={c.code} onPress={() => router.push(`/accounting/statement/${c.id}`)} accent={r.outstanding > 0 ? "warning" : undefined}
          fields={[
            { label: "Opening", value: pkr(r.opening, { compact: true }), mono: true }, { label: "Invoiced", value: pkr(r.invoiced, { compact: true }), mono: true },
            { label: "Withholding", value: pkr(r.wht, { compact: true }), mono: true }, { label: "Received", value: pkr(r.received, { compact: true }), mono: true, tone: "success" },
            { label: "Outstanding", value: pkr(r.outstanding), mono: true, tone: r.outstanding > 0 ? "warning" : undefined, full: true },
          ]}
          actions={[
            { label: "Statement", icon: FileText, onPress: () => router.push(`/accounting/statement/${c.id}`) },
            ...(canEdit ? [{ label: "Payment", icon: Wallet, onPress: () => { setF(blankPay()); setPay(c.id); } }, { label: "WHT", icon: Receipt, onPress: () => { setWhtAmt(""); setWht(c.id); } }] : []),
          ]} />
      ))}
      <Sheet open={!!pay} onClose={() => setPay(null)} title="Record payment" subtitle={pay ? `${clientName(db, pay)} · applied oldest invoice first` : ""}
        footer={<Button label="Record" full disabled={!Number(f.amount) || !f.account} onPress={() => { applyToOldest(pay!, Number(f.amount)); setPay(null); toast("Payment recorded"); }} />}>
        <PaymentFields f={f} set={(p) => setF({ ...f, ...p })} />
      </Sheet>
      <Sheet open={!!wht} onClose={() => setWht(null)} title="Record withholding tax" subtitle={wht ? clientName(db, wht) : ""}
        footer={<Button label="Record" full disabled={!Number(whtAmt)} onPress={() => { applyToOldest(wht!, Number(whtAmt), true); setWht(null); toast("Withholding recorded"); }} />}>
        <Input label="Amount withheld" amount value={whtAmt} onChangeText={setWhtAmt} />
        <Input label="Certificate no." />
      </Sheet>
    </>
  );
}

export function ClientStatement() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const { db } = useDB();
  const { toast } = useOverlay();
  const c = db.clients.find((x) => x.id === clientId);
  if (!c) return <Screen title="Statement"><Empty title="Client not found" /></Screen>;
  const r = receivableFor(db, c.id);
  const inv = db.invoices.filter((i) => i.client_id === c.id).sort((a, b) => a.month.localeCompare(b.month));
  const moves = [
    { date: "", entry: "Opening balance", ref: "", inv: r.opening, rec: 0, wht: 0 },
    ...inv.flatMap((i) => [
      { date: i.date, entry: "Invoice", ref: i.number, inv: i.amount, rec: 0, wht: 0 },
      ...i.payments.map((p) => ({ date: p.date, entry: p.wht && !p.amount ? "Withholding" : "Receipt", ref: `${p.mode}${p.notes ? ` · ${p.notes}` : ""}`, inv: 0, rec: p.amount, wht: p.wht })),
    ]),
  ];
  const lines = moves.map((m, i) => ({ ...m, inv: i === 0 ? 0 : m.inv, bal: moves.slice(0, i + 1).reduce((a, x) => a + x.inv - x.rec - x.wht, 0) }));
  return (
    <Screen eyebrow="Client statement" title={c.name} actions={<IconBtn icon={ArrowDownToLine} label="Download" onPress={() => toast("Statement PDF saved", "info")} />}>
      <StatGrid items={[
        { label: "Opening", value: pkr(r.opening, { compact: true }) }, { label: "Invoiced", value: pkr(r.invoiced, { compact: true }), tone: "brand" },
        { label: "Received", value: pkr(r.received, { compact: true }), tone: "success" }, { label: "Withholding", value: pkr(r.wht, { compact: true }), tone: "danger" },
        { label: "Balance", value: pkr(r.outstanding), tone: "warning" },
      ]} />
      <Section title="Ledger" count={lines.length}>
        <ListCard>
          {lines.map((l, i) => (
            <Row key={i} last={i === lines.length - 1} title={l.entry} subtitle={l.ref || undefined} meta={l.date ? fmtShort(l.date) : undefined}
              right={<View style={{ alignItems: "flex-end" }}>
                <T v="mono">{l.inv ? `+${pkr(l.inv, { compact: true })}` : l.rec || l.wht ? `−${pkr(l.rec + l.wht, { compact: true })}` : ""}</T>
                <T v="mono" muted style={{ fontSize: 11 }}>bal {pkr(l.bal, { compact: true })}</T>
              </View>} />
          ))}
        </ListCard>
      </Section>
      <Section title="Invoices">
        <ListCard>{inv.map((i, n) => <Row key={i.id} last={n === inv.length - 1} title={i.number} meta={fmtDate(i.date)} right={<Badge label={i.status} small tone={i.status === "Paid" ? "success" : i.status === "Overdue" ? "danger" : "warning"} />} />)}</ListCard>
      </Section>
    </Screen>
  );
}

// ---------------------------------------------------------------- Payables
function Payables() {
  const { db, commit } = useDB();
  const { can } = useAuth();
  const { toast } = useOverlay();
  const [status, setStatus] = useState("all");
  const [paying, setPaying] = useState<string | null>(null);
  const [f, setF] = useState<PayForm>(blankPay());
  const list = db.payables.filter((p) => status === "all" || p.status === status);
  const sum = (s: string) => db.payables.filter((p) => p.status === s).reduce((a, p) => a + p.amount, 0);
  return (
    <>
      <StatGrid items={[
        { label: "Pending", value: pkr(sum("Pending"), { compact: true }), tone: "warning" }, { label: "Overdue", value: pkr(sum("Overdue"), { compact: true }), tone: "danger" },
        { label: "Paid", value: pkr(sum("Paid"), { compact: true }), tone: "success" }, { label: "Total", value: pkr(db.payables.reduce((a, p) => a + p.amount, 0), { compact: true }) },
      ]} />
      <View style={{ marginVertical: 12 }}><Chips value={status} onChange={setStatus} items={["all", "Pending", "Overdue", "Paid"].map((s) => ({ key: s, label: s === "all" ? "All" : s }))} /></View>
      {list.map((p) => (
        <RecordCard key={p.id} title={p.vendor} subtitle={p.category} badge={<Badge label={p.status} tone={toneOf(p.status)} />}
          fields={[{ label: "Amount due", value: pkr(p.amount), mono: true }, { label: "Due", value: fmtShort(p.due) }, { label: "Expense date", value: fmtShort(p.expense_date) }, { label: "Client", value: clientName(db, p.client_id) }]}
          actions={can("accounting.edit") ? (p.status === "Paid"
            ? [{ label: "Revert", icon: Undo2, onPress: () => { commit((d) => { d.payables.find((x) => x.id === p.id)!.status = "Pending"; }); toast("Reverted to pending", "warning"); } }]
            : [{ label: "Mark paid", icon: Wallet, tone: "brand" as const, onPress: () => { setF({ ...blankPay(), amount: String(p.amount) }); setPaying(p.id); } }]) : undefined} />
      ))}
      {list.length === 0 && <Empty title="No payables" />}
      <Sheet open={!!paying} onClose={() => setPaying(null)} title="Mark payable as paid" footer={<Button label="Mark paid" full disabled={!f.account} onPress={() => { commit((d) => { d.payables.find((x) => x.id === paying)!.status = "Paid"; }); setPaying(null); toast("Payable paid"); }} />}>
        <PaymentFields f={f} set={(p) => setF({ ...f, ...p })} />
      </Sheet>
    </>
  );
}

// ---------------------------------------------------------------- Banks, cheques, deposits
function Banks() {
  const { db, commit } = useDB();
  const { can } = useAuth();
  const { toast, confirm } = useOverlay();
  const [sub, setSub] = useState<"cheques" | "deposits">("cheques");
  const [sheet, setSheet] = useState<null | "cheque" | "deposit" | "withdraw" | "wire" | "bank" | "opening">(null);
  const [f, setF] = useState({ bank: "", to: "", amount: "", number: "", party: "", type: "payment", name: "", custodian: "" });
  const canEdit = can("accounting.edit");
  const cash = db.custodians.reduce((a, c) => a + c.held, 0);
  const bank = db.banks.reduce((a, b) => a + b.balance, 0);
  const transit = db.cheques.filter((c) => c.status === "pending").reduce((a, c) => a + (c.type === "payment" ? -c.amount : c.amount), 0);
  const close = (msg: string) => { setSheet(null); setF({ bank: "", to: "", amount: "", number: "", party: "", type: "payment", name: "", custodian: "" }); toast(msg); };

  return (
    <>
      <StatGrid items={[
        { label: "Cash in hand", value: pkr(cash, { compact: true }), tone: "success", hint: canEdit ? "Tap to set opening" : undefined, onPress: canEdit ? () => setSheet("opening") : undefined },
        { label: "Bank balance", value: pkr(bank, { compact: true }), tone: "brand" },
        { label: "Cheques in transit", value: pkr(transit, { compact: true, sign: true }), tone: "warning" },
        { label: "Total position", value: pkr(cash + bank + transit, { compact: true }) },
      ]} />
      {canEdit && (
        <HStack wrap style={{ marginTop: 12 }}>
          <Button size="sm" variant="secondary" icon={ArrowRightLeft} label="Wire transfer" onPress={() => setSheet("wire")} />
          <Button size="sm" variant="secondary" icon={Plus} label="Add bank account" onPress={() => setSheet("bank")} />
        </HStack>
      )}
      <Section title="Accounts" count={db.banks.length}>
        {db.banks.map((b) => (
          <RecordCard key={b.id} title={b.name} subtitle={b.number} badge={<Badge label={b.type} small tone="neutral" />} leading={<Landmark size={20} />}
            fields={[{ label: "Owner", value: b.owner, full: true }, { label: "Account", value: pkr(b.balance), mono: true }, { label: "Cheques", value: pkr(b.cheque_balance, { sign: true }), mono: true }, { label: "Total", value: pkr(b.balance + b.cheque_balance), mono: true, tone: "brand", full: true }]}
            actions={canEdit ? [{ label: "Withdraw to cash", icon: Banknote, onPress: () => { setF({ ...f, bank: b.id }); setSheet("withdraw"); } }, { label: "Edit", icon: Pencil, onPress: () => { setF({ ...f, name: b.name, bank: b.id }); setSheet("bank"); } }] : undefined} />
        ))}
      </Section>
      <View style={{ marginTop: 18 }}>
        <Segmented value={sub} onChange={setSub} items={[{ key: "cheques", label: "Cheques", count: db.cheques.length }, { key: "deposits", label: "Cash deposits", count: db.deposits.length }]} />
      </View>
      {canEdit && <Button style={{ marginTop: 10 }} size="sm" variant="secondary" icon={Plus} label={sub === "cheques" ? "New cheque" : "Cash deposit"} onPress={() => setSheet(sub === "cheques" ? "cheque" : "deposit")} />}
      <View style={{ marginTop: 10 }}>
        {sub === "cheques" ? db.cheques.map((c) => (
          <RecordCard key={c.id} title={`#${c.number} · ${c.party}`} subtitle={db.banks.find((b) => b.id === c.bank_id)?.name} badge={<Badge label={c.status} tone={toneOf(c.status)} />}
            fields={[{ label: "Type", value: c.type === "payment" ? "Outgoing" : "Deposit" }, { label: "Amount", value: pkr(c.amount), mono: true }, { label: "Date", value: fmtShort(c.date) }, { label: "Linked", value: c.linked }]}
            actions={canEdit && c.status === "pending" ? [
              { label: "Cleared", onPress: () => { commit((d) => { d.cheques.find((x) => x.id === c.id)!.status = "cleared"; }); toast(`Cheque #${c.number} cleared`); } },
              { label: "Bounce", tone: "danger" as const, onPress: async () => { if (await confirm({ title: `Bounce cheque #${c.number}?`, message: "Reverses its linked payment.", confirmLabel: "Bounce", tone: "danger" })) { commit((d) => { d.cheques.find((x) => x.id === c.id)!.status = "bounced"; }); toast("Cheque bounced", "warning"); } } },
            ] : undefined} />
        )) : db.deposits.map((d) => (
          <RecordCard key={d.id} title={pkr(d.amount)} subtitle={`${d.slip} · ${db.banks.find((b) => b.id === d.bank_id)?.name}`} fields={[{ label: "Date", value: fmtShort(d.date) }, { label: "Deposited by", value: d.by }, { label: "Reference", value: d.ref, full: true }]}
            actions={[{ label: "Deposit slip", icon: FileText, onPress: () => toast("Deposit slip PDF saved", "info") }]} />
        ))}
      </View>

      <Sheet open={sheet === "cheque"} onClose={() => setSheet(null)} title="New cheque" footer={<Button label="Save cheque" full disabled={!f.bank || !f.amount || !f.number} onPress={() => { commit((d) => { d.cheques.unshift({ id: `ch${Date.now()}`, number: f.number, type: f.type as "payment", bank_id: f.bank, date: TODAY, party: f.party, amount: Number(f.amount), linked: "—", status: "pending" }); }); close("Cheque recorded"); }} />}>
        <Select label="Type" value={f.type} onChange={(v) => setF({ ...f, type: v })} options={[{ value: "payment", label: "Payment (outgoing)" }, { value: "deposit", label: "Deposit (incoming)" }]} />
        <Select label="Bank" required value={f.bank} onChange={(v) => setF({ ...f, bank: v })} options={bankOptions(db, true)} />
        <Input label="Cheque #" required value={f.number} keyboardType="numeric" onChangeText={(v) => setF({ ...f, number: v })} />
        <Input label={f.type === "payment" ? "Recipient" : "Payer"} value={f.party} onChangeText={(v) => setF({ ...f, party: v })} />
        <Input label="Amount" required amount value={f.amount} onChangeText={(v) => setF({ ...f, amount: v })} />
      </Sheet>
      <Sheet open={sheet === "deposit"} onClose={() => setSheet(null)} title="Cash deposit" footer={<Button label="Deposit" full disabled={!f.bank || !f.amount || !f.custodian} onPress={() => { commit((d) => { d.deposits.unshift({ id: `dp${Date.now()}`, slip: `DS-${3300 + d.deposits.length}`, bank_id: f.bank, date: TODAY, amount: Number(f.amount), by: d.custodians.find((c) => c.id === f.custodian)!.holder, ref: f.party }); d.custodians.find((c) => c.id === f.custodian)!.held -= Number(f.amount); d.banks.find((b) => b.id === f.bank)!.balance += Number(f.amount); }); close("Cash deposited"); }} />}>
        <Select label="From custodian" required value={f.custodian} onChange={(v) => setF({ ...f, custodian: v })} options={custodianOptions(db, true)} />
        <Select label="To bank" required value={f.bank} onChange={(v) => setF({ ...f, bank: v })} options={bankOptions(db, true)} />
        <Input label="Amount" required amount value={f.amount} onChangeText={(v) => setF({ ...f, amount: v })} />
        <Input label="Reference / notes" value={f.party} onChangeText={(v) => setF({ ...f, party: v })} />
      </Sheet>
      <Sheet open={sheet === "withdraw"} onClose={() => setSheet(null)} title="Withdraw to cash" footer={<Button label="Withdraw" full disabled={!f.custodian || !f.amount} onPress={() => { commit((d) => { d.banks.find((b) => b.id === f.bank)!.balance -= Number(f.amount); d.custodians.find((c) => c.id === f.custodian)!.held += Number(f.amount); }); close("Withdrawn to cash"); }} />}>
        <Select label="From bank" value={f.bank} onChange={(v) => setF({ ...f, bank: v })} options={bankOptions(db, true)} />
        <Select label="To custodian" required value={f.custodian} onChange={(v) => setF({ ...f, custodian: v })} options={custodianOptions(db, true)} />
        <Input label="Amount" required amount value={f.amount} onChangeText={(v) => setF({ ...f, amount: v })} />
      </Sheet>
      <Sheet open={sheet === "wire"} onClose={() => setSheet(null)} title="Wire transfer" footer={<Button label="Transfer" full disabled={!f.bank || !f.to || f.bank === f.to || !f.amount} onPress={() => { commit((d) => { d.banks.find((b) => b.id === f.bank)!.balance -= Number(f.amount); d.banks.find((b) => b.id === f.to)!.balance += Number(f.amount); }); close("Transfer recorded"); }} />}>
        <Select label="From" required value={f.bank} onChange={(v) => setF({ ...f, bank: v })} options={bankOptions(db, true)} />
        <Select label="To" required value={f.to} onChange={(v) => setF({ ...f, to: v })} options={bankOptions(db, true)} />
        <Input label="Amount" required amount value={f.amount} onChangeText={(v) => setF({ ...f, amount: v })} />
      </Sheet>
      <Sheet open={sheet === "bank"} onClose={() => setSheet(null)} title={f.bank ? "Edit bank account" : "Add bank account"} footer={<Button label="Save" full disabled={!f.name} onPress={() => { commit((d) => { if (f.bank) d.banks.find((b) => b.id === f.bank)!.name = f.name; else d.banks.push({ id: `bk${Date.now()}`, name: f.name, number: f.number, type: "Current", owner: "Company", balance: 0, cheque_balance: 0 }); }); close("Bank account saved"); }} />}>
        <Input label="Bank name" required value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
        <Input label="Account number" value={f.number} onChangeText={(v) => setF({ ...f, number: v })} />
      </Sheet>
      <Sheet open={sheet === "opening"} onClose={() => setSheet(null)} title="Set opening cash balance" footer={<Button label="Save" full onPress={() => close("Opening balance set")} />}>
        <Select label="Custodian" value={f.custodian} onChange={(v) => setF({ ...f, custodian: v })} options={custodianOptions(db, true)} />
        <Input label="Opening balance" amount value={f.amount} onChangeText={(v) => setF({ ...f, amount: v })} />
      </Sheet>
    </>
  );
}

// ---------------------------------------------------------------- Cash custody
function Custody() {
  const { db, commit } = useDB();
  const { can } = useAuth();
  const { toast } = useOverlay();
  const [sheet, setSheet] = useState<null | "transfer" | "location">(null);
  const [f, setF] = useState({ from: "", to: "", amount: "", location: "", holder: "" });
  const total = db.custodians.reduce((a, c) => a + c.held, 0);
  const owed = db.partners.reduce((a, p) => a + Math.max(0, p.allocated - p.drawn), 0);
  return (
    <>
      <StatGrid items={[
        { label: "Total cash in hand", value: pkr(total, { compact: true }), tone: "success" },
        { label: "Owed to partners", value: pkr(owed, { compact: true }), tone: "warning", hint: "undrawn" },
        { label: "Cash vs liabilities", value: pkr(total - owed, { compact: true, sign: true }), tone: total - owed >= 0 ? "success" : "danger" },
      ]} />
      {can("accounting.edit") && (
        <HStack wrap style={{ marginTop: 12 }}>
          <Button size="sm" variant="secondary" icon={ArrowRightLeft} label="Record transfer" onPress={() => setSheet("transfer")} />
          <Button size="sm" variant="secondary" icon={Plus} label="Add location" onPress={() => setSheet("location")} />
        </HStack>
      )}
      <Section title="Cash holdings" count={db.custodians.length}>
        {db.custodians.map((c) => (
          <RecordCard key={c.id} title={c.location} subtitle={c.holder} badge={<Badge label={c.active ? "Active" : "Closed"} tone={c.active ? "success" : "neutral"} small />}
            fields={[{ label: "Type", value: c.type }, { label: "Opening", value: pkr(c.opening), mono: true }, { label: "Held cash", value: pkr(c.held), mono: true, tone: "success", full: true }]} />
        ))}
      </Section>
      <Section title="Partners summary">
        {db.partners.map((p) => (
          <RecordCard key={p.id} title={p.name} subtitle={p.scope} fields={[
            { label: "Allocated", value: pkr(p.allocated, { compact: true }), mono: true }, { label: "Contributed", value: pkr(p.contributed, { compact: true }), mono: true },
            { label: "Drawn", value: pkr(p.drawn, { compact: true }), mono: true }, { label: "Net balance", value: pkr(p.contributed + p.allocated - p.drawn, { compact: true }), mono: true, tone: "brand" },
          ]} />
        ))}
      </Section>
      <Sheet open={sheet === "transfer"} onClose={() => setSheet(null)} title="Record custody transfer" footer={<Button label="Transfer" full disabled={!f.from || !f.to || f.from === f.to || !f.amount} onPress={() => {
        commit((d) => { d.custodians.find((c) => c.id === f.from)!.held -= Number(f.amount); d.custodians.find((c) => c.id === f.to)!.held += Number(f.amount); });
        setSheet(null); toast("Transfer recorded");
      }} />}>
        <Select label="From" required value={f.from} onChange={(v) => setF({ ...f, from: v })} options={custodianOptions(db, true)} />
        <Select label="To" required value={f.to} onChange={(v) => setF({ ...f, to: v })} options={custodianOptions(db, true)} />
        <Input label="Amount" required amount value={f.amount} onChangeText={(v) => setF({ ...f, amount: v })} />
      </Sheet>
      <Sheet open={sheet === "location"} onClose={() => setSheet(null)} title="Add custodian" footer={<Button label="Add" full disabled={!f.location || !f.holder} onPress={() => {
        commit((d) => { d.custodians.push({ id: `cu${Date.now()}`, location: f.location, type: "Office", holder: f.holder, opening: 0, held: 0, active: true }); }); setSheet(null); toast("Custodian added");
      }} />}>
        <Input label="Location" required value={f.location} onChangeText={(v) => setF({ ...f, location: v })} />
        <Input label="Holder" required value={f.holder} onChangeText={(v) => setF({ ...f, holder: v })} />
      </Sheet>
      <Ledger label="Cash across all custodians" value={pkr(total)} strong top />
    </>
  );
}
