import { useLocalSearchParams, useRouter } from "expo-router";
import { CheckCheck, Download, Eye, FileDown, HandCoins, Wallet } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { PaymentFields, PayForm } from "../../components/PaymentFields";
import { Screen } from "../../components/Screen";
import { Select, Sheet, useOverlay } from "../../components/Sheet";
import { T } from "../../components/Text";
import { Avatar, Badge, Banner, Button, Card, Checkbox, Chips, Empty, Fields, HStack, IconBtn, Input, Ledger, ListCard, Row, SearchBar, Section, StatGrid, Tabs } from "../../components/ui";
import { Payslip, THIS_MONTH, TODAY } from "../../data/seed";
import { clientName, useDB } from "../../data/store";
import { useAuth } from "../../lib/auth";
import { fmtMonth, fmtShort, pkr } from "../../lib/format";
import { inRegion, useRegion } from "../../lib/region";
import { useTheme } from "../../theme/ThemeProvider";

const blankPay = (): PayForm => ({ amount: "", date: TODAY, mode: "Bank", account: "", notes: "" });

export default function Payroll({ relieversOnly }: { relieversOnly?: boolean }) {
  const { can } = useAuth();
  const [tab, setTab] = useState<"payslips" | "adjustments" | "leave">("payslips");
  const tabs = [
    { key: "payslips" as const, label: "Payslips" },
    ...(can("payroll.adjust") ? [{ key: "adjustments" as const, label: "Adjustments" }] : []),
    { key: "leave" as const, label: "Leave" },
  ];
  return (
    <Screen region eyebrow="Workforce" title={relieversOnly ? "Reliever payroll" : "Payroll"} sticky={relieversOnly ? undefined : <Tabs value={tab} onChange={setTab} items={tabs} />}>
      {tab === "payslips" && <Payslips relieversOnly={relieversOnly} />}
      {tab === "adjustments" && <Adjustments />}
      {tab === "leave" && <Leave />}
    </Screen>
  );
}

