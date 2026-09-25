import { useLocalSearchParams, useRouter } from "expo-router";
import { Check, ChevronDown, ChevronUp, Eye, KeyRound, Pencil, Plus, Trash2, UserPlus } from "lucide-react-native";
import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { Progress } from "../../components/Charts";
import { Screen } from "../../components/Screen";
import { Select, Sheet, useOverlay } from "../../components/Sheet";
import { T } from "../../components/Text";
import { Avatar, Badge, Banner, Button, Card, Checkbox, Empty, Fields, HStack, IconBtn, Input, Ledger, ListCard, RecordCard, Row, SearchBar, Section, Tabs, Toggle, tap } from "../../components/ui";
import { AppUser, TODAY } from "../../data/seed";
import { useDB } from "../../data/store";
import { useAuth } from "../../lib/auth";
import { fmtShort, fmtTime, pkr } from "../../lib/format";
import { PERMISSION_GROUPS, ROLE_LABEL, UserRole } from "../../lib/permissions";
import { isLive } from "../../lib/supabase";
import { useTheme, useThemeCtx } from "../../theme/ThemeProvider";
import { brandPalettes, radius } from "../../theme/tokens";

// ---------------------------------------------------------------- Access & Governance
export function AccessGovernance() {
  const { tab: initial } = useLocalSearchParams<{ tab?: "users" | "governance" }>();
  const [tab, setTab] = useState<"users" | "governance">(initial ?? "users");
  const [edit, setEdit] = useState<AppUser | "new" | null>(null);
  return (
    <Screen eyebrow="Admin" title="Access & Governance" actions={tab === "users" ? <IconBtn icon={UserPlus} label="Create user" filled onPress={() => setEdit("new")} /> : undefined}
      sticky={<Tabs value={tab} onChange={setTab} items={[{ key: "users", label: "Users & permissions" }, { key: "governance", label: "Governance" }]} />}>
      {tab === "users" ? <Users onEdit={setEdit} /> : <Governance />}
      <UserSheet key={edit === "new" ? "new" : edit?.id ?? "none"} user={edit} onClose={() => setEdit(null)} />
    </Screen>
  );
}

function Users({ onEdit }: { onEdit: (u: AppUser) => void }) {
  const { db, commit } = useDB();
  const { toast, confirm } = useOverlay();
  const [q, setQ] = useState("");
  const [reset, setReset] = useState<AppUser | null>(null);
  const list = db.users.filter((u) => !q || (u.name + u.email).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <SearchBar value={q} onChange={setQ} placeholder="Name or email" />
      <View style={{ height: 12 }} />
      {list.map((u) => (
        <RecordCard key={u.id} title={u.name} subtitle={u.email} leading={<Avatar name={u.name} />} badge={<Badge label={ROLE_LABEL[u.role]} tone={u.role === "super_admin" ? "brand" : "neutral"} small />}
          fields={[{ label: "Title", value: u.title }, { label: "Branch", value: db.branches.find((b) => b.id === u.branch_id)?.name ?? "All regions" }, { label: "Permissions", value: u.role === "super_admin" ? "Everything" : `${u.permissions.length} granted`, full: true }]}
          tags={!u.active ? <Badge label="Deactivated" tone="danger" small /> : undefined}
          actions={[
            { label: "Edit", icon: Pencil, onPress: () => onEdit(u) },
            { label: "Reset", icon: KeyRound, onPress: () => setReset(u) },
            { label: "Delete", icon: Trash2, tone: "danger", onPress: async () => { if (await confirm({ title: `Delete ${u.email}?`, message: "They lose access immediately.", confirmLabel: "Delete", tone: "danger" })) { commit((d) => { d.users = d.users.filter((x) => x.id !== u.id); }); toast("User deleted", "warning"); } } },
          ]} />
      ))}
      <Sheet open={!!reset} onClose={() => setReset(null)} title="Reset password" subtitle={reset?.email} footer={<Button label="Reset" full onPress={() => { setReset(null); toast("Password reset — they must change it at next login"); }} />}>
        <Input label="Temporary password" secureTextEntry />
      </Sheet>
    </>
  );
}

