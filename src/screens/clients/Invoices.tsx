import { useLocalSearchParams, useRouter } from "expo-router";
import { FileDown, LayoutTemplate, Pencil, Plus, Receipt, Trash2, Wallet } from "lucide-react-native";
import React, { useState } from "react";
import { View } from "react-native";
import { PaymentFields, PayForm } from "../../components/PaymentFields";
import { Screen } from "../../components/Screen";
import { Select, Sheet, useOverlay } from "../../components/Sheet";
import { T } from "../../components/Text";
import { Badge, Button, Card, Chips, Empty, Fields, HStack, IconBtn, Input, Ledger, ListCard, RecordCard, Row, Section, StatGrid, Tabs } from "../../components/ui";
import { Invoice, LAST_MONTH, TODAY } from "../../data/seed";
import { clientName, invoiceReceived, useDB } from "../../data/store";
import { useAuth } from "../../lib/auth";
import { fmtDate, fmtMonth, fmtShort, pkr } from "../../lib/format";
import { inRegion, useRegion } from "../../lib/region";

const blankPay = (): PayForm => ({ amount: "", date: TODAY, mode: "Bank", account: "", notes: "" });

export default function Invoices() {
  const router = useRouter();
  const { db, commit } = useDB();
  const { can } = useAuth();
  const { regionId } = useRegion();
  const { toast } = useOverlay();
  const [tab, setTab] = useState<"ledger" | "generate">("ledger");
  const [client, setClient] = useState("");
  const [status, setStatus] = useState("all");
  const [month, setMonth] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [structure, setStructure] = useState(false);
  const [payFor, setPayFor] = useState<Invoice | null>(null);
  const canEdit = can("invoices.edit");

  const list = db.invoices.filter((i) => inRegion(regionId, db.clients.find((c) => c.id === i.client_id)?.branch_id) && (!client || i.client_id === client) && (status === "all" || i.status === status) && (!month || i.month === month));
  const total = list.reduce((a, i) => a + i.amount, 0);
  const received = list.reduce((a, i) => a + invoiceReceived(i), 0);
  const months = [...new Set(db.invoices.map((i) => i.month))].sort().reverse();

  return (
    <Screen
      region
      eyebrow="Clients & Contracts"
      title="Invoices"
      actions={canEdit ? <>
        <IconBtn icon={LayoutTemplate} label="Invoice structure" onPress={() => setStructure(true)} />
        <IconBtn icon={Plus} label="New invoice" filled onPress={() => setNewOpen(true)} />
      </> : undefined}
      sticky={<Tabs value={tab} onChange={setTab} items={[{ key: "ledger", label: "Invoices", count: list.length }, ...(canEdit ? [{ key: "generate" as const, label: "Generate", count: db.invoiceDrafts.length }] : [])]} />}
    >
      {tab === "ledger" && (
        <>
          <StatGrid items={[
            { label: "Total invoiced", value: pkr(total, { compact: true }), tone: "brand" },
            { label: "Total received", value: pkr(received, { compact: true }), tone: "success" },
            { label: "Outstanding", value: pkr(total - received, { compact: true }), tone: "warning" },
          ]} />
          <View style={{ marginTop: 12, gap: 8 }}>
            <Select compact clearable label="Client" value={client} onChange={setClient} placeholder="All" options={db.clients.map((c) => ({ value: c.id, label: c.name }))} />
            <Select compact clearable label="Month" value={month} onChange={setMonth} placeholder="All" options={months.map((m) => ({ value: m, label: fmtMonth(m) }))} />
            <Chips value={status} onChange={setStatus} items={["all", "Paid", "Partial", "Unpaid", "Overdue"].map((s) => ({ key: s, label: s === "all" ? "All" : s }))} />
          </View>
          <View style={{ height: 12 }} />
          {list.map((i) => {
            const rec = invoiceReceived(i);
            return (
              <RecordCard
                key={i.id}
                title={clientName(db, i.client_id)}
                subtitle={i.number}
                badge={<Badge label={i.status} tone={i.status === "Paid" ? "success" : i.status === "Overdue" ? "danger" : "warning"} />}
                onPress={() => router.push(`/invoices/${i.id}`)}
                fields={[
                  { label: "Month", value: fmtMonth(i.month) },
                  { label: "Amount", value: pkr(i.amount), mono: true },
                  { label: "Received", value: pkr(rec), mono: true, tone: rec ? "success" : undefined },
                  { label: "Outstanding", value: pkr(i.amount - rec), mono: true, tone: i.amount - rec > 0 ? "warning" : undefined },
                ]}
                actions={[
                  { label: "PDF", icon: FileDown, onPress: () => toast(`${i.number}.pdf saved`, "info") },
                  ...(canEdit && i.status !== "Paid" ? [{ label: "Record payment", icon: Wallet, onPress: () => setPayFor(i), tone: "brand" as const }] : []),
                ]}
              />
            );
          })}
          {list.length === 0 && <Empty icon={Receipt} title="No invoices match" />}
        </>
      )}

      {tab === "generate" && canEdit && (
        <>
          <T v="small" muted style={{ marginBottom: 12 }}>One draft per active contract for {fmtMonth(LAST_MONTH)}. Drafts are saved server-side until issued.</T>
          {db.invoiceDrafts.map((d) => (
            <Card key={d.id} style={{ marginBottom: 10 }}>
              <HStack style={{ alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong">{clientName(db, d.client_id)}</T>
                  <T v="mono" muted style={{ fontSize: 12 }}>{d.number} · {db.contracts.find((k) => k.id === d.contract_id)?.code}</T>
                </View>
                {d.cleared ? <Badge label="Cleared" tone="success" small /> : <Badge label="Draft" tone="info" small />}
              </HStack>
              <View style={{ marginTop: 10 }}>
                {d.lines.map((l, n) => <Ledger key={n} label={l.description} sub={`${l.qty} × ${pkr(l.rate)}`} value={pkr(l.qty * l.rate)} />)}
                <Ledger label="Incl. sales tax" value={pkr(d.amount)} strong top />
              </View>
              <HStack style={{ marginTop: 10 }}>
                <Button size="sm" variant="secondary" label={d.cleared ? "Uncheck" : "Mark cleared"} onPress={() => commit((db2) => { const x = db2.invoiceDrafts.find((y) => y.id === d.id)!; x.cleared = !x.cleared; })} />
                <Button size="sm" label="Issue invoice" disabled={!d.cleared} onPress={() => {
                  commit((db2) => {
                    db2.invoices.unshift({ id: `inv${Date.now()}`, number: d.number, client_id: d.client_id, contract_id: d.contract_id, month: d.month, amount: d.amount, date: TODAY, status: "Unpaid", attachment: false, notes: "", payments: [] });
                    db2.invoiceDrafts = db2.invoiceDrafts.filter((y) => y.id !== d.id);
                  });
                  toast(`${d.number} issued`);
                }} />
              </HStack>
            </Card>
          ))}
          {db.invoiceDrafts.length === 0 && <Empty title="All drafts issued" />}
        </>
      )}

      <RecordPaymentSheet invoice={payFor} onClose={() => setPayFor(null)} />
      <NewInvoiceSheet open={newOpen} onClose={() => setNewOpen(false)} />
      <Sheet open={structure} onClose={() => setStructure(false)} title="Invoice structure" footer={<Button label="Save" full onPress={() => { setStructure(false); toast("Invoice structure saved"); }} />}>
        <T v="eyebrow" muted style={{ marginBottom: 10 }}>Company branding</T>
        <Input label="Company name on invoice" defaultValue={db.company.name} />
        <Input label="Address" multiline defaultValue="Office 4, Gulberg III, Lahore" />
        <Input label="Invoice prefix" defaultValue="GGS-" />
        <T v="eyebrow" muted style={{ marginVertical: 10 }}>Templates</T>
        <T v="small" muted>Fixed, Variable and legacy SLA clients each get their template automatically.</T>
      </Sheet>
    </Screen>
  );
}

export function InvoiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { db, commit } = useDB();
  const { can } = useAuth();
  const { toast, confirm } = useOverlay();
  const [pay, setPay] = useState(false);
  const [edit, setEdit] = useState(false);
  const [amt, setAmt] = useState("");
  const i = db.invoices.find((x) => x.id === id);
  if (!i) return <Screen title="Invoice"><Empty title="Invoice not found" /></Screen>;
  const rec = invoiceReceived(i);
  const canEdit = can("invoices.edit");

  return (
    <Screen
      eyebrow={i.number}
      title={clientName(db, i.client_id)}
      subtitle={`${fmtMonth(i.month)} · issued ${fmtDate(i.date)}`}
      actions={<>
        <IconBtn icon={FileDown} label="PDF" onPress={() => toast(`${i.number}.pdf saved`, "info")} />
        {canEdit && <IconBtn icon={Pencil} label="Edit" onPress={() => { setAmt(String(i.amount)); setEdit(true); }} />}
      </>}
      footer={canEdit && i.status !== "Paid" ? <Button label="Record payment" icon={Wallet} full onPress={() => setPay(true)} /> : undefined}
    >
      <Card>
        <Badge label={i.status} tone={i.status === "Paid" ? "success" : i.status === "Overdue" ? "danger" : "warning"} dot />
        <View style={{ marginTop: 12 }}>
          <Ledger label="Invoice amount" value={pkr(i.amount)} />
          <Ledger label="Received" value={pkr(i.payments.reduce((a, p) => a + p.amount, 0))} tone="success" />
          <Ledger label="Withholding tax" value={pkr(i.payments.reduce((a, p) => a + p.wht, 0))} />
          <Ledger label="Outstanding" value={pkr(i.amount - rec)} strong top tone={i.amount - rec > 0 ? "warning" : undefined} />
        </View>
      </Card>
      <Section title="Details">
        <Card><Fields items={[{ label: "Contract", value: db.contracts.find((k) => k.id === i.contract_id)?.code ?? "—", mono: true }, { label: "Attachment", value: i.attachment ? "On Drive" : "None" }]} /></Card>
      </Section>
      <Section title="Payments" count={i.payments.length}>
        {i.payments.length ? (
          <ListCard>
            {i.payments.map((p, n) => <Row key={p.id} last={n === i.payments.length - 1} title={pkr(p.amount)} subtitle={p.notes} meta={`${fmtShort(p.date)} · ${p.mode}${p.wht ? ` · WHT ${pkr(p.wht)}` : ""}`} />)}
          </ListCard>
        ) : <T v="small" muted>No payments yet.</T>}
      </Section>
      {canEdit && (
        <Button label="Delete invoice" icon={Trash2} variant="ghost" style={{ marginTop: 20 }} onPress={async () => {
          if (await confirm({ title: `Delete ${i.number}?`, message: "Payments recorded against it are reversed.", confirmLabel: "Delete", tone: "danger" })) {
            commit((d) => { d.invoices = d.invoices.filter((x) => x.id !== i.id); });
            toast("Invoice deleted", "warning"); router.back();
          }
        }} />
      )}
      <RecordPaymentSheet invoice={pay ? i : null} onClose={() => setPay(false)} />
      <Sheet open={edit} onClose={() => setEdit(false)} title="Edit invoice" footer={<><Button label="Cancel" variant="secondary" full onPress={() => setEdit(false)} /><Button label="Save" full onPress={() => { commit((d) => { d.invoices.find((x) => x.id === i.id)!.amount = Number(amt) || i.amount; }); setEdit(false); toast("Invoice saved"); }} /></>}>
        <Input label="Amount" amount value={amt} onChangeText={setAmt} />
        <Input label="Notes" multiline defaultValue={i.notes} />
      </Sheet>
    </Screen>
  );
}

function RecordPaymentSheet({ invoice, onClose }: { invoice: Invoice | null; onClose: () => void }) {
  const { commit } = useDB();
  const { toast } = useOverlay();
  const [f, setF] = useState<PayForm>(blankPay());
  const [wht, setWht] = useState("");
  const out = invoice ? invoice.amount - invoiceReceived(invoice) : 0;
  const n = Number(f.amount) || 0;
  const err = n > out ? `More than the outstanding ${pkr(out)}` : null;
  return (
    <Sheet open={!!invoice} onClose={onClose} title="Record payment" subtitle={invoice ? `${invoice.number} · outstanding ${pkr(out)}` : undefined} error={err}
      footer={<><Button label="Cancel" variant="secondary" full onPress={onClose} /><Button label="Record" full disabled={!n || !f.account || !!err} onPress={() => {
        commit((d) => {
          const x = d.invoices.find((y) => y.id === invoice!.id)!;
          x.payments.push({ id: `p${Date.now()}`, date: f.date, amount: n, mode: f.mode as "Bank", notes: f.notes, wht: Number(wht) || 0 });
          const r = invoiceReceived(x);
          x.status = r >= x.amount ? "Paid" : "Partial";
        });
        toast(`${pkr(n)} recorded`); setF(blankPay()); setWht(""); onClose();
      }} /></>}>
      <PaymentFields f={f} set={(p) => setF({ ...f, ...p })} />
      <Input label="Withholding tax deducted" amount value={wht} onChangeText={setWht} />
    </Sheet>
  );
}

function NewInvoiceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, commit } = useDB();
  const { toast } = useOverlay();
  const [client, setClient] = useState("");
  const [contract, setContract] = useState("");
  const [month, setMonth] = useState(LAST_MONTH);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  return (
    <Sheet open={open} onClose={onClose} title="New invoice"
      footer={<><Button label="Cancel" variant="secondary" full onPress={onClose} /><Button label="Create" full disabled={!client || !contract || !amount} onPress={() => {
        commit((d) => { d.invoices.unshift({ id: `inv${Date.now()}`, number: `GGS-${month.replace("-", "")}-${String(d.invoices.length + 1).padStart(3, "0")}`, client_id: client, contract_id: contract, month, amount: Number(amount), date: TODAY, status: "Unpaid", attachment: false, notes, payments: [] }); });
        toast("Invoice created"); onClose();
      }} /></>}>
      <Select label="Client" required value={client} onChange={(v) => { setClient(v); setContract(""); }} options={db.clients.map((c) => ({ value: c.id, label: c.name }))} />
      {client ? <Select label="Contract" required value={contract} onChange={setContract} options={db.contracts.filter((k) => k.client_id === client).map((k) => ({ value: k.id, label: k.code, sub: k.status }))} /> : null}
      <Input label="Invoice month" value={month} onChangeText={setMonth} placeholder="YYYY-MM" />
      <Input label="Amount" required amount value={amount} onChangeText={setAmount} />
      <Input label="Notes" multiline value={notes} onChangeText={setNotes} />
      <T v="small" muted>Status starts as Unpaid.</T>
    </Sheet>
  );
}
