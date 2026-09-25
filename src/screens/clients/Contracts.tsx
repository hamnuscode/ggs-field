import { useLocalSearchParams, useRouter } from "expo-router";
import { CalendarSync, FileSignature, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react-native";
import React, { useState } from "react";
import { View } from "react-native";
import { Progress } from "../../components/Charts";
import { Screen } from "../../components/Screen";
import { Select, Sheet, useOverlay } from "../../components/Sheet";
import { T } from "../../components/Text";
import { Badge, Button, Card, Chips, Empty, HStack, IconBtn, Input, Ledger, ListCard, RecordCard, Row, SearchBar, Section, toneOf } from "../../components/ui";
import { Contract, contractValue, TODAY } from "../../data/seed";
import { clientName, useDB } from "../../data/store";
import { useAuth } from "../../lib/auth";
import { addDays, daysBetween, fmtDate, fmtShort, num, pkr } from "../../lib/format";
import { inRegion, useRegion } from "../../lib/region";

const STATUS = ["active", "expired", "terminated", "draft"] as const;

export default function Contracts() {
  const router = useRouter();
  const { db } = useDB();
  const { can } = useAuth();
  const { regionId } = useRegion();
  const [q, setQ] = useState("");
  const [client, setClient] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [sort, setSort] = useState<"end" | "value" | "guards">("end");
  const [edit, setEdit] = useState<Contract | "new" | null>(null);

  const list = db.contracts
    .filter((k) => inRegion(regionId, db.clients.find((c) => c.id === k.client_id)?.branch_id) && (!client || k.client_id === client) && (status === "all" || k.status === status) &&
      (!q || (k.code + clientName(db, k.client_id)).toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => sort === "end" ? a.end.localeCompare(b.end) : sort === "value" ? contractValue(b) - contractValue(a) : b.lines.reduce((x, l) => x + l.committed, 0) - a.lines.reduce((x, l) => x + l.committed, 0));

  return (
    <Screen
      region
      eyebrow="Clients & Contracts"
      title="Contracts"
      actions={can("contracts.edit") ? <IconBtn icon={Plus} label="New contract" filled onPress={() => setEdit("new")} /> : undefined}
      sticky={<SearchBar value={q} onChange={setQ} placeholder="Code or client" />}
    >
      <Select compact clearable label="Client" value={client} onChange={setClient} placeholder="All" options={db.clients.map((c) => ({ value: c.id, label: c.name }))} />
      <View style={{ marginTop: 8 }}>
        <Chips value={status} onChange={setStatus} items={[{ key: "all", label: "All" }, ...STATUS.map((s) => ({ key: s, label: s[0]!.toUpperCase() + s.slice(1), count: db.contracts.filter((k) => k.status === s).length }))]} />
      </View>
      <HStack style={{ marginTop: 10, marginBottom: 12 }}>
        <T v="small" muted>Sort</T>
        <Chips value={sort} onChange={setSort} items={[{ key: "end", label: "Ending soonest" }, { key: "value", label: "Value" }, { key: "guards", label: "Guards" }]} />
      </HStack>
      {list.map((k) => {
        const committed = k.lines.reduce((a, l) => a + l.committed, 0);
        const active = k.lines.reduce((a, l) => a + l.active, 0);
        const left = daysBetween(TODAY, k.end);
        return (
          <RecordCard
            key={k.id}
            title={clientName(db, k.client_id)}
            subtitle={k.code}
            badge={<Badge label={k.status} tone={toneOf(k.status)} />}
            accent={k.status === "active" && left <= 30 ? "warning" : undefined}
            onPress={() => router.push(`/contracts/${k.id}`)}
            fields={[
              { label: "Period", value: `${fmtShort(k.start)} – ${fmtShort(k.end)}` },
              { label: "Value / month", value: pkr(contractValue(k), { compact: true }), mono: true },
              { label: "Guards", value: `${active}/${committed}`, tone: active < committed ? "danger" : undefined },
              { label: "Document", value: k.document ? "Uploaded" : "Missing", tone: k.document ? undefined : "warning" },
            ]}
            tags={k.status === "active" && left <= 60 ? <Badge small label={`${left} days left`} tone={left <= 30 ? "danger" : "warning"} /> : undefined}
          />
        );
      })}
      {list.length === 0 && <Empty icon={FileSignature} title="No contracts match" />}
      <ContractEditor key={edit === "new" ? "new" : edit?.id ?? "none"} contract={edit} onClose={() => setEdit(null)} />
    </Screen>
  );
}

export function ContractDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { db, commit } = useDB();
  const { can } = useAuth();
  const { toast, confirm } = useOverlay();
  const [edit, setEdit] = useState<Contract | null>(null);
  const [renew, setRenew] = useState(false);
  const [cycles, setCycles] = useState(false);
  const k = db.contracts.find((x) => x.id === id);
  if (!k) return <Screen title="Contract"><Empty title="Contract not found" /></Screen>;
  const committed = k.lines.reduce((a, l) => a + l.committed, 0);
  const active = k.lines.reduce((a, l) => a + l.active, 0);

  return (
    <Screen
      eyebrow={k.code}
      title={clientName(db, k.client_id)}
      subtitle={`${fmtDate(k.start)} → ${fmtDate(k.end)}`}
      actions={can("contracts.edit") ? <IconBtn icon={Pencil} label="Edit" onPress={() => setEdit(k)} /> : undefined}
      footer={can("contracts.edit") ? <>
        <Button label="Cycles" icon={CalendarSync} variant="secondary" full onPress={() => setCycles(true)} />
        <Button label="Renew" icon={RefreshCw} full onPress={() => setRenew(true)} />
      </> : undefined}
    >
      <Card>
        <HStack style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <Badge label={k.status} tone={toneOf(k.status)} dot />
          <T v="small" muted>{k.type === "services" ? "Services" : "Guard deployment"}</T>
        </HStack>
        <T v="eyebrow" muted>Value per month</T>
        <T v="figure" style={{ marginTop: 4 }}>{pkr(contractValue(k))}</T>
        <View style={{ marginTop: 14, gap: 6 }}>
          <HStack><T v="small" soft style={{ flex: 1 }}>Guards posted</T><T v="mono">{active}/{committed}</T></HStack>
          <Progress value={active} max={committed} tone={active < committed ? "warning" : "success"} />
        </View>
      </Card>

      <Section title="Contract lines" count={k.lines.length}>
        {k.lines.map((l) => (
          <Card key={l.id} style={{ marginBottom: 8 }}>
            <HStack><T v="bodyStrong" style={{ flex: 1 }}>{l.category}</T><Badge label={`${l.active}/${l.committed} active`} small tone={l.active < l.committed ? "warning" : "success"} /></HStack>
            {l.notes ? <T v="small" muted style={{ marginTop: 2 }}>{l.notes}</T> : null}
            <Ledger label={`${l.committed} × ${pkr(l.rate)}`} value={pkr(l.committed * l.rate)} />
          </Card>
        ))}
        <Card><Ledger label="Total / month" value={pkr(contractValue(k))} strong /></Card>
      </Section>

      <Section title="Weapons & equipment"><Card><T v="body">{k.weapons}</T></Card></Section>

      <Section title="Addendums" count={k.addendums.length}>
        {k.addendums.length ? k.addendums.map((a, i) => (
          <RecordCard key={i} title={a.change.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())} subtitle={a.reference} fields={[
            { label: "Effective", value: fmtShort(a.effective) }, { label: "Line", value: a.line }, { label: "Shift", value: a.shift }, { label: "Source", value: a.source.toLowerCase() },
          ]} />
        )) : <T v="small" muted>No addendums.</T>}
      </Section>

      <Section title="Document">
        <ListCard><Row last title={k.document ? `${k.code}.pdf` : "No signed copy uploaded"} subtitle={k.document ? "Signed contract" : "Upload from the web or a device build"} /></ListCard>
      </Section>

      {can("contracts.edit") && (
        <Button label="Delete contract" icon={Trash2} variant="ghost" style={{ marginTop: 20 }} onPress={async () => {
          if (await confirm({ title: `Delete ${k.code}?`, message: "Guards posted on its lines lose their line. This can't be undone.", confirmLabel: "Delete", tone: "danger" })) {
            commit((d) => { d.contracts = d.contracts.filter((x) => x.id !== k.id); });
            toast("Contract deleted", "warning"); router.back();
          }
        }} />
      )}

      <ContractEditor key={edit?.id ?? "none"} contract={edit} onClose={() => setEdit(null)} />
      <Sheet open={renew} onClose={() => setRenew(false)} title={`Renew ${k.code}`}
        footer={<><Button label="Cancel" variant="secondary" full onPress={() => setRenew(false)} /><Button label="Renew 12 months" full onPress={() => { commit((d) => { d.contracts.find((x) => x.id === k.id)!.end = addDays(k.end, 365); d.contracts.find((x) => x.id === k.id)!.status = "active"; }); setRenew(false); toast("Contract renewed"); }} /></>}>
        <Ledger label="Current end" value={fmtDate(k.end)} />
        <Ledger label="New end" value={fmtDate(addDays(k.end, 365))} strong />
        <T v="small" muted style={{ marginTop: 10 }}>Lines and rates carry over. Change rates with an addendum.</T>
      </Sheet>
      <Sheet open={cycles} onClose={() => setCycles(false)} title={`Cycles — ${k.code}`}>
        <ListCard>
          {db.invoices.filter((i) => i.contract_id === k.id).map((i, n, a) => <Row key={i.id} last={n === a.length - 1} title={i.month} subtitle={i.number} right={<Badge label={i.status} small />} />)}
        </ListCard>
      </Sheet>
    </Screen>
  );
}