function UserSheet({ user, onClose }: { user: AppUser | "new" | null; onClose: () => void }) {
  const t = useTheme();
  const { db, commit } = useDB();
  const { profile } = useAuth();
  const { toast } = useOverlay();
  const isNew = user === "new";
  const blank: AppUser = { id: "", name: "", email: "", title: "", role: "hr", branch_id: null, permissions: [], employee_id: null, active: true };
  const [f, setF] = useState<AppUser>(() => (user && user !== "new" ? { ...user, permissions: [...user.permissions] } : blank));
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setF({ ...f, permissions: f.permissions.includes(k) ? f.permissions.filter((x) => x !== k) : [...f.permissions, k] });
  const roles = (Object.keys(ROLE_LABEL) as UserRole[]).filter((r) => r !== "super_super_admin" && (r !== "super_admin" || profile?.role === "super_super_admin"));
  return (
    <Sheet open={!!user} onClose={onClose} title={isNew ? "Create user" : `Edit ${f.email}`} full
      footer={<><Button label="Cancel" variant="secondary" full onPress={onClose} /><Button label="Save" full disabled={!f.name || !f.email} onPress={() => {
        commit((d) => { if (isNew) d.users.push({ ...f, id: `u${Date.now()}` }); else Object.assign(d.users.find((x) => x.id === f.id)!, f); });
        toast(isNew ? "User created" : "User saved"); onClose();
      }} /></>}>
      <Input label="Full name" required value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
      <Input label="Email" required value={f.email} autoCapitalize="none" keyboardType="email-address" onChangeText={(v) => setF({ ...f, email: v })} />
      <Input label="Title" value={f.title} onChangeText={(v) => setF({ ...f, title: v })} />
      <Select label="Role" value={f.role} onChange={(v) => setF({ ...f, role: v as UserRole })} options={roles.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />
      <Select label="Pin to region" clearable value={f.branch_id ?? ""} onChange={(v) => setF({ ...f, branch_id: v || null })} placeholder="All regions" options={db.branches.map((b) => ({ value: b.id, label: b.name }))} />
      <Select label="Link to employee" clearable searchable value={f.employee_id ?? ""} onChange={(v) => setF({ ...f, employee_id: v || null })} placeholder="Not linked" options={db.employees.filter((e) => e.category === "office_staff").map((e) => ({ value: e.id, label: e.name, sub: e.code }))} />
      <Toggle label="Active" value={f.active} onChange={(v) => setF({ ...f, active: v })} />
      <T v="eyebrow" muted style={{ marginTop: 14, marginBottom: 10 }}>Permissions · {f.role === "super_admin" ? "all (role)" : `${f.permissions.length} granted`}</T>
      {f.role === "super_admin" ? <Banner tone="info" title="Super Admins hold every permission" /> : PERMISSION_GROUPS.map((g) => {
        const n = g.items.filter((i) => f.permissions.includes(i.key)).length;
        const isOpen = !!open[g.label];
        return (
          <Card key={g.label} pad={0} style={{ marginBottom: 8 }}>
            <Pressable onPress={() => { tap(); setOpen({ ...open, [g.label]: !isOpen }); }} style={{ flexDirection: "row", alignItems: "center", padding: 14, gap: 8 }}>
              <T v="bodyStrong" style={{ flex: 1 }}>{g.label}</T>
              <Badge label={`${n}/${g.items.length}`} tone={n ? "brand" : "neutral"} small />
              {isOpen ? <ChevronUp size={16} color={t.mutedFg} /> : <ChevronDown size={16} color={t.mutedFg} />}
            </Pressable>
            {isOpen && <View style={{ paddingHorizontal: 14, paddingBottom: 8, borderTopWidth: 1, borderTopColor: t.border }}>
              {g.items.map((i) => <Checkbox key={i.key} value={f.permissions.includes(i.key)} onChange={() => toggle(i.key)} label={i.label} sub={i.key} />)}
            </View>}
          </Card>
        );
      })}
    </Sheet>
  );
}

function Governance() {
  const { db, commit } = useDB();
  const { toast } = useOverlay();
  const pending = db.governanceRequests.filter((r) => r.status === "pending");
  return (
    <>
      <Section title="Pending requests" count={pending.length} style={{ marginTop: 0 }}>
        {pending.map((r) => (
          <RecordCard key={r.id} title={r.what} subtitle={`${r.who} · ${fmtShort(r.at)}`} accent="warning"
            actions={[
              { label: "Approve", tone: "success", onPress: () => { commit((d) => { d.governanceRequests.find((x) => x.id === r.id)!.status = "approved"; }); toast("Approved"); } },
              { label: "Deny", tone: "danger", onPress: () => { commit((d) => { d.governanceRequests.find((x) => x.id === r.id)!.status = "denied"; }); toast("Denied", "warning"); } },
            ]} />
        ))}
        {pending.length === 0 && <T v="small" muted>Nothing waiting.</T>}
      </Section>
      <Section title="Decision log">
        <ListCard>{db.governanceRequests.filter((r) => r.status !== "pending").map((r, i, a) => <Row key={r.id} last={i === a.length - 1} title={r.what} meta={`${r.who} · ${fmtShort(r.at)}`} right={<Badge label={r.status} small />} />)}</ListCard>
      </Section>
      <Section title="Action thresholds">
        <Card>{db.thresholds.map((x) => <Ledger key={x.action} label={x.action} value={x.value} />)}</Card>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------- Audit log
export function AuditLog() {
  const t = useTheme();
  const { db } = useDB();
  const [table, setTable] = useState("");
  const [action, setAction] = useState("");
  const [user, setUser] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const list = db.auditLog.filter((a) => (!table || a.table === table) && (!action || a.action === action) && (!user || a.user === user) && (!q || (a.record + JSON.stringify(a.fields)).toLowerCase().includes(q.toLowerCase())));
  return (
    <Screen eyebrow="Admin" title="Audit Log" sticky={<SearchBar value={q} onChange={setQ} placeholder="Record ID or field" />}>
      <View style={{ gap: 8, marginBottom: 12 }}>
        <HStack>
          <View style={{ flex: 1 }}><Select compact clearable label="Table" value={table} onChange={setTable} placeholder="All" options={[...new Set(db.auditLog.map((a) => a.table))].map((x) => ({ value: x, label: x }))} /></View>
          <View style={{ flex: 1 }}><Select compact clearable label="Action" value={action} onChange={setAction} placeholder="All" options={["insert", "update", "delete"].map((x) => ({ value: x, label: x }))} /></View>
        </HStack>
        <Select compact clearable label="User" value={user} onChange={setUser} placeholder="Anyone" options={[...new Set(db.auditLog.map((a) => a.user))].map((x) => ({ value: x, label: x }))} />
      </View>
      {list.map((a) => (
        <Card key={a.id} style={{ marginBottom: 8 }} onPress={() => setOpen(open === a.id ? null : a.id)}>
          <HStack>
            <Badge label={a.action} tone={a.action === "delete" ? "danger" : a.action === "insert" ? "success" : "info"} small />
            <T v="mono" style={{ flex: 1 }} numberOfLines={1}>{a.table} · {a.record}</T>
          </HStack>
          <T v="small" muted style={{ marginTop: 6 }}>{a.user} · {fmtShort(a.at.slice(0, 10))} {fmtTime(a.at)} · {Object.keys(a.fields).join(", ")}</T>
          {open === a.id && (
            <View style={{ marginTop: 10, gap: 6 }}>
              {Object.entries(a.fields).map(([k, v]) => (
                <View key={k} style={{ backgroundColor: t.muted, borderRadius: radius.md, padding: 10 }}>
                  <T v="eyebrow" muted>{k}</T>
                  <T v="mono" color={t.tone("danger").text} style={{ marginTop: 4 }}>− {JSON.stringify(v.before ?? null)}</T>
                  <T v="mono" color={t.tone("success").text}>+ {JSON.stringify(v.after ?? null)}</T>
                </View>
              ))}
            </View>
          )}
        </Card>
      ))}
      {list.length === 0 && <Empty title="No entries match" />}
    </Screen>
  );
}

// ---------------------------------------------------------------- Settings
export function Settings() {
  const t = useTheme();
  const { brandKey, setBrandKey } = useThemeCtx();
  const { db, commit } = useDB();
  const { can, profile } = useAuth();
  const { toast, confirm } = useOverlay();
  const canEdit = can("settings.edit");
  const admin = profile?.role === "super_admin" || profile?.role === "super_super_admin";
  const [widgets, setWidgets] = useState<Record<string, boolean>>({ bank_overview: true, top_clients: true, activity: true, expenses_chart: true, attendance_trend: true, compliance: true, contracts_ending: true, incidents: true, period_close: true, attachments: true });
  const [notif, setNotif] = useState({ email: "alerts@ggs.pk", daily: true, compliance: true, payroll: false });
  const [newRegion, setNewRegion] = useState(false);
  const [rname, setRname] = useState("");
  return (
    <Screen eyebrow="Admin" title="Settings">
      <Section title="Company profile" style={{ marginTop: 0 }}>
        <Card>
          <HStack style={{ marginBottom: 14 }}>
            <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: t.brand[500], alignItems: "center", justifyContent: "center" }}><T v="h3" color={t.onBrand}>{db.company.short}</T></View>
            <Button size="sm" variant="secondary" label="Change logo" disabled={!canEdit} onPress={() => toast("Image picker opens on a device build", "info")} />
          </HStack>
          <Input label="Display company name" editable={canEdit} defaultValue={db.company.name} />
          <Input label="Your name" defaultValue={profile?.name} />
          <Input label="Your email" editable={false} defaultValue={profile?.email} />
        </Card>
      </Section>
      <Section title="Regional management" count={db.branches.length} action={canEdit ? <T v="smallStrong" color={t.tone("brand").text} onPress={() => setNewRegion(true)}>Add region</T> : undefined}>
        {db.branches.map((b) => (
          <Card key={b.id} style={{ marginBottom: 8 }}>
            <HStack><T v="bodyStrong" style={{ flex: 1 }}>{b.name}</T><Badge label={b.kind === "head_office" ? "Head office" : "Regional"} small tone="neutral" /></HStack>
            <Toggle label="Exclude from HO allocation" sub="Its revenue won't carry a share of head-office cost." value={b.ho_excluded} onChange={async (v) => {
              if (!canEdit) return;
              if (await confirm({ title: v ? `Exclude ${b.name}?` : `Re-include ${b.name}?`, message: "Changes how head-office cost is split in regional reports.", confirmLabel: "Confirm" })) { commit((d) => { d.branches.find((x) => x.id === b.id)!.ho_excluded = v; }); toast("Region updated"); }
            }} />
          </Card>
        ))}
      </Section>
      {admin && (
        <Section title="Appearance" hint="The company's brand colour, applied for everyone.">
          <View style={{ flexDirection: "row", gap: 10 }}>
            {(["amber", "green", "steel"] as const).map((k) => (
              <Pressable key={k} onPress={() => { tap(); setBrandKey(k); toast("Palette applied"); }} style={{ flex: 1, padding: 12, borderRadius: radius.lg, backgroundColor: t.card, borderWidth: 2, borderColor: brandKey === k ? brandPalettes[k]![500] : t.border, alignItems: "center", gap: 8 }}>
                <View style={{ flexDirection: "row", gap: 3 }}>{([500, 600, 700] as const).map((s) => <View key={s} style={{ width: 16, height: 28, borderRadius: 4, backgroundColor: brandPalettes[k]![s] }} />)}</View>
                <HStack gap={4}>{brandKey === k && <Check size={14} color={t.fg} />}<T v="smallStrong">{k === "amber" ? "Amber" : k === "green" ? "Emerald" : "Steel blue"}</T></HStack>
              </Pressable>
            ))}
          </View>
        </Section>
      )}
      <Section title="Dashboard widgets">
        <Card>{Object.entries(widgets).map(([k, v]) => <Checkbox key={k} value={v} onChange={(x) => setWidgets({ ...widgets, [k]: x })} label={k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())} />)}</Card>
      </Section>
      {admin && (
        <Section title="Notifications">
          <Card>
            <Input label="Alert email" value={notif.email} onChangeText={(v) => setNotif({ ...notif, email: v })} autoCapitalize="none" />
            <Toggle label="Daily report digest" value={notif.daily} onChange={(v) => setNotif({ ...notif, daily: v })} />
            <Toggle label="Compliance reminders" value={notif.compliance} onChange={(v) => setNotif({ ...notif, compliance: v })} />
            <Toggle label="Payroll run updates" value={notif.payroll} onChange={(v) => setNotif({ ...notif, payroll: v })} />
            <Button label="Send test" variant="secondary" style={{ marginTop: 8 }} onPress={() => toast(`Test sent to ${notif.email}`, "info")} />
          </Card>
        </Section>
      )}
      {canEdit && <Button label="Save settings" style={{ marginTop: 20 }} onPress={() => toast("Settings saved")} />}
      <Sheet open={newRegion} onClose={() => setNewRegion(false)} title="Add region" footer={<Button label="Add" full disabled={!rname} onPress={() => { commit((d) => { d.branches.push({ id: `b${Date.now()}`, name: rname, kind: "regional", code: rname.slice(0, 3).toUpperCase(), ho_excluded: false }); }); setNewRegion(false); setRname(""); toast("Region added"); }} />}>
        <Input label="Region name" required value={rname} onChangeText={setRname} />
      </Sheet>
    </Screen>
  );
}

