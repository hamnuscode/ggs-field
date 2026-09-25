import { useLocalSearchParams, useRouter } from "expo-router";
import { Building2, FileText, Pencil, Plus } from "lucide-react-native";
import React, { useState } from "react";
import { View } from "react-native";
import { Screen } from "../../components/Screen";
import { Select, Sheet, useOverlay } from "../../components/Sheet";
import { T } from "../../components/Text";
import { Badge, Button, Card, Chips, Empty, Fields, HStack, IconBtn, Input, ListCard, RecordCard, Row, SearchBar, Section, Tabs, toneOf } from "../../components/ui";
import { Client, contractValue } from "../../data/seed";
import { invoiceReceived, useDB } from "../../data/store";
import { useAuth } from "../../lib/auth";
import { fmtMonth, fmtShort, pkr } from "../../lib/format";
import { inRegion, useRegion } from "../../lib/region";

export default function Clients() {
  const router = useRouter();
  const { db } = useDB();
  const { can } = useAuth();
  const { regionId } = useRegion();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [industry, setIndustry] = useState("");
  const [branch, setBranch] = useState("");
  const [edit, setEdit] = useState<Client | "new" | null>(null);

  const list = db.clients.filter((c) =>
    inRegion(regionId, c.branch_id) && (status === "all" || c.status === status) && (!industry || c.industry === industry) && (!branch || c.branch_id === branch) &&
    (!q || (c.name + c.code).toLowerCase().includes(q.toLowerCase())));
  const industries = [...new Set(db.clients.map((c) => c.industry))];

  return (
    <Screen
      region
      eyebrow="Clients & Contracts"
      title="Clients"
      actions={can("clients.edit") ? <IconBtn icon={Plus} label="Add client" filled onPress={() => setEdit("new")} /> : undefined}
      sticky={<SearchBar value={q} onChange={setQ} placeholder="Name or code" />}
    >
      <Chips value={status} onChange={setStatus} items={[{ key: "all", label: "All" }, { key: "active", label: "Active" }, { key: "inactive", label: "Inactive" }]} />
      <HStack style={{ marginTop: 8, marginBottom: 14 }}>
        <View style={{ flex: 1 }}><Select compact clearable label="Industry" value={industry} onChange={setIndustry} placeholder="Any" options={industries.map((i) => ({ value: i, label: i }))} /></View>
        <View style={{ flex: 1 }}><Select compact clearable label="Branch" value={branch} onChange={setBranch} placeholder="Any" options={db.branches.map((b) => ({ value: b.id, label: b.name }))} /></View>
      </HStack>
      {list.map((c) => (
        <RecordCard
          key={c.id}
          title={c.name}
          subtitle={c.code}
          badge={<Badge label={c.status === "active" ? "Active" : "Inactive"} tone={c.status === "active" ? "success" : "neutral"} />}
          onPress={() => router.push(`/clients/${c.id}`)}
          fields={[
            { label: "Industry", value: c.industry },
            { label: "Branch", value: db.branches.find((b) => b.id === c.branch_id)?.name ?? "—" },
            { label: "Employees", value: String(db.employees.filter((e) => e.client_id === c.id && e.lifecycle === "active").length) },
            { label: "Contracts", value: String(db.contracts.filter((k) => k.client_id === c.id).length) },
          ]}
          actions={can("clients.edit") ? [{ label: "Edit", icon: Pencil, onPress: () => setEdit(c) }] : undefined}
        />
      ))}
      {list.length === 0 && <Empty icon={Building2} title="No clients match" />}
      <ClientForm key={edit === "new" ? "new" : edit?.id ?? "none"} client={edit} onClose={() => setEdit(null)} />
    </Screen>
  );
}

