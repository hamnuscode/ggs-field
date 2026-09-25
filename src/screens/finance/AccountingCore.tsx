import { useLocalSearchParams, useRouter } from "expo-router";
import { Download, Pencil, Plus } from "lucide-react-native";
import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { Screen } from "../../components/Screen";
import { Select, Sheet, useOverlay } from "../../components/Sheet";
import { T } from "../../components/Text";
import { Badge, Banner, Button, Card, Chips, HStack, IconBtn, Input, Ledger, RecordCard, SearchBar, Section, Tabs, Toggle, tap } from "../../components/ui";
import { Account, TODAY } from "../../data/seed";
import { accountBalances, useDB } from "../../data/store";
import { fmtShort, num, pkr } from "../../lib/format";
import { useTheme } from "../../theme/ThemeProvider";

type Tab = "opening" | "coa" | "tb" | "journal";
const TYPE_LABEL: Record<Account["type"], string> = { asset: "Asset", liability: "Liability", equity: "Equity", revenue: "Revenue", expense: "Expense" };

export default function AccountingCore() {
  const { tab: initial } = useLocalSearchParams<{ tab?: Tab }>();
  const { toast } = useOverlay();
  const [tab, setTab] = useState<Tab>(initial ?? "coa");
  const [manual, setManual] = useState(false);
  const [newAcc, setNewAcc] = useState(false);
  return (
    <Screen
      eyebrow="Finance"
      title="Accounting Core"
      actions={<>
        <IconBtn icon={Download} label="Export" onPress={() => toast("Exported to Excel", "info")} />
        {tab === "coa" && <IconBtn icon={Plus} label="New account" filled onPress={() => setNewAcc(true)} />}
        {tab === "journal" && <IconBtn icon={Plus} label="Manual journal entry" filled onPress={() => setManual(true)} />}
      </>}
      sticky={<Tabs value={tab} onChange={setTab} items={[{ key: "opening", label: "Opening balances" }, { key: "coa", label: "Chart of accounts" }, { key: "tb", label: "Trial balance" }, { key: "journal", label: "Journal" }]} />}
    >
      {tab === "opening" && <Opening />}
      {tab === "coa" && <COA newAcc={newAcc} setNewAcc={setNewAcc} />}
      {tab === "tb" && <TrialBalance />}
      {tab === "journal" && <Journal manual={manual} setManual={setManual} />}
    </Screen>
  );
}

function Opening() {
  const { db, commit } = useDB();
  const { toast } = useOverlay();
  const [lines, setLines] = useState([{ account: "", region: "Lahore", debit: "", credit: "" }]);
  const [desc, setDesc] = useState("");
  const dr = lines.reduce((a, l) => a + (Number(l.debit) || 0), 0);
  const cr = lines.reduce((a, l) => a + (Number(l.credit) || 0), 0);
  return (
    <>
      <Card>
        <T v="h3" style={{ marginBottom: 10 }}>New batch</T>
        <Input label="Description" value={desc} onChangeText={setDesc} />
        {lines.map((l, i) => (
          <Card key={i} style={{ marginBottom: 8 }} pad={12}>
            <Select label="Account" value={l.account} onChange={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, account: v } : x)))} options={db.accounts.filter((a) => a.parent).map((a) => ({ value: a.code, label: `${a.code} · ${a.name}` }))} />
            <Select label="Region" value={l.region} onChange={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, region: v } : x)))} options={db.branches.map((b) => ({ value: b.name, label: b.name }))} />
            <HStack gap={10}>
              <Input style={{ flex: 1 }} label="Debit" amount value={l.debit} onChangeText={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, debit: v } : x)))} />
              <Input style={{ flex: 1 }} label="Credit" amount value={l.credit} onChangeText={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, credit: v } : x)))} />
            </HStack>
          </Card>
        ))}
        <Button size="sm" variant="secondary" icon={Plus} label="Add line" onPress={() => setLines([...lines, { account: "", region: "Lahore", debit: "", credit: "" }])} />
        <Ledger label="Debits" value={pkr(dr)} top />
        <Ledger label="Credits" value={pkr(cr)} />
        <Ledger label="Difference" value={pkr(dr - cr)} strong tone={dr === cr ? "success" : "danger"} />
        <Button label="Post batch" disabled={!dr || dr !== cr} onPress={() => {
          commit((d) => { d.openingBatches.unshift({ id: `ob${Date.now()}`, description: desc || "Opening balances", date: TODAY, region: "Mixed", posted: true, lines: lines.map((l) => ({ account: l.account, region: l.region, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })) }); });
          setLines([{ account: "", region: "Lahore", debit: "", credit: "" }]); setDesc(""); toast("Batch posted");
        }} />
      </Card>
      <Section title="Posted batches" count={db.openingBatches.length}>
        {db.openingBatches.map((b) => (
          <RecordCard key={b.id} title={b.description} subtitle={fmtShort(b.date)} badge={<Badge label="Posted" tone="success" small />}
            fields={b.lines.map((l) => ({ label: `${l.account} · ${l.region}`, value: l.debit ? `Dr ${pkr(l.debit, { compact: true })}` : `Cr ${pkr(l.credit, { compact: true })}`, mono: true }))} />
        ))}
      </Section>
    </>
  );
}

