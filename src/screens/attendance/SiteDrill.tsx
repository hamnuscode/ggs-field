import { useLocalSearchParams, useRouter } from "expo-router";
import { CheckCircle2, Send } from "lucide-react-native";
import React, { useState } from "react";
import { View } from "react-native";
import { Screen } from "../../components/Screen";
import { Select, useOverlay } from "../../components/Sheet";
import { T } from "../../components/Text";
import { Avatar, Banner, Button, Card, Empty, Input, Section, Strength } from "../../components/ui";
import { AttStatus, Shift, TODAY } from "../../data/seed";
import { attendance, clientName, reportState, roster, useDB } from "../../data/store";
import { useAuth } from "../../lib/auth";
import { daysBetween, fmtDay } from "../../lib/format";
import { useTheme } from "../../theme/ThemeProvider";
import { SHIFT_LABEL } from "./Attendance";
import { MARK, StatusPick } from "./marks";

const ABSENT_REASONS = ["No show", "Sick", "Family emergency", "Late — sent back", "Unauthorised leave"];

/** ShiftDrillModal as a full screen: presume present, record exceptions, supervisor confirms. */
export default function SiteDrill() {
  const t = useTheme();
  const router = useRouter();
  const { id, shift = "day", date = TODAY } = useLocalSearchParams<{ id: string; shift?: Shift; date?: string }>();
  const { db, commit } = useDB();
  const { can, profile } = useAuth();
  const { toast } = useOverlay();
  const site = db.sites.find((s) => s.id === id);
  const guards = site ? roster(db, site.id, shift) : [];
  const [marks, setMarks] = useState<Record<string, AttStatus>>(() => Object.fromEntries(guards.map((g) => [g.id, (attendance(db, g.id, date) ?? "present") === "rest_day" ? "present" : attendance(db, g.id, date) ?? "present"])));
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [reliever, setReliever] = useState<Record<string, string>>({});
  const [supervisor, setSupervisor] = useState(profile?.name ?? "");
  const [override, setOverride] = useState("");
  if (!site) return <Screen title="Site"><Empty title="Site not found" /></Screen>;

  const state = reportState(db, site.id, shift, date);
  const contracted = site.shifts.find((s) => s.shift === shift)?.contracted ?? 0;
  const age = daysBetween(date, TODAY);
  // attendance_gate: past the marking cutoff needs attendance.backdate + a reason.
  const gate = age > 2 ? (can("attendance.backdate") ? "override_required" : "blocked") : "open";
  const editable = can("attendance.edit") && gate !== "blocked" && state !== "confirmed";
  const exceptions = Object.values(marks).filter((m) => m === "absent" || m === "leave").length;
  const relievers = db.employees.filter((e) => e.category === "reliever" && e.lifecycle === "active");
  const missingReason = Object.entries(marks).some(([gid, m]) => m === "absent" && !reasons[gid]);

  const save = (next: "reported" | "confirmed") => {
    if (gate === "override_required" && !override.trim()) return toast("Give a reason for marking a past date", "danger");
    if (missingReason) return toast("Pick a reason for every absence", "danger");
    commit((d) => {
      for (const [gid, m] of Object.entries(marks)) d.attOverride[`${gid}|${date}`] = m;
      for (const rid of Object.values(reliever)) if (rid) d.attOverride[`${rid}|${date}`] = "relief_cover";
      d.reportOverride[`${site.id}|${shift}|${date}`] = next;
    });
    toast(next === "confirmed" ? `${site.name} confirmed` : `${site.name} reported`);
    router.back();
  };

  return (
    <Screen
      eyebrow={`${clientName(db, site.client_id)} · ${SHIFT_LABEL[shift]} shift`}
      title={site.name}
      subtitle={fmtDay(date)}
      footer={
        editable ? (
          <>
            {state === "awaiting" && <Button label="Report" icon={Send} variant="secondary" full onPress={() => save("reported")} />}
            <Button label={state === "reported" ? "Confirm shift" : "Report & confirm"} icon={CheckCircle2} full onPress={() => save("confirmed")} />
          </>
        ) : undefined
      }
    >
      {gate === "blocked" && <Banner tone="danger" title="Marking closed for this date" sub="It's past the cutoff. Someone with backdate permission has to make this change." />}
      {state === "confirmed" && <Banner tone="success" title="Confirmed" sub="This shift is locked. Corrections go through the timesheet." />}

      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View>
            <T v="eyebrow" muted>Strength</T>
            <T v="figure" style={{ marginTop: 4 }}>{guards.length - exceptions}<T v="h3" muted> / {contracted}</T></T>
          </View>
          <View style={{ alignItems: "flex-end", gap: 6 }}>
            <T v="small" muted>{exceptions} exception{exceptions === 1 ? "" : "s"}</T>
            {guards.length < contracted && <T v="smallStrong" color={t.tone("danger").text}>{contracted - guards.length} slot unfilled</T>}
          </View>
        </View>
        <View style={{ marginTop: 12 }}>
          <Strength contracted={contracted} deployed={guards.length} exceptions={exceptions} />
        </View>
      </Card>

      <Section title="Roster" count={guards.length} hint="Everyone is presumed present. Tap only the exceptions.">
        {guards.map((g) => (
          <Card key={g.id} style={{ marginBottom: 8 }} accent={MARK[marks[g.id] ?? "present"].tone}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <Avatar name={g.name} size={34} />
              <View style={{ flex: 1 }}>
                <T v="smallStrong" style={{ fontSize: 15 }}>{g.name}</T>
                <T v="mono" muted style={{ fontSize: 11 }}>{g.code} · {g.department}</T>
              </View>
            </View>
            <StatusPick value={marks[g.id] ?? "present"} disabled={!editable} onChange={(s) => setMarks((m) => ({ ...m, [g.id]: s }))} />
            {marks[g.id] === "absent" && (
              <View style={{ marginTop: 12 }}>
                <Select label="Absent reason" required value={reasons[g.id] ?? ""} onChange={(v) => setReasons((r) => ({ ...r, [g.id]: v }))} options={ABSENT_REASONS.map((r) => ({ value: r, label: r }))} />
                <Select label="Reliever covering" clearable value={reliever[g.id] ?? ""} onChange={(v) => setReliever((r) => ({ ...r, [g.id]: v }))} placeholder="No cover" options={relievers.map((r) => ({ value: r.id, label: r.name, sub: r.code }))} />
              </View>
            )}
          </Card>
        ))}
        {guards.length === 0 && <Empty title="Nobody posted on this shift" sub="Post guards from Assignments & Pay." />}
      </Section>

      {editable && (
        <Section title="Sign-off">
          <Input label="Supervisor" value={supervisor} onChangeText={setSupervisor} />
          {gate === "override_required" && <Input label="Reason for marking a past date" required value={override} onChangeText={setOverride} multiline />}
        </Section>
      )}
    </Screen>
  );
}
