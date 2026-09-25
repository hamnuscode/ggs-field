import { useLocalSearchParams } from "expo-router";
import { ArrowLeftRight, FileDown, PackagePlus, Plus, Undo2 } from "lucide-react-native";
import React, { useState } from "react";
import { View } from "react-native";
import { Progress } from "../../components/Charts";
import { Screen } from "../../components/Screen";
import { Select, Sheet, useOverlay } from "../../components/Sheet";
import { T } from "../../components/Text";
import { Badge, Button, Card, Empty, HStack, IconBtn, Input, Ledger, ListCard, RecordCard, Row, SearchBar, Section, StatGrid, Tabs, Toggle } from "../../components/ui";
import { Holding, StockItem, TODAY } from "../../data/seed";
import { clientName, useDB } from "../../data/store";
import { useAuth } from "../../lib/auth";
import { fmtShort, pkr } from "../../lib/format";

type Tab = "store" | "issuance" | "clearance" | "register";

export default function Assets() {
  const { tab: initial } = useLocalSearchParams<{ tab?: Tab }>();
  const { can, canAny } = useAuth();
  const [tab, setTab] = useState<Tab>(initial ?? "store");
  const [newItem, setNewItem] = useState(false);
  const [issue, setIssue] = useState(false);
  return (
    <Screen
      eyebrow="Operations"
      title="Assets & Issuance"
      actions={can("inventory.edit") ? (tab === "store" ? <IconBtn icon={PackagePlus} label="New item type" filled onPress={() => setNewItem(true)} /> : tab === "issuance" ? <IconBtn icon={Plus} label="Issue kit" filled onPress={() => setIssue(true)} /> : undefined) : undefined}
      sticky={<Tabs value={tab} onChange={setTab} items={[{ key: "store", label: "Store" }, { key: "issuance", label: "Issuance" }, ...(canAny(["clearance.ops", "clearance.finance", "inventory.view"]) ? [{ key: "clearance" as const, label: "Clearance" }] : []), { key: "register", label: "Register" }]} />}
    >
      {tab === "store" && <Store newItem={newItem} setNewItem={setNewItem} />}
      {tab === "issuance" && <Issuance issue={issue} setIssue={setIssue} />}
      {tab === "clearance" && <Clearance />}
      {tab === "register" && <Register />}
    </Screen>
  );
}