function COA({ newAcc, setNewAcc }: { newAcc: boolean; setNewAcc: (b: boolean) => void }) {
  const t = useTheme();
  const { db, commit } = useDB();
  const { toast } = useOverlay();
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [edit, setEdit] = useState<Account | null>(null);
  const [f, setF] = useState({ code: "", name: "", type: "expense", parent: "6000" });
  const bal = accountBalances(db);
  const rollup = (code: string): { debit: number; credit: number } => {
    const own = bal[code] ?? { debit: 0, credit: 0 };
    return db.accounts.filter((a) => a.parent === code).reduce((acc, c) => { const r = rollup(c.code); return { debit: acc.debit + r.debit, credit: acc.credit + r.credit }; }, { ...own });
  };
  const list = db.accounts.filter((a) => (type === "all" || a.type === type) && (!q || (a.code + a.name).toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <SearchBar value={q} onChange={setQ} placeholder="Code or name" />
      <View style={{ marginVertical: 10 }}><Chips value={type} onChange={setType} items={[{ key: "all", label: "All" }, ...Object.entries(TYPE_LABEL).map(([k, v]) => ({ key: k, label: v }))]} /></View>
      <Card pad={0}>
        {list.map((a, i) => {
          const r = rollup(a.code);
          const net = r.debit - r.credit;
          return (
            <Pressable key={a.code} onPress={() => { tap(); if (!a.system) setEdit(a); }} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, paddingRight: 14, paddingLeft: a.parent ? 30 : 14, borderBottomWidth: i === list.length - 1 ? 0 : 1, borderBottomColor: t.border, backgroundColor: a.parent ? "transparent" : t.muted }}>
              <T v="mono" muted style={{ width: 42 }}>{a.code}</T>
              <View style={{ flex: 1 }}>
                <T v={a.parent ? "small" : "smallStrong"} style={{ fontSize: 14 }}>{a.name}</T>
                <HStack gap={4}>{a.control && <Badge label="control" small tone="info" />}{a.system && <Badge label="system" small tone="neutral" />}</HStack>
              </View>
              <T v="mono" style={{ fontSize: 13 }} color={net < 0 ? t.tone("danger").text : t.fg}>{net ? pkr(net, { compact: true }) : "—"}</T>
              {!a.system && <Pencil size={14} color={t.mutedFg} />}
            </Pressable>
          );
        })}
      </Card>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={`Edit ${edit?.code ?? ""}`} footer={<Button label="Save" full onPress={() => { commit((d) => { d.accounts.find((a) => a.code === edit!.code)!.name = f.name || edit!.name; }); setEdit(null); toast("Account saved"); }} />}>
        <Input label="Name" defaultValue={edit?.name} onChangeText={(v) => setF({ ...f, name: v })} />
      </Sheet>
      <Sheet open={newAcc} onClose={() => setNewAcc(false)} title="New account" footer={<Button label="Create" full disabled={!f.code || !f.name} onPress={() => {
        commit((d) => { d.accounts.push({ code: f.code, name: f.name, type: f.type as Account["type"], parent: f.parent, control: false, system: false }); d.accounts.sort((a, b) => a.code.localeCompare(b.code)); });
        setNewAcc(false); toast("Account created");
      }} />}>
        <Input label="Code" required keyboardType="numeric" value={f.code} onChangeText={(v) => setF({ ...f, code: v })} />
        <Input label="Name" required value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
        <Select label="Parent" value={f.parent} onChange={(v) => setF({ ...f, parent: v, type: db.accounts.find((a) => a.code === v)!.type })} options={db.accounts.filter((a) => !a.parent).map((a) => ({ value: a.code, label: `${a.code} · ${a.name}` }))} />
      </Sheet>
    </>
  );
}