/** PayrollManagement. `clientScope` = the Payroll Run embed. */
export function Payslips({ relieversOnly, clientScope }: { relieversOnly?: boolean; clientScope?: string }) {
  const t = useTheme();
  const router = useRouter();
  const { db } = useDB();
  const { can } = useAuth();
  const { regionId } = useRegion();
  const { toast, confirm } = useOverlay();
  const [month, setMonth] = useState(THIS_MONTH);
  const [client, setClient] = useState(clientScope ?? "");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [disburse, setDisburse] = useState<Payslip[] | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const canEdit = can("payroll.edit");
  const closed = db.periods.find((p) => p.month === month)?.status === "closed";

  const rows = useMemo(() => db.payslips.filter((p) => {
    const e = db.employees.find((x) => x.id === p.employee_id)!;
    if (p.month !== month || !inRegion(regionId, e.branch_id)) return false;
    if (relieversOnly && e.category !== "reliever") return false;
    if (client && (client === "office" ? e.category !== "office_staff" : client === "relievers" ? e.category !== "reliever" : e.client_id !== client)) return false;
    if (status !== "all" && p.status !== status) return false;
    if (q && !(e.name + e.code).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [db, month, regionId, relieversOnly, client, status, q]);

  const sum = (f: (p: Payslip) => number) => rows.reduce((a, p) => a + f(p), 0);
  const groups = [...new Set(rows.map((p) => db.employees.find((e) => e.id === p.employee_id)!.client_id ?? "office"))];
  const selected = rows.filter((p) => sel[p.id] && p.status === "Pending");

  return (
    <>
      {closed && <Banner tone="danger" title={`${fmtMonth(month)} is closed`} sub="Payslips are read-only. Reopen the period to change them." />}
      <StatGrid items={[
        { label: "Total salaries", value: pkr(sum((p) => p.net), { compact: true }), tone: "brand" },
        { label: "Disbursed", value: pkr(sum((p) => (p.status === "Cleared" ? p.net : 0)), { compact: true }), tone: "success" },
        { label: "Not disbursed", value: pkr(sum((p) => (p.status === "Pending" ? p.net : 0)), { compact: true }), tone: "warning" },
        { label: "Advance", value: pkr(sum((p) => p.advance), { compact: true }), tone: "danger" },
      ]} />
      <View style={{ gap: 8, marginTop: 12 }}>
        <HStack>
          <View style={{ flex: 1 }}><Select compact label="Period" value={month} onChange={setMonth} options={db.periods.map((p) => ({ value: p.month, label: fmtMonth(p.month), sub: p.status }))} /></View>
          <IconBtn icon={Download} label="Export payroll sheets" onPress={() => setExportOpen(true)} />
        </HStack>
        {!clientScope && <Select compact clearable label="Client" value={client} onChange={setClient} placeholder="All" options={[...db.clients.map((c) => ({ value: c.id, label: c.name })), { value: "office", label: "Office staff" }]} />}
        <SearchBar value={q} onChange={setQ} placeholder="Employee" />
        <Chips value={status} onChange={setStatus} items={[{ key: "all", label: "All" }, { key: "Pending", label: "Pending" }, { key: "Cleared", label: "Disbursed" }]} />
      </View>

      {groups.map((g) => {
        const gr = rows.filter((p) => (db.employees.find((e) => e.id === p.employee_id)!.client_id ?? "office") === g);
        const done = gr.every((p) => p.status === "Cleared");
        return (
          <Section key={g} title={g === "office" ? "Office & relievers" : clientName(db, g)} count={`${gr.filter((p) => p.status === "Cleared").length}/${gr.length}`}
            action={done ? <Badge label="Fully disbursed" tone="success" small /> : canEdit && !closed ? <T v="smallStrong" color={t.tone("brand").text} onPress={() => setSel((s) => ({ ...s, ...Object.fromEntries(gr.filter((p) => p.status === "Pending").map((p) => [p.id, true])) }))}>Select all</T> : undefined}>
            <Card pad={0} style={done ? { backgroundColor: t.tone("success").tint, borderColor: t.tone("success").line } : undefined}>
              {gr.map((p, i) => {
                const e = db.employees.find((x) => x.id === p.employee_id)!;
                return (
                  <Row
                    key={p.id}
                    last={i === gr.length - 1}
                    onPress={() => router.push(`/payroll/${p.id}`)}
                    left={canEdit && !closed && p.status === "Pending" ? <Checkbox value={!!sel[p.id]} onChange={(v) => setSel({ ...sel, [p.id]: v })} /> : <Avatar name={e.name} size={26} tone={p.status === "Cleared" ? "success" : "brand"} />}
                    title={e.name}
                    meta={`${e.code} · P${p.present} A${p.absent} L${p.leave}${p.double_duty ? ` DD${p.double_duty}` : ""}`}
                    right={<View style={{ alignItems: "flex-end", gap: 3 }}><T v="mono" style={{ fontSize: 14 }}>{pkr(p.net, { compact: true })}</T><Badge label={p.status === "Cleared" ? "Disbursed" : "Pending"} tone={p.status === "Cleared" ? "success" : "warning"} small /></View>}
                  />
                );
              })}
            </Card>
          </Section>
        );
      })}
      {rows.length === 0 && <Empty icon={Wallet} title="No payslips for this filter" />}

      {canEdit && !closed && (
        <View style={{ marginTop: 18, gap: 8 }}>
          <Button label={selected.length ? `Disburse selected (${selected.length})` : "Select payslips to disburse"} icon={HandCoins} disabled={!selected.length} onPress={() => setDisburse(selected)} />
          <Button label="Mark all as disbursed" icon={CheckCheck} variant="secondary" onPress={async () => {
            const pend = rows.filter((p) => p.status === "Pending");
            if (pend.length && (await confirm({ title: "Mark all as disbursed?", message: `${pend.length} payslips, ${pkr(pend.reduce((a, p) => a + p.net, 0))}.`, confirmLabel: "Continue" }))) setDisburse(pend);
          }} />
        </View>
      )}

      <DisburseSheet slips={disburse} onClose={(ok) => { setDisburse(null); if (ok) setSel({}); }} />
      <Sheet open={exportOpen} onClose={() => setExportOpen(false)} title="Export payroll sheets" footer={<Button label="Export" full onPress={() => { setExportOpen(false); toast("Payroll sheets exported", "info"); }} />}>
        <Select label="Period" value={month} onChange={setMonth} options={db.periods.map((p) => ({ value: p.month, label: fmtMonth(p.month) }))} />
        <T v="small" muted>One sheet per client, office staff and relievers, matching the bank-upload format.</T>
      </Sheet>
    </>
  );
}

function DisburseSheet({ slips, onClose }: { slips: Payslip[] | null; onClose: (ok?: boolean) => void }) {
  const { commit } = useDB();
  const { toast } = useOverlay();
  const [f, setF] = useState<PayForm>(blankPay());
  const total = slips?.reduce((a, p) => a + p.net, 0) ?? 0;
  return (
    <Sheet open={!!slips} onClose={() => onClose()} title={slips && slips.length > 1 ? "Disburse selected" : "Disburse payslip"} subtitle={`${slips?.length ?? 0} payslips · ${pkr(total)}`}
      footer={<><Button label="Cancel" variant="secondary" full onPress={() => onClose()} /><Button label="Disburse" full disabled={!f.account} onPress={() => {
        commit((d) => { for (const s of slips!) { const x = d.payslips.find((y) => y.id === s.id)!; x.status = "Cleared"; x.mode = f.mode as "Bank"; x.paid_on = f.date; } });
        toast(`${slips!.length} payslip${slips!.length > 1 ? "s" : ""} disbursed`); setF(blankPay()); onClose(true);
      }} /></>}>
      <Ledger label="Total to disburse" value={pkr(total)} strong />
      <View style={{ height: 12 }} />
      <PaymentFields f={{ ...f, amount: String(total) }} set={(p) => setF({ ...f, ...p })} amountLabel="Amount (fixed by selection)" />
    </Sheet>
  );
}

/** The salary drawer, as its own screen. */
export function PayslipDetail() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, commit } = useDB();
  const { can } = useAuth();
  const { toast } = useOverlay();
  const [disb, setDisb] = useState(false);
  const [preview, setPreview] = useState(false);
  const [adj, setAdj] = useState(false);
  const [adjAmt, setAdjAmt] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [leaveOverride, setLeaveOverride] = useState("");
  const p = db.payslips.find((x) => x.id === id);
  if (!p) return <Screen title="Payslip"><Empty title="Payslip not found" /></Screen>;
  const e = db.employees.find((x) => x.id === p.employee_id)!;
  const past = p.month < THIS_MONTH;
  const earnings = p.base + p.allowance + p.bonus;

  return (
    <Screen
      eyebrow={`Salary calculation · ${fmtMonth(p.month)}`}
      title={e.name}
      subtitle={`${e.code} · ${e.department} · ${clientName(db, e.client_id)}`}
      actions={<IconBtn icon={Eye} label="Payslip preview" onPress={() => setPreview(true)} />}
      footer={can("payroll.edit") && p.status === "Pending" ? <Button label={`Disburse ${pkr(p.net)}`} icon={HandCoins} full onPress={() => setDisb(true)} /> : undefined}
    >
      {past && <Badge label="History" tone="info" />}
      <Section title="Attendance">
        <StatGrid cols={3} items={[
          { label: "Working", value: String(p.working) }, { label: "Present", value: String(p.present), tone: "success" }, { label: "Double duty", value: String(p.double_duty), tone: "info" },
          { label: "Absent", value: String(p.absent), tone: "danger" }, { label: "Leave", value: String(p.leave), tone: "warning" },
        ]} />
        {can("payroll.edit") && p.status === "Pending" && (
          <HStack style={{ marginTop: 10 }}>
            <Input style={{ flex: 1, marginBottom: 0 }} label="Leave override (days)" keyboardType="numeric" value={leaveOverride} onChangeText={setLeaveOverride} placeholder={String(p.leave)} />
            <Button label="Apply" variant="secondary" style={{ marginTop: 26 }} onPress={() => { commit((d) => { d.payslips.find((x) => x.id === p.id)!.leave = Number(leaveOverride) || 0; }); toast("Leave overridden"); }} />
          </HStack>
        )}
      </Section>
      <Section title="Earnings & deductions">
        <Card>
          <Ledger label="Base salary" value={pkr(p.base)} />
          <Ledger label="Allowance" value={pkr(p.allowance)} />
          <Ledger label="Double-duty bonus" value={pkr(p.bonus)} tone={p.bonus ? "success" : undefined} />
          <Ledger label="Gross earnings" value={pkr(earnings)} strong top />
          <Ledger label="Absence deduction" value={pkr(-p.deductions)} tone={p.deductions ? "danger" : undefined} />
          <Ledger label="Advance recovery" value={pkr(-p.advance)} tone={p.advance ? "danger" : undefined} />
          <Ledger label="Net salary" value={pkr(p.net)} strong top tone="success" />
        </Card>
      </Section>
      <Section title="Payment">
        <Card>
          <Fields items={[
            { label: "Status", value: <Badge label={p.status === "Cleared" ? "Disbursed" : "Pending"} tone={p.status === "Cleared" ? "success" : "warning"} small /> },
            { label: "Mode", value: p.mode ?? "—" }, { label: "Paid on", value: fmtShort(p.paid_on) }, { label: "Account", value: `${e.bank} ${e.account}`, mono: true },
          ]} />
        </Card>
      </Section>
      {can("payroll.adjust") && <Button label="Raise adjustment" variant="secondary" style={{ marginTop: 16 }} onPress={() => setAdj(true)} />}

      <DisburseSheet slips={disb ? [p] : null} onClose={() => setDisb(false)} />
      <Sheet open={preview} onClose={() => setPreview(false)} title="Payslip preview" footer={<Button label="Download PDF" icon={FileDown} full onPress={() => { setPreview(false); toast("Payslip PDF saved", "info"); }} />}>
        <T v="h3">{db.company.name}</T>
        <T v="small" muted>Payslip · {fmtMonth(p.month)}</T>
        <View style={{ marginVertical: 12 }}><Fields items={[{ label: "Employee", value: e.name }, { label: "Code", value: e.code, mono: true }, { label: "Designation", value: e.department }, { label: "Posting", value: clientName(db, e.client_id) }]} /></View>
        <Ledger label="Days present" value={String(p.present)} />
        <Ledger label="Gross" value={pkr(earnings)} />
        <Ledger label="Deductions" value={pkr(p.deductions + p.advance)} />
        <Ledger label="Net payable" value={pkr(p.net)} strong top />
      </Sheet>
      <Sheet open={adj} onClose={() => setAdj(false)} title={`Raise adjustment — ${e.name}`}
        footer={<><Button label="Cancel" variant="secondary" full onPress={() => setAdj(false)} /><Button label="Raise" full disabled={!adjAmt || !adjReason} onPress={() => {
          commit((d) => { d.adjustments.unshift({ id: `a${Date.now()}`, employee_id: e.id, month: p.month, amount: Number(adjAmt), reason: adjReason, status: "open" }); });
          setAdj(false); toast("Adjustment raised");
        }} /></>}>
        <Input label="Amount (negative to recover)" keyboardType="numbers-and-punctuation" value={adjAmt} onChangeText={setAdjAmt} />
        <Input label="Reason" required multiline value={adjReason} onChangeText={setAdjReason} />
        <T v="small" color={t.mutedFg}>Settled later from Payroll → Adjustments.</T>
      </Sheet>
    </Screen>
  );
}

function Adjustments() {
  const t = useTheme();
  const { db, commit } = useDB();
  const { toast } = useOverlay();
  const [settle, setSettle] = useState<string | null>(null);
  const [cancel, setCancel] = useState<string | null>(null);
  const [f, setF] = useState<PayForm>(blankPay());
  const [reason, setReason] = useState("");
  const open = db.adjustments.filter((a) => a.status === "open");
  const cur = db.adjustments.find((a) => a.id === settle);
  return (
    <>
      <Section title="Open" count={open.length}>
        {open.map((a) => (
          <Card key={a.id} style={{ marginBottom: 10 }}>
            <HStack>
              <View style={{ flex: 1 }}>
                <T v="bodyStrong">{db.employees.find((e) => e.id === a.employee_id)?.name}</T>
                <T v="small" muted>{a.reason} · {fmtMonth(a.month)}</T>
              </View>
              <T v="monoLg" color={a.amount < 0 ? t.tone("danger").text : t.tone("success").text}>{pkr(a.amount, { sign: true })}</T>
            </HStack>
            <HStack style={{ marginTop: 12 }}>
              <Button size="sm" label={a.amount < 0 ? "Receive" : "Pay"} onPress={() => { setF({ ...blankPay(), amount: String(Math.abs(a.amount)), mode: "Cash" }); setSettle(a.id); }} />
              <Button size="sm" variant="ghost" label="Cancel" onPress={() => setCancel(a.id)} />
            </HStack>
          </Card>
        ))}
        {open.length === 0 && <Empty title="No open adjustments" />}
      </Section>
      <Section title="Settled">
        <ListCard>{db.adjustments.filter((a) => a.status !== "open").map((a, i, arr) => <Row key={a.id} last={i === arr.length - 1} title={db.employees.find((e) => e.id === a.employee_id)?.name ?? ""} subtitle={a.reason} right={<Badge label={a.status} small />} />)}</ListCard>
      </Section>
      <Sheet open={!!settle} onClose={() => setSettle(null)} title={cur ? `${cur.amount < 0 ? "Receive" : "Pay"} ${pkr(Math.abs(cur.amount))}` : ""}
        footer={<Button label="Settle" full disabled={!f.account} onPress={() => { commit((d) => { d.adjustments.find((x) => x.id === settle)!.status = "settled"; }); setSettle(null); toast("Adjustment settled"); }} />}>
        <PaymentFields f={f} set={(p) => setF({ ...f, ...p })} modes={["Cash", "Bank"]} />
      </Sheet>
      <Sheet open={!!cancel} onClose={() => setCancel(null)} title="Cancel adjustment"
        footer={<Button label="Cancel adjustment" variant="danger" full disabled={!reason} onPress={() => { commit((d) => { d.adjustments.find((x) => x.id === cancel)!.status = "cancelled"; }); setCancel(null); setReason(""); toast("Adjustment cancelled", "warning"); }} />}>
        <Input label="Reason" required multiline value={reason} onChangeText={setReason} />
      </Sheet>
    </>
  );
}

function Leave() {
  const { db, commit } = useDB();
  const { can } = useAuth();
  const { toast } = useOverlay();
  const [emp, setEmp] = useState(db.leaveLedger[0]!.employee_id);
  const [quota, setQuota] = useState("");
  const row = db.leaveLedger.find((l) => l.employee_id === emp)!;
  const lost = db.leaveLedger.filter((l) => l.lost > 0);
  return (
    <>
      <Section title="Lost at the cap" count={lost.length} hint="Leave that expired because the balance hit the quota.">
        <ListCard>{lost.map((l, i) => <Row key={l.employee_id} last={i === lost.length - 1} title={db.employees.find((e) => e.id === l.employee_id)!.name} right={<Badge label={`${l.lost} days`} tone="warning" small />} />)}</ListCard>
      </Section>
      <Section title="A guard's balance, and how it got there">
        <Select label="Employee" searchable value={emp} onChange={setEmp} options={db.leaveLedger.map((l) => ({ value: l.employee_id, label: db.employees.find((e) => e.id === l.employee_id)!.name }))} />
        <StatGrid cols={3} items={[{ label: "Quota", value: String(row.quota) }, { label: "Taken", value: String(row.taken), tone: "warning" }, { label: "Balance", value: String(row.quota - row.taken), tone: "success" }]} />
        <ListCard style={{ marginTop: 10 }}>{row.entries.map((x, i) => <Row key={i} last={i === row.entries.length - 1} title={x.kind} meta={fmtShort(x.date)} right={<T v="mono">{x.days > 0 ? `+${x.days}` : x.days}</T>} />)}</ListCard>
        {can("payroll.edit") && (
          <HStack style={{ marginTop: 12 }}>
            <Input style={{ flex: 1, marginBottom: 0 }} label="Quota override" keyboardType="numeric" value={quota} onChangeText={setQuota} />
            <Button label="Save" variant="secondary" style={{ marginTop: 26 }} onPress={() => { commit((d) => { d.leaveLedger.find((l) => l.employee_id === emp)!.quota = Number(quota) || row.quota; }); toast("Quota updated"); }} />
          </HStack>
        )}
      </Section>
    </>
  );
}