function Store({ newItem, setNewItem }: { newItem: boolean; setNewItem: (b: boolean) => void }) {
  const { db, commit } = useDB();
  const { can } = useAuth();
  const { toast } = useOverlay();
  const [purchase, setPurchase] = useState(false);
  const [stocktake, setStocktake] = useState(false);
  const [kitFrom, setKitFrom] = useState(true);
  const [f, setF] = useState({ name: "", kind: "uniform", cost: "", replacement: "", item: "", qty: "" });
  const onHand = db.stock.reduce((a, s) => a + (s.qty - s.issued) * s.cost, 0);
  return (
    <>
      <Card style={{ marginBottom: 12 }}>
        <Toggle label="Kit is required from day one" sub="New hires can't be posted until uniform is issued." value={kitFrom} onChange={(v) => { setKitFrom(v); toast("Setting saved"); }} />
      </Card>
      <StatGrid items={[{ label: "Stock value on hand", value: pkr(onHand, { compact: true }), tone: "brand" }, { label: "Items issued", value: String(db.stock.reduce((a, s) => a + s.issued, 0)), tone: "info" }]} />
      <Section title="Stock on hand" count={db.stock.length} action={can("inventory.edit") ? <T v="smallStrong" onPress={() => setPurchase(true)}>Record purchase</T> : undefined}>
        {db.stock.map((s) => (
          <Card key={s.id} style={{ marginBottom: 8 }}>
            <HStack>
              <View style={{ flex: 1 }}>
                <T v="bodyStrong">{s.name}</T>
                <T v="small" muted>{s.kind}{s.serialised ? " · serialised" : ""}</T>
              </View>
              <T v="monoLg">{s.qty - s.issued}<T v="mono" muted> / {s.qty}</T></T>
            </HStack>
            <View style={{ marginVertical: 10 }}><Progress value={s.issued} max={s.qty} tone={s.qty - s.issued < s.qty * 0.15 ? "danger" : "brand"} /></View>
            <HStack><T v="small" muted style={{ flex: 1 }}>Actual {pkr(s.cost)}</T><T v="small" muted>Replacement {pkr(s.replacement)}</T></HStack>
          </Card>
        ))}
      </Section>
      {can("inventory.edit") && <Button label="Opening stocktake" variant="secondary" style={{ marginTop: 8 }} onPress={() => setStocktake(true)} />}

      <Sheet open={newItem} onClose={() => setNewItem(false)} title="New item type" footer={<Button label="Create" full disabled={!f.name} onPress={() => {
        commit((d) => { d.stock.push({ id: `it${Date.now()}`, name: f.name, kind: f.kind as StockItem["kind"], qty: 0, issued: 0, cost: Number(f.cost) || 0, replacement: Number(f.replacement) || 0, serialised: f.kind !== "uniform" }); });
        setNewItem(false); toast("Item type created");
      }} />}>
        <Input label="Name" required value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
        <Select label="Kind" value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={[{ value: "uniform", label: "Uniform" }, { value: "weapon", label: "Weapon" }, { value: "equipment", label: "Equipment" }]} />
        <Input label="Actual cost" amount value={f.cost} onChangeText={(v) => setF({ ...f, cost: v })} />
        <Input label="Replacement cost (fine)" amount value={f.replacement} onChangeText={(v) => setF({ ...f, replacement: v })} />
      </Sheet>
      <Sheet open={purchase} onClose={() => setPurchase(false)} title="Record a purchase" footer={<Button label="Record" full disabled={!f.item || !f.qty} onPress={() => {
        commit((d) => { d.stock.find((s) => s.id === f.item)!.qty += Number(f.qty); }); setPurchase(false); toast("Purchase recorded");
      }} />}>
        <Select label="Item" required value={f.item} onChange={(v) => setF({ ...f, item: v })} options={db.stock.map((s) => ({ value: s.id, label: s.name }))} />
        <Input label="Quantity" required keyboardType="numeric" value={f.qty} onChangeText={(v) => setF({ ...f, qty: v })} />
        <Input label="Unit cost" amount value={f.cost} onChangeText={(v) => setF({ ...f, cost: v })} />
      </Sheet>
      <Sheet open={stocktake} onClose={() => setStocktake(false)} title="Opening stocktake" full footer={<Button label="Save counts" full onPress={() => { setStocktake(false); toast("Stocktake saved"); }} />}>
        {db.stock.map((s) => <Input key={s.id} label={s.name} keyboardType="numeric" defaultValue={String(s.qty)} />)}
      </Sheet>
    </>
  );
}