function TrialBalance() {
  const t = useTheme();
  const { db } = useDB();
  const [hideZero, setHideZero] = useState(true);
  const [branch, setBranch] = useState("");
  const bal = accountBalances(db);
  const rows = db.accounts.filter((a) => a.parent).map((a) => {
    const b = bal[a.code] ?? { debit: 0, credit: 0 };
    const net = b.debit - b.credit;
    return { a, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 };
  }).filter((r) => !hideZero || r.debit || r.credit);
  // Footer = sum of the rows shown, computed here on purpose (web CLAUDE.md "Reading versus computing").
  const dr = rows.reduce((x, r) => x + r.debit, 0);
  const cr = rows.reduce((x, r) => x + r.credit, 0);
  return (
    <>
      <Select compact clearable label="Branch" value={branch} onChange={setBranch} placeholder="All" options={db.branches.map((b) => ({ value: b.id, label: b.name }))} />
      <Toggle label="Hide zero balances" value={hideZero} onChange={setHideZero} />
      <Card>
        <HStack style={{ paddingBottom: 8 }}>
          <T v="eyebrow" muted style={{ flex: 1 }}>Account</T>
          <T v="eyebrow" muted style={{ width: 88, textAlign: "right" }}>Debit</T>
          <T v="eyebrow" muted style={{ width: 88, textAlign: "right" }}>Credit</T>
        </HStack>
        {rows.map((r) => (
          <HStack key={r.a.code} style={{ paddingVertical: 8 }}>
            <View style={{ flex: 1 }}>
              <T v="small" style={{ fontSize: 14 }} numberOfLines={1}>{r.a.name}</T>
              <T v="mono" muted style={{ fontSize: 11 }}>{r.a.code}</T>
            </View>
            <T v="mono" style={{ width: 88, textAlign: "right", fontSize: 12 }}>{r.debit ? num(r.debit) : ""}</T>
            <T v="mono" style={{ width: 88, textAlign: "right", fontSize: 12 }}>{r.credit ? num(r.credit) : ""}</T>
          </HStack>
        ))}
        <HStack style={{ paddingTop: 10, marginTop: 6, borderTopWidth: 2, borderTopColor: t.borderStrong }}>
          <T v="bodyStrong" style={{ flex: 1 }}>Total</T>
          <T v="monoLg" style={{ width: 88, textAlign: "right", fontSize: 12 }}>{num(dr)}</T>
          <T v="monoLg" style={{ width: 88, textAlign: "right", fontSize: 12 }}>{num(cr)}</T>
        </HStack>
      </Card>
      {dr !== cr && <Banner tone="danger" title="Out of balance" sub={`Difference ${pkr(dr - cr)}`} />}
    </>
  );
}

const SOURCES = ["Invoice", "Invoice payment", "Payslip", "Payslip disbursement", "Expense", "Advance", "Cheque", "Custody transfer", "Partner entry", "Opening balance"];
const FOCUS: Record<string, string> = { Invoice: "/invoices", "Invoice payment": "/invoices", Payslip: "/payroll", "Payslip disbursement": "/payroll", Expense: "/expenses", Advance: "/expenses" };

