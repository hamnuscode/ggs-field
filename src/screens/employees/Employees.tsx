import { useRouter } from "expo-router";
import { Download, FileStack, SlidersHorizontal, UserPlus, Users } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { Screen } from "../../components/Screen";
import { Select, Sheet, useOverlay } from "../../components/Sheet";
import { T } from "../../components/Text";
import { Badge, Banner, Button, Chips, Empty, HStack, IconBtn, Input, RecordCard, SearchBar, StatGrid, Tabs, toneOf } from "../../components/ui";
import { Employee, TODAY } from "../../data/seed";
import { clientName, useDB } from "../../data/store";
import { useAuth } from "../../lib/auth";
import { inRegion, useRegion } from "../../lib/region";

const CAT_LABEL = { client: "Client post", office_staff: "Office staff", reliever: "Reliever" } as const;
type Filters = { client: string; category: string; shift: string; completeness: string; cnic: string; branch: string };
const EMPTY: Filters = { client: "", category: "", shift: "", completeness: "", cnic: "", branch: "" };

export const cnicExpired = (e: Employee) => !!e.cnic_expiry && e.cnic_expiry < TODAY;

export default function Employees() {
  const router = useRouter();
  const { db, commit } = useDB();
  const { can } = useAuth();
  const { regionId } = useRegion();
  const { toast } = useOverlay();
  const [tab, setTab] = useState<"active" | "waiting" | "terminated">("active");
  const [waitSub, setWaitSub] = useState<"rehire" | "fresh">("rehire");
  const [q, setQ] = useState("");
  const [f, setF] = useState<Filters>(EMPTY);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [gapsOnly, setGapsOnly] = useState(false);
  const [rehire, setRehire] = useState<Employee | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const canEdit = can("employees.edit");

  const inReg = db.employees.filter((e) => inRegion(regionId, e.branch_id));
  const active = inReg.filter((e) => e.lifecycle === "active");
  const gaps = inReg.filter((e) => !e.cnic_expiry || !e.join_date);
  const nFilters = Object.values(f).filter(Boolean).length;

  const list = useMemo(() => inReg.filter((e) => {
    if (gapsOnly) return !e.cnic_expiry || !e.join_date;
    if (tab === "active" && e.lifecycle !== "active") return false;
    if (tab === "terminated" && e.lifecycle !== "terminated") return false;
    if (tab === "waiting" && e.lifecycle !== (waitSub === "rehire" ? "waiting_rehire" : "waiting_fresh")) return false;
    if (q && !(e.name + e.code + e.phone + e.cnic).toLowerCase().includes(q.toLowerCase())) return false;
    if (f.client && e.client_id !== f.client) return false;
    if (f.category && e.category !== f.category) return false;
    if (f.shift && e.shift !== f.shift) return false;
    if (f.branch && e.branch_id !== f.branch) return false;
    if (f.completeness === "incomplete" && !e.incomplete.length) return false;
    if (f.completeness === "complete" && e.incomplete.length) return false;
    if (f.cnic === "expired" && !cnicExpired(e)) return false;
    if (f.cnic === "missing" && e.cnic_expiry) return false;
    return true;
  }), [inReg, tab, waitSub, q, f, gapsOnly]);

  const capUsed = active.length;

  return (
    <Screen
      region
      eyebrow="Workforce"
      title="Employees"
      actions={
        <>
          <IconBtn icon={Download} label="Export" onPress={() => toast(`${list.length} employees exported to Excel`, "info")} />
          {canEdit && <IconBtn icon={FileStack} label="Generate documents" onPress={() => setGenOpen(true)} />}
          {canEdit && <IconBtn icon={UserPlus} label="Add employee" filled onPress={() => router.push("/employees/form")} />}
        </>
      }
      sticky={
        <>
          <HStack>
            <View style={{ flex: 1 }}><SearchBar value={q} onChange={setQ} placeholder="Name, code, phone, CNIC" /></View>
            <Button label={nFilters ? `Filters ${nFilters}` : "Filters"} icon={SlidersHorizontal} variant={nFilters ? "primary" : "secondary"} onPress={() => setFiltersOpen(true)} />
          </HStack>
          <Tabs
            value={tab}
            onChange={(k) => { setTab(k); setGapsOnly(false); }}
            items={[
              { key: "active", label: "Active", count: active.length },
              { key: "waiting", label: "Waiting list", count: inReg.filter((e) => e.lifecycle.startsWith("waiting")).length },
              { key: "terminated", label: "Terminated", count: inReg.filter((e) => e.lifecycle === "terminated").length },
            ]}
          />
        </>
      }
    >
      {capUsed / 250 > 0.8 && <Banner tone="warning" title={`${capUsed} of 250 guards on your plan`} sub="Adding more will need a plan upgrade." />}
      <StatGrid items={[
        { label: "Registered", value: String(inReg.length), tone: "brand" },
        { label: "Active", value: String(active.length), tone: "success" },
        { label: "Inactive", value: String(inReg.filter((e) => e.status === "Inactive" || e.status === "On Leave").length), tone: "neutral" },
        { label: "No CNIC / join date", value: String(gaps.length), tone: "danger", active: gapsOnly, onPress: () => setGapsOnly((x) => !x), hint: gapsOnly ? "Filtering — tap to clear" : "Tap to filter" },
      ]} />

      {tab === "waiting" && !gapsOnly && (
        <View style={{ marginTop: 14 }}>
          <Chips value={waitSub} onChange={setWaitSub} items={[{ key: "rehire", label: "Rehire" }, { key: "fresh", label: "Fresh" }]} />
        </View>
      )}

      <T v="eyebrow" muted style={{ marginTop: 18, marginBottom: 10 }}>{list.length} {list.length === 1 ? "person" : "people"}</T>
      {list.map((e) => (
        <RecordCard
          key={e.id}
          onPress={() => router.push(`/employees/${e.id}`)}
          accent={e.lifecycle === "terminated" ? "danger" : undefined}
          title={e.name}
          subtitle={`${e.code} · ${e.permanent_code}`}
          badge={<Badge label={e.status} tone={e.status === "On Leave" ? "warning" : toneOf(e.status)} dot />}
          fields={[
            { label: "Phone", value: e.phone, mono: true },
            { label: "Client · category", value: `${clientName(db, e.client_id)} · ${e.department}` },
          ]}
          tags={
            e.incomplete.length || cnicExpired(e) || !e.physical_copy ? (
              <HStack wrap gap={6}>
                {e.incomplete.length > 0 && <Badge small label={`Incomplete · ${e.incomplete.length}`} tone="warning" />}
                {cnicExpired(e) && <Badge small label="CNIC expired" tone="danger" />}
                {!e.physical_copy && <Badge small label="No physical copy" tone="neutral" />}
              </HStack>
            ) : undefined
          }
          actions={
            canEdit
              ? e.lifecycle === "waiting_rehire" || e.lifecycle === "terminated"
                ? [{ label: "Rehire", onPress: () => setRehire(e), tone: "brand" }]
                : e.lifecycle === "waiting_fresh"
                  ? [{ label: "Hire", onPress: () => router.push(`/employees/form?id=${e.id}&hire=1`), tone: "brand" }]
                  : [{ label: "Edit", onPress: () => router.push(`/employees/form?id=${e.id}`) }]
              : undefined
          }
        />
      ))}
      {list.length === 0 && <Empty icon={Users} title="No employees match" sub="Try clearing a filter." />}

      {/* Filters: the web's second toolbar row, as a sheet */}
      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters"
        footer={<><Button label="Clear all" variant="secondary" full onPress={() => setF(EMPTY)} /><Button label={`Show ${list.length}`} full onPress={() => setFiltersOpen(false)} /></>}>
        <Select label="Client" clearable value={f.client} onChange={(v) => setF({ ...f, client: v })} placeholder="Any client" options={db.clients.map((c) => ({ value: c.id, label: c.name }))} />
        <Select label="Category" clearable value={f.category} onChange={(v) => setF({ ...f, category: v })} placeholder="Any" options={Object.entries(CAT_LABEL).map(([value, label]) => ({ value, label }))} />
        <Select label="Shift" clearable value={f.shift} onChange={(v) => setF({ ...f, shift: v })} placeholder="Any" options={[{ value: "day", label: "Day" }, { value: "night", label: "Night" }, { value: "evening", label: "Evening" }]} />
        <Select label="Completeness" clearable value={f.completeness} onChange={(v) => setF({ ...f, completeness: v })} placeholder="Any" options={[{ value: "complete", label: "Complete" }, { value: "incomplete", label: "Incomplete" }]} />
        <Select label="CNIC expiry" clearable value={f.cnic} onChange={(v) => setF({ ...f, cnic: v })} placeholder="Any" options={[{ value: "expired", label: "Expired" }, { value: "missing", label: "Missing" }]} />
        <Select label="Region" clearable value={f.branch} onChange={(v) => setF({ ...f, branch: v })} placeholder="Any" options={db.branches.map((b) => ({ value: b.id, label: b.name }))} />
      </Sheet>

      <RehireSheet e={rehire} onClose={() => setRehire(null)} onDone={(e, client, salary) => {
        commit((d) => { const x = d.employees.find((y) => y.id === e.id)!; x.lifecycle = "active"; x.status = "Active"; x.client_id = client; x.base = salary; x.left_on = null; x.join_date = TODAY; });
        toast(`${e.name} rehired`);
        setRehire(null);
      }} />

      <Sheet open={genOpen} onClose={() => setGenOpen(false)} title={`Generate documents — ${list.length} guard(s)`}
        footer={<><Button label="Data forms" variant="secondary" full onPress={() => { setGenOpen(false); toast(`${list.length} data forms generated`, "info"); }} /><Button label="ID cards" full onPress={() => { setGenOpen(false); toast(`${list.length} ID cards generated`, "info"); }} /></>}>
        <T v="body" soft>Generates one PDF per guard in the current list. Guards with an incomplete record are skipped and listed afterwards.</T>
        <T v="small" muted style={{ marginTop: 10 }}>{list.filter((e) => e.incomplete.length).length} will be skipped.</T>
      </Sheet>
    </Screen>
  );
}

function RehireSheet({ e, onClose, onDone }: { e: Employee | null; onClose: () => void; onDone: (e: Employee, client: string, salary: number) => void }) {
  const { db } = useDB();
  const [client, setClient] = useState("");
  const [salary, setSalary] = useState("");
  return (
    <Sheet open={!!e} onClose={onClose} title={`Rehire — ${e?.name ?? ""}`} subtitle={e?.left_on ? `Left on ${e.left_on}` : undefined}
      footer={<><Button label="Cancel" variant="secondary" full onPress={onClose} /><Button label="Rehire" full disabled={!client || !salary} onPress={() => e && onDone(e, client, Number(salary))} /></>}>
      <Select label="Client" required value={client} onChange={setClient} options={db.clients.filter((c) => c.status === "active").map((c) => ({ value: c.id, label: c.name }))} />
      <Input label="Base salary" required amount value={salary} onChangeText={setSalary} placeholder={e ? String(e.base) : ""} />
    </Sheet>
  );
}