// ---------------------------------------------------------------- Billing
export function Billing() {
  const { db } = useDB();
  const { toast } = useOverlay();
  const active = db.employees.filter((e) => e.lifecycle === "active").length;
  return (
    <Screen eyebrow="Admin" title="Plan & Billing">
      <Card>
        <HStack><T v="h3" style={{ flex: 1 }}>{db.company.plan} plan</T><Badge label="Active" tone="success" dot /></HStack>
        <View style={{ marginTop: 12 }}>
          <Ledger label="Monthly" value={pkr(45000)} />
          <Ledger label="Guards covered" value={`${active} / ${db.company.guard_cap}`} />
          <Ledger label="Renews" value={fmtShort(db.companies[0]!.paid_until)} />
        </View>
        <View style={{ marginTop: 10 }}><Progress value={active} max={db.company.guard_cap} tone={active / db.company.guard_cap > 0.8 ? "warning" : "brand"} /></View>
        {/* In-app purchase buttons are hidden on native, as on web (canSellInApp). */}
        <T v="small" muted style={{ marginTop: 12 }}>Plan changes are made on the web app.</T>
      </Card>
      <Section title="AI credit">
        <Card>
          <Fields items={[{ label: "Available now", value: "1,840", mono: true }, { label: "Monthly allowance", value: "2,000", mono: true }, { label: "Top-up balance", value: "0", mono: true }]} />
          <Button label="How credit is used" variant="ghost" style={{ marginTop: 8 }} onPress={() => toast("Each AI assistant answer uses 1–5 credits", "info")} />
        </Card>
      </Section>
    </Screen>
  );
}