function Journal({ manual, setManual }: { manual: boolean; setManual: (b: boolean) => void }) {
  const t = useTheme();
  const router = useRouter();
  const { db, commit } = useDB();
  const { toast } = useOverlay();
  const [src, setSrc] = useState<string[]>([]);
  const [acct, setAcct] = useState("");
  const [lines, setLines] = useState([{ account: "", debit: "", credit: "" }, { account: "", debit: "", credit: "" }]);
  const [memo, setMemo] = useState("");
  const list = db.journal.filter((j) => (!src.length || src.includes(j.source)) && (!acct || j.lines.some((l) => l.account === acct))).sort((a, b) => b.date.localeCompare(a.date));
  const name = (c: string) => db.accounts.find((a) => a.code === c)?.name ?? c;
  const dr = lines.reduce((a, l) => a + (Number(l.debit) || 0), 0);
  const cr = lines.reduce((a, l) => a + (Number(l.credit) || 0), 0);
  return (
    <>
      <Chips multi value={src} onChange={(k) => setSrc(src.includes(k) ? src.filter((x) => x !== k) : [...src, k])} items={SOURCES.map((s) => ({ key: s, label: s }))} />
      <View style={{ marginVertical: 10 }}><Select compact clearable label="Account" value={acct} onChange={setAcct} placeholder="All" options={db.accounts.map((a) => ({ value: a.code, label: `${a.code} · ${a.name}` }))} /></View>
      {list.map((j) => (
        <Card key={j.id} style={{ marginBottom: 10 }}>
          <HStack style={{ marginBottom: 6 }}>
            <View style={{ flex: 1 }}>
              <T v="smallStrong" style={{ fontSize: 14 }}>{j.memo}</T>
              <T v="mono" muted style={{ fontSize: 11 }}>{fmtShort(j.date)} · {j.ref}</T>
            </View>
            {FOCUS[j.source] ? <Badge label={`${j.source} →`} tone="brand" small /> : <Badge label={j.source} tone="neutral" small />}
          </HStack>
          {j.lines.map((l, i) => (
            <HStack key={i} style={{ paddingVertical: 4, paddingLeft: l.credit ? 16 : 0 }}>
              <T v="small" soft style={{ flex: 1 }} numberOfLines={1}>{l.account} · {name(l.account)}</T>
              <T v="mono" style={{ fontSize: 12 }} color={l.credit ? t.mutedFg : t.fg}>{l.debit ? `Dr ${num(l.debit)}` : `Cr ${num(l.credit)}`}</T>
            </HStack>
          ))}
          {FOCUS[j.source] ? <T v="smallStrong" color={t.tone("brand").text} style={{ marginTop: 6 }} onPress={() => router.push(`${FOCUS[j.source]}?focus=${j.ref}` as never)}>Open source</T> : null}
        </Card>
      ))}
      <Sheet open={manual} onClose={() => setManual(false)} title="Manual journal entry" full footer={<Button label="Post" full disabled={!dr || dr !== cr} onPress={() => {
        commit((d) => { d.journal.unshift({ id: `j${Date.now()}`, date: TODAY, ref: "Manual", source: "Manual", memo: memo || "Manual entry", lines: lines.filter((l) => l.account).map((l) => ({ account: l.account, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })) }); });
        setManual(false); toast("Journal entry posted");
      }} />}>
        <Input label="Memo" value={memo} onChangeText={setMemo} />
        {lines.map((l, i) => (
          <Card key={i} pad={12} style={{ marginBottom: 8 }}>
            <Select label="Account" value={l.account} onChange={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, account: v } : x)))} options={db.accounts.filter((a) => a.parent).map((a) => ({ value: a.code, label: `${a.code} · ${a.name}` }))} />
            <HStack gap={10}>
              <Input style={{ flex: 1 }} label="Debit" amount value={l.debit} onChangeText={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, debit: v } : x)))} />
              <Input style={{ flex: 1 }} label="Credit" amount value={l.credit} onChangeText={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, credit: v } : x)))} />
            </HStack>
          </Card>
        ))}
        <Button size="sm" variant="secondary" icon={Plus} label="Add line" onPress={() => setLines([...lines, { account: "", debit: "", credit: "" }])} />
        <Ledger label="Difference" value={pkr(dr - cr)} strong top tone={dr === cr ? "success" : "danger"} />
      </Sheet>
    </>
  );
}