function Issuance({ issue, setIssue }: { issue: boolean; setIssue: (b: boolean) => void }) {
  const { db, commit } = useDB();
  const { can } = useAuth();
  const { toast } = useOverlay();
  const [q, setQ] = useState("");
  const [ret, setRet] = useState<Holding | null>(null);
  const [hand, setHand] = useState<Holding | null>(null);
  const [f, setF] = useState({ client: "", emp: "", item: "", serial: "", condition: "Good", to: "" });
  const list = db.holdings.filter((h) => !q || (db.employees.find((e) => e.id === h.employee_id)!.name + h.serial).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <SearchBar value={q} onChange={setQ} placeholder="Guard or serial" />
      <View style={{ height: 12 }} />
      {list.map((h) => {
        const e = db.employees.find((x) => x.id === h.employee_id)!;
        const it = db.stock.find((s) => s.id === h.item_id)!;
        return (
          <RecordCard key={h.id} title={it.name} subtitle={e.name} badge={<Badge label={h.condition} tone={h.condition === "Good" ? "success" : h.condition === "Fair" ? "warning" : "danger"} small />}
            fields={[{ label: "Serial", value: h.serial, mono: true }, { label: "Since", value: fmtShort(h.since) }]}
            actions={can("inventory.edit") ? [{ label: "Return", icon: Undo2, onPress: () => setRet(h) }, { label: "Handover", icon: ArrowLeftRight, onPress: () => setHand(h) }] : undefined} />
        );
      })}
      {list.length === 0 && <Empty title="No kit out" />}
      <Sheet open={issue} onClose={() => setIssue(false)} title="Issue kit" footer={<Button label="Issue" full disabled={!f.emp || !f.item} onPress={() => {
        commit((d) => { d.holdings.unshift({ id: `h${Date.now()}`, employee_id: f.emp, item_id: f.item, serial: f.serial || "—", condition: f.condition as Holding["condition"], since: TODAY }); d.stock.find((s) => s.id === f.item)!.issued += 1; });
        setIssue(false); toast("Kit issued");
      }} />}>
        <Select label="Client" clearable value={f.client} onChange={(v) => setF({ ...f, client: v, emp: "" })} options={db.clients.map((c) => ({ value: c.id, label: c.name }))} />
        <Select label="Guard" required searchable value={f.emp} onChange={(v) => setF({ ...f, emp: v })} options={db.employees.filter((e) => e.lifecycle === "active" && (!f.client || e.client_id === f.client)).map((e) => ({ value: e.id, label: e.name, sub: `${e.code} · ${clientName(db, e.client_id)}` }))} />
        <Select label="Item" required value={f.item} onChange={(v) => setF({ ...f, item: v })} options={db.stock.map((s) => ({ value: s.id, label: s.name, sub: `${s.qty - s.issued} in store` }))} />
        {db.stock.find((s) => s.id === f.item)?.serialised ? <Input label="Serial number" value={f.serial} onChangeText={(v) => setF({ ...f, serial: v })} autoCapitalize="characters" /> : null}
        <Select label="Condition" value={f.condition} onChange={(v) => setF({ ...f, condition: v })} options={["Good", "Fair", "Damaged"].map((x) => ({ value: x, label: x }))} />
      </Sheet>
      <Sheet open={!!ret} onClose={() => setRet(null)} title="Return to store" footer={<Button label="Return" full onPress={() => {
        commit((d) => { d.holdings = d.holdings.filter((x) => x.id !== ret!.id); d.stock.find((s) => s.id === ret!.item_id)!.issued -= 1; }); setRet(null); toast("Returned to store");
      }} />}>
        <Select label="Condition on return" value={f.condition} onChange={(v) => setF({ ...f, condition: v })} options={["Good", "Fair", "Damaged"].map((x) => ({ value: x, label: x }))} />
      </Sheet>
      <Sheet open={!!hand} onClose={() => setHand(null)} title="Handover to another guard" footer={<Button label="Hand over" full disabled={!f.to} onPress={() => {
        commit((d) => { d.holdings.find((x) => x.id === hand!.id)!.employee_id = f.to; }); setHand(null); toast("Kit handed over");
      }} />}>
        <Select label="To guard" searchable value={f.to} onChange={(v) => setF({ ...f, to: v })} options={db.employees.filter((e) => e.lifecycle === "active").map((e) => ({ value: e.id, label: e.name, sub: e.code }))} />
      </Sheet>
    </>
  );
}

function Clearance() {
  const { db, commit } = useDB();
  const { can } = useAuth();
  const { toast } = useOverlay();
  const [assess, setAssess] = useState<string | null>(null);
  const [cond, setCond] = useState<Record<string, string>>({});
  const ops = db.clearances.filter((c) => c.stage === "ops");
  const fin = db.clearances.filter((c) => c.stage === "finance");
  const cur = db.clearances.find((c) => c.id === assess);
  const fine = cur ? cur.items.reduce((a, it) => a + (cond[it] === "Damaged" || cond[it] === "Missing" ? db.stock.find((s) => s.name === it)?.replacement ?? 0 : cond[it] === "Fair" ? 300 : 0), 0) : 0;
  return (
    <>
      {can("clearance.ops") || can("inventory.view") ? (
        <Section title="Not cleared — Operations" count={ops.length}>
          {ops.map((c) => {
            const e = db.employees.find((x) => x.id === c.employee_id)!;
            return <RecordCard key={c.id} title={e.name} subtitle={e.code} accent="warning" fields={[{ label: "Left on", value: fmtShort(c.fired) }, { label: "Kit out", value: c.items.join(", "), full: true }]}
              actions={can("clearance.ops") ? [{ label: "Assess kit", tone: "brand", onPress: () => { setCond({}); setAssess(c.id); } }] : undefined} />;
          })}
          {ops.length === 0 && <T v="small" muted>Nothing waiting on operations.</T>}
        </Section>
      ) : null}
      <Section title="Cleared by operations — Finance" count={fin.length}>
        {fin.map((c) => {
          // Finance sees the outcome only, never the per-item assessment.
          const e = db.employees.find((x) => x.id === c.employee_id)!;
          return <RecordCard key={c.id} title={e.name} subtitle={e.code} fields={[{ label: "Fines", value: pkr(c.fines), mono: true, tone: c.fines ? "danger" : undefined }, { label: "Dues", value: pkr(c.dues), mono: true }, { label: "Net payable", value: pkr(c.dues - c.fines), mono: true, tone: "success" }]}
            actions={can("clearance.finance") ? [{ label: "Settle & release", tone: "brand", onPress: () => { commit((d) => { d.clearances.find((x) => x.id === c.id)!.stage = "done"; }); toast("Clearance certificate generated"); } }] : undefined} />;
        })}
        {fin.length === 0 && <T v="small" muted>Nothing waiting on finance.</T>}
      </Section>
      <Section title="Cleared">
        <ListCard>{db.clearances.filter((c) => c.stage === "done").map((c, i, a) => <Row key={c.id} last={i === a.length - 1} title={db.employees.find((e) => e.id === c.employee_id)!.name} right={<FileDown size={16} />} onPress={() => toast("Clearance certificate PDF saved", "info")} />)}</ListCard>
      </Section>
      <Sheet open={!!cur} onClose={() => setAssess(null)} title={`Assess kit — ${cur ? db.employees.find((e) => e.id === cur.employee_id)!.name : ""}`}
        footer={<Button label="Clear to finance" full disabled={!cur || cur.items.some((it) => !cond[it])} onPress={() => { commit((d) => { const x = d.clearances.find((y) => y.id === assess)!; x.stage = "finance"; x.fines = fine; }); setAssess(null); toast("Sent to finance"); }} />}>
        {cur?.items.map((it) => <Select key={it} label={it} value={cond[it] ?? ""} onChange={(v) => setCond({ ...cond, [it]: v })} options={["Good", "Fair", "Damaged", "Missing"].map((x) => ({ value: x, label: x }))} />)}
        <Ledger label="Suggested fine" value={pkr(fine)} strong top />
      </Sheet>
    </>
  );
}