export function ClientDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db } = useDB();
  const { can, canAny } = useAuth();
  const [tab, setTab] = useState<"overview" | "contracts" | "invoices" | "documents">("overview");
  const [edit, setEdit] = useState<Client | null>(null);
  const c = db.clients.find((x) => x.id === id);
  if (!c) return <Screen title="Client"><Empty title="Client not found" /></Screen>;
  const ks = db.contracts.filter((k) => k.client_id === c.id);
  const inv = db.invoices.filter((i) => i.client_id === c.id);

  return (
    <Screen
      eyebrow={c.code}
      title={c.name}
      actions={can("clients.edit") ? <IconBtn icon={Pencil} label="Edit" onPress={() => setEdit(c)} /> : undefined}
      sticky={<Tabs value={tab} onChange={setTab} items={[{ key: "overview", label: "Overview" }, { key: "contracts", label: "Contracts", count: ks.length }, ...(canAny(["invoices.view", "invoices.edit"]) ? [{ key: "invoices" as const, label: "Invoices", count: inv.length }] : []), { key: "documents", label: "Documents" }]} />}
    >
      {tab === "overview" && (
        <>
          <Card><Fields items={[
            { label: "Status", value: <Badge label={c.status} small /> }, { label: "Industry", value: c.industry },
            { label: "Branch", value: db.branches.find((b) => b.id === c.branch_id)?.name ?? "—" }, { label: "Invoice group", value: c.invoice_group === "FIXED" ? "Fixed" : "Variable" },
            { label: "Billing email", value: c.billing_email, full: true }, { label: "Phone", value: c.phone, mono: true }, { label: "Signatory", value: c.signatory },
          ]} /></Card>
          <Section title="Tax profile">
            <Card>
              <Fields items={[{ label: "NTN", value: c.ntn, mono: true }, { label: "STRN", value: c.strn, mono: true }, { label: "Filer status", value: c.filer === "filer" ? "Filer" : "Non-filer" }]} />
              <View style={{ marginTop: 12, gap: 6 }}>
                {c.tax_lines.map((tl) => <HStack key={tl.name}><T v="small" soft style={{ flex: 1 }}>{tl.name}</T><Badge label={tl.direction === "ADDED" ? "Added" : "Withheld"} small tone={tl.direction === "ADDED" ? "info" : "warning"} /><T v="mono">{tl.rate}%</T></HStack>)}
              </View>
            </Card>
          </Section>
          <Section title="Billing address"><Card><T v="body">{c.address}</T></Card></Section>
          <Section title="Bank details"><Card><Fields items={[{ label: "Account title", value: c.bank.title, full: true }, { label: "Account / IBAN", value: c.bank.account, mono: true, full: true }, { label: "Bank", value: c.bank.bank }]} /></Card></Section>
          {c.notes ? <Section title="Notes"><Card><T v="body" soft>{c.notes}</T></Card></Section> : null}
        </>
      )}
      {tab === "contracts" && ks.map((k) => (
        <RecordCard key={k.id} title={k.code} subtitle={k.type === "services" ? "Services" : "Guard deployment"} badge={<Badge label={k.status} tone={toneOf(k.status)} />} onPress={() => router.push(`/contracts/${k.id}`)}
          fields={[{ label: "Period", value: `${fmtShort(k.start)} – ${fmtShort(k.end)}`, full: true }, { label: "Guards", value: String(k.lines.reduce((a, l) => a + l.committed, 0)) }, { label: "Rate / month", value: pkr(contractValue(k), { compact: true }), mono: true }]} />
      ))}
      {tab === "invoices" && (
        <ListCard>
          {inv.map((i, n) => <Row key={i.id} last={n === inv.length - 1} title={i.number} subtitle={fmtMonth(i.month)} right={<View style={{ alignItems: "flex-end", gap: 3 }}><T v="mono">{pkr(i.amount, { compact: true })}</T><T v="mono" muted style={{ fontSize: 11 }}>recv {pkr(invoiceReceived(i), { compact: true })}</T></View>} onPress={() => router.push(`/invoices/${i.id}`)} />)}
        </ListCard>
      )}
      {tab === "documents" && (
        <ListCard>
          {ks.map((k, i) => <Row key={k.id} last={i === ks.length - 1} left={<FileText size={16} />} title={`${k.code}.pdf`} subtitle={k.document ? "Signed contract" : "Not uploaded"} />)}
        </ListCard>
      )}
      <ClientForm key={edit?.id ?? "none"} client={edit} onClose={() => setEdit(null)} />
    </Screen>
  );
}

