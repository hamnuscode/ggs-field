import { useLocalSearchParams, useRouter } from "expo-router";
import { Camera, ChevronDown, ChevronUp, FilePlus2 } from "lucide-react-native";
import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { Screen } from "../../components/Screen";
import { Select, useOverlay } from "../../components/Sheet";
import { T } from "../../components/Text";
import { Badge, Button, Card, HStack, Input, Toggle, tap } from "../../components/ui";
import { Employee, TODAY } from "../../data/seed";
import { useDB } from "../../data/store";
import { useAuth } from "../../lib/auth";
import { useTheme } from "../../theme/ThemeProvider";

type Form = Omit<Employee, "id" | "base" | "allowance"> & { base: string; allowance: string };

/** Add Employee / Edit Employee / "Hire — complete employee record", one collapsible form. */
export default function EmployeeForm() {
  const router = useRouter();
  const { id, hire } = useLocalSearchParams<{ id?: string; hire?: string }>();
  const { db, commit } = useDB();
  const { can, canAny } = useAuth();
  const { toast } = useOverlay();
  const existing = db.employees.find((e) => e.id === id);
  const [f, setF] = useState<Form>(() => {
    const base = existing ?? ({
      code: `GGS-${1001 + db.employees.length}`, permanent_code: `P${5000 + db.employees.length}`, name: "", father_name: "", phone: "", cnic: "", cnic_expiry: null, dob: "",
      category: "client", department: "Security Guard", client_id: null, site_id: null, line_id: null, shift: "day", branch_id: db.branches[0]!.id,
      lifecycle: "active", status: "Active", join_date: TODAY, left_on: null, base: 0, allowance: 0, per_day: 0, pay_mode: "fixed", physical_copy: false,
      incomplete: [], verified: false, bank: "", account: "", address: "", blood_group: "", ex_service: false, police_verification: "pending",
      verisys: "pending", emergency_name: "", emergency_phone: "", education: "", warnings: 0,
    } as unknown as Employee);
    return { ...base, base: base.base ? String(base.base) : "", allowance: base.allowance ? String(base.allowance) : "" };
  });
  const [open, setOpen] = useState<Record<string, boolean>>({ basic: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const canPay = canAny(["assignments.accounts", "employees.edit"]);

  const save = () => {
    const err: Record<string, string> = {};
    if (!f.name.trim()) err.name = "Required";
    if (!/^\d{5}-\d{7}-\d$/.test(f.cnic)) err.cnic = "Format 00000-0000000-0";
    if (f.phone.replace(/\D/g, "").length < 10) err.phone = "Enter a mobile number";
    if (f.category === "client" && !f.client_id) err.client_id = "Pick a client";
    setErrors(err);
    if (Object.keys(err).length) {
      // Auto-open the section holding the first invalid field (web behaviour).
      const first = Object.keys(err)[0]!;
      setOpen((o) => ({ ...o, [first === "client_id" ? "posting" : "basic"]: true }));
      toast(`${Object.keys(err).length} field${Object.keys(err).length > 1 ? "s" : ""} need attention`, "danger");
      return;
    }
    commit((d) => {
      const row: Employee = { ...(f as unknown as Employee), base: Number(f.base) || 0, allowance: Number(f.allowance) || 0, per_day: Math.round((Number(f.base) || 0) / 30), id: existing?.id ?? `e${d.employees.length + 100}` };
      if (hire) { row.lifecycle = "active"; row.status = "Active"; row.join_date = row.join_date ?? TODAY; }
      if (existing) Object.assign(d.employees.find((e) => e.id === existing.id)!, row);
      else d.employees.unshift(row);
    });
    toast(existing ? (hire ? `${f.name} hired` : "Employee saved") : "Employee added");
    router.back();
  };

  const clients = db.clients.filter((c) => c.status === "active");
  const sites = db.sites.filter((s) => s.client_id === f.client_id);
  const lines = db.contracts.find((k) => k.client_id === f.client_id)?.lines ?? [];

  return (
    <Screen
      eyebrow={existing ? f.code : "New record"}
      title={hire ? "Hire — complete record" : existing ? "Edit employee" : "Add employee"}
      footer={<><Button label="Cancel" variant="secondary" full onPress={() => router.back()} /><Button label={hire ? "Hire" : "Save"} full onPress={save} /></>}
    >
      <FormSection id="basic" title="Basic information" open={open} setOpen={setOpen} error={!!(errors.name || errors.cnic || errors.phone)}>
        <Input label="Full name" required value={f.name} onChangeText={(v) => set("name", v)} error={errors.name} />
        <Input label="Father's name" value={f.father_name} onChangeText={(v) => set("father_name", v)} />
        <Input label="CNIC" required value={f.cnic} onChangeText={(v) => set("cnic", v)} placeholder="35202-1234567-1" keyboardType="numbers-and-punctuation" error={errors.cnic} />
        <HStack gap={10}>
          <Input style={{ flex: 1 }} label="CNIC expiry" value={f.cnic_expiry ?? ""} onChangeText={(v) => set("cnic_expiry", v || null)} placeholder="YYYY-MM-DD" />
          <Input style={{ flex: 1 }} label="Date of birth" value={f.dob} onChangeText={(v) => set("dob", v)} placeholder="YYYY-MM-DD" />
        </HStack>
        <Input label="Mobile" required value={f.phone} onChangeText={(v) => set("phone", v)} keyboardType="phone-pad" error={errors.phone} />
        <Input label="Address" value={f.address} onChangeText={(v) => set("address", v)} multiline />
        <HStack gap={10}>
          <View style={{ flex: 1 }}><Select label="Blood group" value={f.blood_group} onChange={(v) => set("blood_group", v)} options={["A+", "A−", "B+", "B−", "O+", "O−", "AB+", "AB−"].map((x) => ({ value: x, label: x }))} /></View>
          <View style={{ flex: 1 }}><Select label="Education" value={f.education} onChange={(v) => set("education", v)} options={["Primary", "Middle", "Matric", "Intermediate", "Graduate"].map((x) => ({ value: x, label: x }))} /></View>
        </HStack>
      </FormSection>

      <FormSection id="posting" title="Posting" open={open} setOpen={setOpen} error={!!errors.client_id}>
        <Select label="Category" value={f.category} onChange={(v) => set("category", v as Employee["category"])} options={[{ value: "client", label: "Client post" }, { value: "office_staff", label: "Office staff" }, { value: "reliever", label: "Reliever" }]} />
        <Input label="Designation" value={f.department} onChangeText={(v) => set("department", v)} />
        {f.category === "client" && (
          <>
            <Select label="Client" required value={f.client_id} onChange={(v) => setF((x) => ({ ...x, client_id: v, site_id: null, line_id: null }))} options={clients.map((c) => ({ value: c.id, label: c.name }))} />
            {errors.client_id ? <T v="small" style={{ marginTop: -10, marginBottom: 10 }} color="#bb5238">{errors.client_id}</T> : null}
            {f.client_id ? <Select label="Site" value={f.site_id} onChange={(v) => set("site_id", v)} options={sites.map((s) => ({ value: s.id, label: s.name }))} /> : null}
            {f.client_id ? <Select label="Contract line" value={f.line_id} onChange={(v) => set("line_id", v)} options={lines.map((l) => ({ value: l.id, label: l.category, sub: `${l.active}/${l.committed} posted` }))} /> : null}
          </>
        )}
        <HStack gap={10}>
          <View style={{ flex: 1 }}><Select label="Shift" value={f.shift} onChange={(v) => set("shift", v as Employee["shift"])} options={[{ value: "day", label: "Day" }, { value: "night", label: "Night" }, { value: "evening", label: "Evening" }]} /></View>
          <View style={{ flex: 1 }}><Select label="Region" value={f.branch_id} onChange={(v) => set("branch_id", v)} options={db.branches.map((b) => ({ value: b.id, label: b.name }))} /></View>
        </HStack>
        <Input label="Joining date" value={f.join_date ?? ""} onChangeText={(v) => set("join_date", v)} placeholder="YYYY-MM-DD" />
        <Toggle label="Physical copy on file" value={f.physical_copy} onChange={(v) => set("physical_copy", v)} />
      </FormSection>

      {canPay && (
        <FormSection id="pay" title="Salary" open={open} setOpen={setOpen}>
          <Input label="Base salary" amount value={f.base} onChangeText={(v) => set("base", v)} />
          <Input label="Allowance" amount value={f.allowance} onChangeText={(v) => set("allowance", v)} />
          <Select label="Pay mode" value={f.pay_mode} onChange={(v) => set("pay_mode", v as Employee["pay_mode"])} options={[{ value: "fixed", label: "Fixed" }, { value: "variable", label: "Variable (per day)" }]} />
        </FormSection>
      )}

      <FormSection id="bank" title="Bank details" open={open} setOpen={setOpen}>
        <Select label="Bank / wallet" value={f.bank} onChange={(v) => set("bank", v)} options={["HBL", "Meezan", "UBL", "Allied", "JazzCash", "Easypaisa"].map((x) => ({ value: x, label: x }))} />
        <Input label="Account / IBAN" value={f.account} onChangeText={(v) => set("account", v)} autoCapitalize="characters" />
      </FormSection>

      <FormSection id="emergency" title="Emergency contact" open={open} setOpen={setOpen}>
        <Input label="Name" value={f.emergency_name} onChangeText={(v) => set("emergency_name", v)} />
        <Input label="Phone" value={f.emergency_phone} onChangeText={(v) => set("emergency_phone", v)} keyboardType="phone-pad" />
      </FormSection>

      <FormSection id="service" title="Ex-service & vetting" open={open} setOpen={setOpen}>
        <Toggle label="Ex-service" sub="Armed forces background" value={f.ex_service} onChange={(v) => set("ex_service", v)} />
        <Select label="Police verification" value={f.police_verification} onChange={(v) => set("police_verification", v as Employee["police_verification"])} options={["pending", "cleared", "adverse"].map((x) => ({ value: x, label: x[0]!.toUpperCase() + x.slice(1) }))} />
        <Select label="NADRA Verisys" value={f.verisys} onChange={(v) => set("verisys", v as Employee["verisys"])} options={["pending", "cleared", "adverse"].map((x) => ({ value: x, label: x[0]!.toUpperCase() + x.slice(1) }))} />
      </FormSection>

      {existing && can("employees.edit") && (
        <FormSection id="identity" title="Identity verification" open={open} setOpen={setOpen}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Badge label={f.verified ? "Verified" : "Not verified"} tone={f.verified ? "success" : "warning"} dot />
            <Button size="sm" variant={f.verified ? "secondary" : "success"} label={f.verified ? "Unverify" : "Verify identity"} onPress={() => set("verified", !f.verified)} />
          </View>
          <T v="small" muted style={{ marginTop: 10 }}>Verifying locks name, father’s name and CNIC. Amendments afterwards need a reason and are logged.</T>
        </FormSection>
      )}

      <FormSection id="docs" title="Documents" open={open} setOpen={setOpen}>
        <HStack>
          <Button label="Take photo" icon={Camera} variant="secondary" full onPress={() => toast("Camera opens here on a device build", "info")} />
          <Button label="Add file" icon={FilePlus2} variant="secondary" full onPress={() => toast("File picker opens here on a device build", "info")} />
        </HStack>
      </FormSection>
    </Screen>
  );
}

function FormSection({ id, title, open, setOpen, children, error }: { id: string; title: string; open: Record<string, boolean>; setOpen: React.Dispatch<React.SetStateAction<Record<string, boolean>>>; children: React.ReactNode; error?: boolean }) {
  const t = useTheme();
  const isOpen = !!open[id];
  return (
    <Card pad={0} style={{ marginBottom: 10, borderColor: error ? t.tone("danger").line : t.border }}>
      <Pressable onPress={() => { tap(); setOpen((o) => ({ ...o, [id]: !isOpen })); }} style={{ flexDirection: "row", alignItems: "center", padding: 16, gap: 8 }}>
        <T v="h3" style={{ flex: 1 }}>{title}</T>
        {error && <Badge label="Check" tone="danger" small />}
        {isOpen ? <ChevronUp size={18} color={t.mutedFg} /> : <ChevronDown size={18} color={t.mutedFg} />}
      </Pressable>
      {isOpen && <View style={{ paddingHorizontal: 16, paddingBottom: 6, borderTopWidth: 1, borderTopColor: t.border, paddingTop: 14 }}>{children}</View>}
    </Card>
  );
}