function Register() {
  const { db, commit } = useDB();
  const { can } = useAuth();
  const { toast } = useOverlay();
  const [log, setLog] = useState({ vehicle: "LEA-4471", km: "", purpose: "" });
  return (
    <>
      <Section title="Fixed assets" count={db.fixedAssets.length}>
        {db.fixedAssets.map((a) => (
          <RecordCard key={a.id} title={a.name} subtitle={a.region} badge={<Badge label={a.status} tone={a.status === "In use" ? "success" : "warning"} small />}
            fields={[{ label: "Cost", value: pkr(a.cost, { compact: true }), mono: true }, { label: "Accum. dep", value: pkr(a.dep, { compact: true }), mono: true }, { label: "NBV", value: pkr(a.cost - a.dep, { compact: true }), mono: true, tone: "brand" }]} />
        ))}
      </Section>
      <Section title="Vehicle log">
        <ListCard>{db.vehicleLogs.map((v, i) => <Row key={v.id} last={i === db.vehicleLogs.length - 1} title={`${v.vehicle} · ${v.km} km`} subtitle={v.purpose} meta={`${fmtShort(v.date)} · ${v.driver}`} />)}</ListCard>
        {can("inventory.edit") && (
          <Card style={{ marginTop: 10 }}>
            <T v="h3" style={{ marginBottom: 10 }}>New trip</T>
            <Select label="Vehicle" value={log.vehicle} onChange={(v) => setLog({ ...log, vehicle: v })} options={["LEA-4471", "KHI-2210"].map((v) => ({ value: v, label: v }))} />
            <Input label="Kilometres" keyboardType="numeric" value={log.km} onChangeText={(v) => setLog({ ...log, km: v })} />
            <Input label="Purpose" value={log.purpose} onChangeText={(v) => setLog({ ...log, purpose: v })} />
            <Button label="Log trip" disabled={!log.km} onPress={() => { commit((d) => { d.vehicleLogs.unshift({ id: `vl${Date.now()}`, vehicle: log.vehicle, date: TODAY, km: Number(log.km), driver: "—", purpose: log.purpose }); }); setLog({ ...log, km: "", purpose: "" }); toast("Trip logged"); }} />
          </Card>
        )}
      </Section>
      <Section title="Ammunition counts">
        {db.ammo.map((a) => (
          <RecordCard key={a.id} title={fmtShort(a.date)} badge={<Badge label={a.issued === a.accounted ? "Reconciled" : `${a.issued - a.accounted} missing`} tone={a.issued === a.accounted ? "success" : "danger"} small />}
            fields={[{ label: "Issued", value: String(a.issued), mono: true }, { label: "Accounted", value: String(a.accounted), mono: true }]} />
        ))}
      </Section>
    </>
  );
}