function ClientForm({ client, onClose }: { client: Client | "new" | null; onClose: () => void }) {
  const { db, commit } = useDB();
  const { toast } = useOverlay();
  const isNew = client === "new";
  const blank: Client = { id: "", name: "", code: "", industry: "", branch_id: db.branches[0]!.id, status: "active", invoice_group: "FIXED", ntn: "", strn: "", filer: "filer", billing_email: "", phone: "", signatory: "", address: "", bank: { title: "", account: "", bank: "" }, tax_lines: [], notes: "" };
  const [f, setF] = useState<Client>(() => (client && client !== "new" ? JSON.parse(JSON.stringify(client)) : blank));
  return (
    <Sheet open={!!client} onClose={onClose} title={isNew ? "Add client" : "Edit client"} full
      footer={<><Button label="Cancel" variant="secondary" full onPress={onClose} /><Button label="Save" full disabled={!f.name || !f.code} onPress={() => {
        commit((d) => { if (isNew) d.clients.push({ ...f, id: `c${d.clients.length + 1}` }); else Object.assign(d.clients.find((x) => x.id === f.id)!, f); });
        toast(isNew ? "Client added" : "Client saved"); onClose();
      }} /></>}>
      <T v="eyebrow" muted style={{ marginBottom: 10 }}>Identity</T>
      <Input label="Name" required value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
      <HStack gap={10}>
        <Input style={{ flex: 1 }} label="Code" required value={f.code} autoCapitalize="characters" onChangeText={(v) => setF({ ...f, code: v })} />
        <Input style={{ flex: 1 }} label="Industry" value={f.industry} onChangeText={(v) => setF({ ...f, industry: v })} />
      </HStack>
      <Select label="Branch" value={f.branch_id} onChange={(v) => setF({ ...f, branch_id: v })} options={db.branches.map((b) => ({ value: b.id, label: b.name }))} />
      <Select label="Status" value={f.status} onChange={(v) => setF({ ...f, status: v as Client["status"] })} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
      <Select label="Invoice group" value={f.invoice_group} onChange={(v) => setF({ ...f, invoice_group: v as Client["invoice_group"] })} options={[{ value: "FIXED", label: "Fixed" }, { value: "VARIABLE", label: "Variable" }]} />
      <T v="eyebrow" muted style={{ marginVertical: 10 }}>Contacts</T>
      <Input label="Billing email" value={f.billing_email} keyboardType="email-address" autoCapitalize="none" onChangeText={(v) => setF({ ...f, billing_email: v })} />
      <Input label="Phone" value={f.phone} keyboardType="phone-pad" onChangeText={(v) => setF({ ...f, phone: v })} />
      <Input label="Signatory" value={f.signatory} onChangeText={(v) => setF({ ...f, signatory: v })} />
      <T v="eyebrow" muted style={{ marginVertical: 10 }}>Tax</T>
      <HStack gap={10}>
        <Input style={{ flex: 1 }} label="NTN" value={f.ntn} onChangeText={(v) => setF({ ...f, ntn: v })} />
        <Input style={{ flex: 1 }} label="STRN" value={f.strn} onChangeText={(v) => setF({ ...f, strn: v })} />
      </HStack>
      <Select label="Filer status" value={f.filer} onChange={(v) => setF({ ...f, filer: v as Client["filer"] })} options={[{ value: "filer", label: "Filer" }, { value: "non_filer", label: "Non-filer" }]} />
      <Input label="Billing address" multiline value={f.address} onChangeText={(v) => setF({ ...f, address: v })} />
      <T v="eyebrow" muted style={{ marginVertical: 10 }}>Bank</T>
      <Input label="Account title" value={f.bank.title} onChangeText={(v) => setF({ ...f, bank: { ...f.bank, title: v } })} />
      <Input label="Account / IBAN" value={f.bank.account} autoCapitalize="characters" onChangeText={(v) => setF({ ...f, bank: { ...f.bank, account: v } })} />
      <Input label="Bank" value={f.bank.bank} onChangeText={(v) => setF({ ...f, bank: { ...f.bank, bank: v } })} />
      <Input label="Notes" multiline value={f.notes} onChangeText={(v) => setF({ ...f, notes: v })} />
    </Sheet>
  );
}
