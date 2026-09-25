import { useRouter } from "expo-router";
import { ChevronDown, ChevronRight, Download, SlidersHorizontal, UserPlus } from "lucide-react-native";
import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { Screen } from "../../components/Screen";
import { Select, Sheet, useOverlay } from "../../components/Sheet";
import { T } from "../../components/Text";
import { Badge, Button, Card, Checkbox, HStack, IconBtn, Input, SearchBar, StatGrid, Toggle, tap } from "../../components/ui";
import { Employee } from "../../data/seed";
import { siteName, useDB } from "../../data/store";
import { useAuth } from "../../lib/auth";
import { pkr } from "../../lib/format";
import { inRegion, useRegion } from "../../lib/region";
import { useTheme } from "../../theme/ThemeProvider";
import { radius } from "../../theme/tokens";
import { SHIFT_LABEL } from "../attendance/Attendance";
import { EmpAction, EmployeeActionSheets } from "../employees/actions";

type Group = { key: string; name: string; hint: string; contracted: number | null; staff: Employee[]; sites: { id: string | null; name: string }[] };

export default function Assignments() {
  const t = useTheme();
  const router = useRouter();
  const { db, commit } = useDB();
  const { canAny } = useAuth();
  const { regionId } = useRegion();
  const { toast } = useOverlay();
  const [q, setQ] = useState("");
  const [showFired, setShowFired] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [rules, setRules] = useState<string | null>(null);
  const [row, setRow] = useState<Employee | null>(null);
  const [assignTo, setAssignTo] = useState<Group | null>(null);
  const [action, setAction] = useState<{ e: Employee; a: EmpAction } | null>(null);
  const accounts = canAny(["assignments.accounts", "employees.edit"]);
  const hr = canAny(["assignments.hr", "employees.edit"]);

  const visible = (e: Employee) => inRegion(regionId, e.branch_id) && (e.lifecycle === "active" || (showFired && accounts && e.lifecycle === "terminated"));
  const groups: Group[] = [
    ...db.clients.filter((c) => c.status === "active" && inRegion(regionId, c.branch_id)).map((c) => {
      const k = db.contracts.find((x) => x.client_id === c.id);
      return {
        key: c.id, name: c.name, hint: k?.code ?? "No contract", contracted: k ? k.lines.reduce((a, l) => a + l.committed, 0) : 0,
        staff: db.employees.filter((e) => e.client_id === c.id && visible(e)),
        sites: db.sites.filter((s) => s.client_id === c.id).map((s) => ({ id: s.id, name: s.name })),
      };
    }),
    { key: "office", name: "Office staff", hint: "Salaried, not billed", contracted: null, staff: db.employees.filter((e) => e.category === "office_staff" && visible(e)), sites: [{ id: null, name: "Office" }] },
    { key: "relievers", name: "Relievers", hint: "Paid per day covered", contracted: null, staff: db.employees.filter((e) => e.category === "reliever" && visible(e)), sites: [{ id: null, name: "Pool" }] },
  ].filter((g) => !q || g.name.toLowerCase().includes(q.toLowerCase()));

  const contracted = groups.reduce((a, g) => a + (g.contracted ?? 0), 0);
  const enrolled = groups.filter((g) => g.contracted !== null).reduce((a, g) => a + g.staff.filter((e) => e.lifecycle === "active").length, 0);
  const mismatched = groups.filter((g) => g.contracted !== null && g.contracted !== g.staff.filter((e) => e.lifecycle === "active").length).length;
  const selected = Object.keys(sel).filter((k) => sel[k]);

  return (
    <Screen
      region
      eyebrow="Workforce"
      title="Assignments & Pay"
      actions={<IconBtn icon={Download} label="Export" onPress={() => toast("Assignments exported", "info")} />}
      sticky={<SearchBar value={q} onChange={setQ} placeholder="Search clients" />}
      footer={selected.length && accounts ? <Button label={`Edit rules — ${selected.length} selected`} icon={SlidersHorizontal} full onPress={() => setRules("selection")} /> : undefined}
    >
      <StatGrid items={[
        { label: "Contracted", value: String(contracted), tone: "brand", hint: "billed headcount" },
        { label: "Enrolled", value: String(enrolled), tone: enrolled < contracted ? "warning" : "success", hint: "active on client lines" },
        { label: "Sites", value: String(db.sites.length), tone: "neutral" },
        { label: "Clients mismatched", value: String(mismatched), tone: mismatched ? "danger" : "success" },
      ]} />
      <HStack style={{ marginTop: 10, justifyContent: "space-between" }}>
        {accounts ? <View style={{ flex: 1 }}><Toggle label="Show fired" value={showFired} onChange={setShowFired} /></View> : <View style={{ flex: 1 }} />}
        <Button size="sm" variant="ghost" label={Object.values(open).some(Boolean) ? "Collapse all" : "Expand all"} onPress={() => {
          const any = Object.values(open).some(Boolean);
          setOpen(any ? {} : Object.fromEntries(groups.map((g) => [g.key, true])));
        }} />
      </HStack>

      {groups.map((g) => {
        const isOpen = !!open[g.key];
        const active = g.staff.filter((e) => e.lifecycle === "active").length;
        const gap = g.contracted === null ? 0 : active - g.contracted;
        return (
          <Card key={g.key} pad={0} style={{ marginTop: 10 }}>
            <Pressable onPress={() => { tap(); setOpen({ ...open, [g.key]: !isOpen }); }} style={{ padding: 14, gap: 10 }}>
              <HStack>
                {isOpen ? <ChevronDown size={18} color={t.mutedFg} /> : <ChevronRight size={18} color={t.mutedFg} />}
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong">{g.name}</T>
                  <T v="small" muted>{g.hint}</T>
                </View>
                {hr && g.contracted !== null && <IconBtn icon={UserPlus} size={36} label="Assign employees" onPress={() => setAssignTo(g)} />}
                {accounts && <IconBtn icon={SlidersHorizontal} size={36} label="Edit rules" onPress={() => setRules(g.key)} />}
              </HStack>
              <HStack gap={6} wrap>
                {g.contracted !== null && <Badge small label={`Contracted ${g.contracted}`} tone="neutral" />}
                <Badge small label={`Enrolled ${active}`} tone="info" />
                {g.contracted !== null && gap !== 0 && <Badge small label={`Gap ${gap > 0 ? "+" : ""}${gap}`} tone={gap < 0 ? "danger" : "warning"} />}
              </HStack>
            </Pressable>
            {isOpen && g.sites.map((s) => {
              const people = g.staff.filter((e) => g.contracted === null || e.site_id === s.id);
              if (!people.length) return null;
              return (
                <View key={s.id ?? g.key} style={{ borderTopWidth: 1, borderTopColor: t.border }}>
                  <View style={{ paddingHorizontal: 14, paddingVertical: 8, backgroundColor: t.muted }}>
                    <T v="eyebrow" soft>{s.name} · {people.length}</T>
                  </View>
                  {people.map((e) => (
                    <Pressable key={e.id} onPress={() => { tap(); setRow(e); }} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: 1, borderTopColor: t.border, backgroundColor: pressed ? t.muted : e.lifecycle === "terminated" ? t.tone("danger").tint : "transparent" })}>
                      {accounts && <Checkbox value={!!sel[e.id]} onChange={(v) => setSel({ ...sel, [e.id]: v })} />}
                      <View style={{ flex: 1 }}>
                        <T v="smallStrong" style={{ fontSize: 14 }}>{e.name}</T>
                        <T v="mono" muted style={{ fontSize: 11 }}>{e.code} · {e.department} · {SHIFT_LABEL[e.shift]}</T>
                      </View>
                      {accounts && (
                        <View style={{ alignItems: "flex-end" }}>
                          <T v="mono" style={{ fontSize: 13 }}>{pkr(e.base, { compact: true })}</T>
                          <T v="mono" muted style={{ fontSize: 11 }}>{e.pay_mode === "variable" ? `${pkr(e.per_day)}/day` : `+${pkr(e.allowance, { compact: true })}`}</T>
                        </View>
                      )}
                    </Pressable>
                  ))}
                </View>
              );
            })}
          </Card>
        );
      })}

      {/* RowEditModal */}
      <Sheet open={!!row} onClose={() => setRow(null)} title={row?.name ?? ""} subtitle={row ? `${row.code} · ${siteName(db, row.site_id)}` : undefined}
        footer={<Button label="Open full profile" variant="secondary" full onPress={() => { const id = row!.id; setRow(null); router.push(`/employees/${id}`); }} />}>
        {row && (
          <>
            <T v="eyebrow" muted style={{ marginBottom: 8 }}>Posting</T>
            {hr ? (
              <View style={{ gap: 2, marginBottom: 14 }}>
                {([["client", "Change client"], ["category", "Change category"], ["shift", "Change shift"], ["transfer", "Transfer"], ["warnings", "Disciplinary warnings"], ["fire", "Fire / Resign"]] as [EmpAction, string][]).map(([a, label]) => (
                  <Pressable key={a} onPress={() => { const e = row; setRow(null); setTimeout(() => setAction({ e, a }), 300); }} style={{ paddingVertical: 12, borderRadius: radius.md }}>
                    <T v="bodyStrong" color={a === "fire" ? t.tone("danger").text : t.fg}>{label}</T>
                  </Pressable>
                ))}
              </View>
            ) : <T v="small" muted style={{ marginBottom: 14 }}>Posting changes need HR permission.</T>}
            {accounts && (
              <>
                <T v="eyebrow" muted style={{ marginBottom: 8 }}>Pay</T>
                <PayEditor e={row} onSaved={() => { setRow(null); toast("Pay updated"); }} />
              </>
            )}
          </>
        )}
      </Sheet>

      <EditRulesSheet scope={rules} ids={rules === "selection" ? selected : groups.find((g) => g.key === rules)?.staff.map((e) => e.id) ?? []} title={rules === "selection" ? `${selected.length} selected` : groups.find((g) => g.key === rules)?.name ?? ""} onClose={(done) => { setRules(null); if (done) setSel({}); }} />

      <Sheet open={!!assignTo} onClose={() => setAssignTo(null)} title={`Assign employees to ${assignTo?.name ?? ""}`}>
        {assignTo && <AssignList group={assignTo} onAssign={(e, siteId) => { commit((d) => { const x = d.employees.find((y) => y.id === e.id)!; x.client_id = assignTo.key; x.site_id = siteId; x.category = "client"; x.lifecycle = "active"; x.status = "Active"; }); toast(`${e.name} posted`); }} />}
      </Sheet>
      <EmployeeActionSheets e={action?.e ?? null} action={action?.a ?? null} onClose={() => setAction(null)} />
    </Screen>
  );
}