function ContractEditor({ contract, onClose }: { contract: Contract | "new" | null; onClose: () => void }) {
  const { db, commit } = useDB();
  const { toast, confirm } = useOverlay();
  const isNew = contract === "new";
  const blank: Contract = { id: "", code: "", client_id: "", type: "guard_deployment", start: TODAY, end: addDays(TODAY, 365), status: "draft", lines: [{ id: "n1", category: "Unarmed guard", notes: "", committed: 1, rate: 42000, active: 0 }], weapons: "", document: false, addendums: [] };
  const [f, setF] = useState<Contract>(() => (contract && contract !== "new" ? JSON.parse(JSON.stringify(contract)) : blank));
  const setLine = (i: number, patch: Partial<Contract["lines"][number]>) => setF({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  return (
    <Sheet open={!!contract} onClose={onClose} title={isNew ? "New contract" : `Edit ${f.code}`} full
      footer={<><Button label="Cancel" variant="secondary" full onPress={onClose} /><Button label="Save" full disabled={!f.client_id || !f.code} onPress={async () => {
        if (isNew && db.contracts.some((k) => k.client_id === f.client_id && k.status === "active")) {
          if (!(await confirm({ title: "This client already has a contract", message: "Create a second active contract anyway?", confirmLabel: "Create" }))) return;
        }
        commit((d) => { if (isNew) d.contracts.push({ ...f, id: `k${d.contracts.length + 1}` }); else Object.assign(d.contracts.find((x) => x.id === f.id)!, f); });
        toast(isNew ? "Contract created" : "Contract saved"); onClose();
      }} /></>}>
      <Select label="Client" required value={f.client_id} onChange={(v) => setF({ ...f, client_id: v })} options={db.clients.map((c) => ({ value: c.id, label: c.name }))} />
      <HStack gap={10}>
        <Input style={{ flex: 1 }} label="Code" required value={f.code} autoCapitalize="characters" onChangeText={(v) => setF({ ...f, code: v })} />
        <View style={{ flex: 1 }}><Select label="Type" value={f.type} onChange={(v) => setF({ ...f, type: v as Contract["type"] })} options={[{ value: "guard_deployment", label: "Guard deployment" }, { value: "services", label: "Services" }]} /></View>
      </HStack>
      <HStack gap={10}>
        <Input style={{ flex: 1 }} label="Start" value={f.start} onChangeText={(v) => setF({ ...f, start: v })} />
        <Input style={{ flex: 1 }} label="End" value={f.end} onChangeText={(v) => setF({ ...f, end: v })} />
      </HStack>
      <Select label="Status" value={f.status} onChange={(v) => setF({ ...f, status: v as Contract["status"] })} options={STATUS.map((s) => ({ value: s, label: s[0]!.toUpperCase() + s.slice(1) }))} />
      <T v="eyebrow" muted style={{ marginVertical: 10 }}>Contract lines</T>
      {f.lines.map((l, i) => (
        <Card key={l.id} style={{ marginBottom: 10 }}>
          <Input label="Category" value={l.category} onChangeText={(v) => setLine(i, { category: v })} />
          <Input label="Notes" value={l.notes} onChangeText={(v) => setLine(i, { notes: v })} />
          <HStack gap={10}>
            <Input style={{ flex: 1 }} label="Committed" keyboardType="numeric" value={String(l.committed)} onChangeText={(v) => setLine(i, { committed: Number(v) || 0 })} />
            <Input style={{ flex: 1.4 }} label="Rate / month" amount value={String(l.rate)} onChangeText={(v) => setLine(i, { rate: Number(v) || 0 })} />
          </HStack>
          <Ledger label="Line value" value={pkr(l.committed * l.rate)} />
          {f.lines.length > 1 && <Button size="sm" variant="ghost" label="Remove line" onPress={() => setF({ ...f, lines: f.lines.filter((_, j) => j !== i) })} />}
        </Card>
      ))}
      <Button label="Add line" icon={Plus} variant="secondary" onPress={() => setF({ ...f, lines: [...f.lines, { id: `n${Date.now()}`, category: "", notes: "", committed: 1, rate: 0, active: 0 }] })} />
      <Ledger label="Total / month" value={pkr(f.lines.reduce((a, l) => a + l.committed * l.rate, 0))} strong top />
      <Input label="Weapons & equipment" multiline value={f.weapons} onChangeText={(v) => setF({ ...f, weapons: v })} />
      <T v="small" muted>{num(f.lines.reduce((a, l) => a + l.committed, 0))} guards committed</T>
    </Sheet>
  );
}