// ---------------------------------------------------------------- Platform owner
export function Companies() {
  const router = useRouter();
  const { db, commit } = useDB();
  const { toast } = useOverlay();
  const [add, setAdd] = useState(false);
  const [f, setF] = useState({ name: "", contact: "" });
  return (
    <Screen eyebrow="Platform" title="Companies" actions={<IconBtn icon={Plus} label="Add company" filled onPress={() => setAdd(true)} />}>
      {db.companies.some((c) => c.status === "past_due") && <Banner tone="warning" title="A tenant is past due" sub="Access locks 7 days after the paid-until date." />}
      {db.companies.map((c) => (
        <RecordCard key={c.id} title={c.name} subtitle={c.contact} badge={<Badge label={c.status.replace("_", " ")} tone={c.status === "active" ? "success" : c.status === "trial" ? "info" : "danger"} />} onPress={() => router.push(`/companies/${c.id}`)}
          fields={[{ label: "Users", value: String(c.users), mono: true }, { label: "Employees", value: String(c.employees), mono: true }, { label: "Subscription", value: c.plan }, { label: "Paid until", value: fmtShort(c.paid_until) }]}
          actions={[{ label: "View as", icon: Eye, onPress: () => toast(`Viewing as ${c.name}`, "info") }, { label: "Payment", icon: Plus, onPress: () => { commit((d) => { d.subscriptionPayments.unshift({ id: `sp${Date.now()}`, company_id: c.id, date: TODAY, amount: 45000, days: 30, notes: "Manual" }); }); toast("Payment recorded"); } }]} />
      ))}
      <Section title="Payment history">
        <ListCard>{db.subscriptionPayments.map((p, i) => <Row key={p.id} last={i === db.subscriptionPayments.length - 1} title={db.companies.find((c) => c.id === p.company_id)?.name ?? ""} meta={`${fmtShort(p.date)} · ${p.days} days · ${p.notes}`} right={<T v="mono">{pkr(p.amount, { compact: true })}</T>} />)}</ListCard>
      </Section>
      <Sheet open={add} onClose={() => setAdd(false)} title="Add company" footer={<Button label="Create" full disabled={!f.name} onPress={() => { commit((d) => { d.companies.push({ id: `co${Date.now()}`, name: f.name, contact: f.contact, users: 0, employees: 0, plan: "Starter", status: "trial", paid_until: TODAY }); }); setAdd(false); toast("Company created"); }} />}>
        <Input label="Company name" required value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
        <Input label="Admin email" value={f.contact} autoCapitalize="none" onChangeText={(v) => setF({ ...f, contact: v })} />
      </Sheet>
    </Screen>
  );
}

export function CompanyDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db } = useDB();
  const { toast } = useOverlay();
  const c = db.companies.find((x) => x.id === id);
  if (!c) return <Screen title="Company"><Empty title="Company not found" /></Screen>;
  return (
    <Screen eyebrow="Platform" title={c.name}>
      <Card><Fields items={[{ label: "Contact", value: c.contact, full: true }, { label: "Plan", value: c.plan }, { label: "Status", value: <Badge label={c.status} small /> }, { label: "Employees", value: String(c.employees), mono: true }, { label: "Paid until", value: fmtShort(c.paid_until) }]} /></Card>
      <Section title="Users">
        <ListCard>{(c.id === "co1" ? db.users : []).map((u, i, a) => <Row key={u.id} last={i === a.length - 1} title={u.name} subtitle={u.email} meta={u.title} right={<IconBtn icon={KeyRound} size={34} label="Reset password" onPress={() => toast(`Reset link sent to ${u.email}`)} />} />)}</ListCard>
        {c.id !== "co1" && <T v="small" muted>{isLive ? "Loaded from the tenant." : "Demo data only covers GGS."}</T>}
      </Section>
    </Screen>
  );
}