function PayEditor({ e, onSaved }: { e: Employee; onSaved: () => void }) {
  const { commit } = useDB();
  const [base, setBase] = useState(String(e.base));
  const [allow, setAllow] = useState(String(e.allowance));
  return (
    <>
      <HStack gap={10}>
        <Input style={{ flex: 1 }} label="Base" amount value={base} onChangeText={setBase} />
        <Input style={{ flex: 1 }} label="Allowance" amount value={allow} onChangeText={setAllow} />
      </HStack>
      <Button label="Save pay" onPress={() => { commit((d) => { const x = d.employees.find((y) => y.id === e.id)!; x.base = Number(base) || 0; x.allowance = Number(allow) || 0; x.per_day = Math.round(x.base / 30); }); onSaved(); }} />
    </>
  );
}

function EditRulesSheet({ scope, ids, title, onClose }: { scope: string | null; ids: string[]; title: string; onClose: (done?: boolean) => void }) {
  const { db, commit } = useDB();
  const { toast } = useOverlay();
  const [mode, setMode] = useState<"fixed" | "variable">("fixed");
  const [base, setBase] = useState("");
  const [allow, setAllow] = useState("");
  const [inc, setInc] = useState("");
  const people = db.employees.filter((e) => ids.includes(e.id));
  return (
    <Sheet open={!!scope} onClose={() => onClose()} title={`Edit rules — ${title}`} full
      footer={<><Button label="Cancel" variant="secondary" full onPress={() => onClose()} /><Button label={`Apply to ${people.length}`} full onPress={() => {
        commit((d) => { for (const e of d.employees.filter((x) => ids.includes(x.id))) { e.pay_mode = mode; if (base) e.base = Number(base); if (allow) e.allowance = Number(allow); if (inc) e.base = Math.round(e.base * (1 + Number(inc) / 100)); e.per_day = Math.round(e.base / 30); } });
        toast(`Rules applied to ${people.length}`); onClose(true);
      }} /></>}>
      <Select label="Pay mode" value={mode} onChange={(v) => setMode(v as "fixed")} options={[{ value: "fixed", label: "Fixed monthly" }, { value: "variable", label: "Variable (per day)" }]} />
      <HStack gap={10}>
        <Input style={{ flex: 1 }} label="Base (blank = keep)" amount value={base} onChangeText={setBase} />
        <Input style={{ flex: 1 }} label="Allowance" amount value={allow} onChangeText={setAllow} />
      </HStack>
      <Input label="Annual increment %" keyboardType="numeric" value={inc} onChangeText={setInc} />
      <T v="eyebrow" muted style={{ marginVertical: 10 }}>Affected employees · {people.length}</T>
      {people.map((e) => (
        <HStack key={e.id} style={{ paddingVertical: 8 }}>
          <T v="small" style={{ flex: 1, fontSize: 14 }}>{e.name}</T>
          <T v="mono" muted>{pkr(e.base, { compact: true })} + {pkr(e.allowance, { compact: true })}</T>
        </HStack>
      ))}
    </Sheet>
  );
}

function AssignList({ group, onAssign }: { group: Group; onAssign: (e: Employee, siteId: string | null) => void }) {
  const { db } = useDB();
  const [q, setQ] = useState("");
  const [site, setSite] = useState(group.sites[0]?.id ?? "");
  const pool = db.employees.filter((e) => (e.lifecycle === "waiting_fresh" || e.lifecycle === "waiting_rehire" || e.category === "reliever" || (!e.client_id && e.category === "client")) && (!q || e.name.toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <Select label="Site" value={site} onChange={setSite} options={group.sites.map((s) => ({ value: s.id ?? "", label: s.name }))} />
      <SearchBar value={q} onChange={setQ} placeholder="Search candidates" />
      <View style={{ marginTop: 10 }}>
        {pool.map((e) => (
          <HStack key={e.id} style={{ paddingVertical: 10 }}>
            <View style={{ flex: 1 }}>
              <T v="smallStrong" style={{ fontSize: 14 }}>{e.name}</T>
              <T v="mono" muted style={{ fontSize: 11 }}>{e.code} · {e.lifecycle.replace("_", " ")}</T>
            </View>
            <Button size="sm" label="Assign" onPress={() => onAssign(e, site || null)} />
          </HStack>
        ))}
        {pool.length === 0 && <T v="small" muted>No unposted candidates.</T>}
      </View>
    </>
  );
}
