import { useRouter } from "expo-router";
import { CalendarDays, ChevronLeft, ChevronRight, Download, Grid3x3, Users } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { Screen } from "../../components/Screen";
import { Select, useOverlay } from "../../components/Sheet";
import { T } from "../../components/Text";
import { Badge, Card, Empty, IconBtn, RecordCard, SearchBar, Section, StatGrid, Strength, Tabs, tap } from "../../components/ui";
import { Shift, TODAY } from "../../data/seed";
import { attendance, clientName, reportState, roster, siteName, useDB } from "../../data/store";
import { useAuth } from "../../lib/auth";
import { addDays, fmtDay, fmtShort } from "../../lib/format";
import { inRegion, useRegion } from "../../lib/region";
import { useTheme } from "../../theme/ThemeProvider";
import { radius } from "../../theme/tokens";
import { BulkMarkSheet } from "./BulkMark";

export const SHIFT_LABEL: Record<Shift, string> = { day: "Day", night: "Night", evening: "Evening" };

export default function Attendance() {
  const t = useTheme();
  const router = useRouter();
  const { db, commit } = useDB();
  const { can, canAny } = useAuth();
  const { regionId } = useRegion();
  const { toast } = useOverlay();
  const [tab, setTab] = useState<"board" | "vacancies" | "shifts">("board");
  const [date, setDate] = useState(TODAY);
  const [clientF, setClientF] = useState("");
  const [q, setQ] = useState("");
  const [bulk, setBulk] = useState(false);
  const canShifts = canAny(["assignments.hr", "employees.edit"]);

  const clients = db.clients.filter((c) => c.status === "active" && inRegion(regionId, c.branch_id) && (!clientF || c.id === clientF));

  const board = useMemo(() => clients.map((c) => {
    const sites = db.sites.filter((s) => s.client_id === c.id && (!q || s.name.toLowerCase().includes(q.toLowerCase()) || c.name.toLowerCase().includes(q.toLowerCase())));
    const rows = sites.flatMap((s) => s.shifts.map((sh) => {
      const r = roster(db, s.id, sh.shift);
      const exceptions = r.filter((e) => ["absent", "leave"].includes(attendance(db, e.id, date) ?? "")).length;
      return { site: s, shift: sh.shift, contracted: sh.contracted, deployed: r.length, exceptions, state: reportState(db, s.id, sh.shift, date) };
    }));
    return { client: c, rows };
  }).filter((x) => x.rows.length), [clients, db, date, q]);

  const all = board.flatMap((b) => b.rows);
  const totals = {
    confirmed: all.filter((r) => r.state === "confirmed").length,
    onGround: all.reduce((a, r) => a + r.deployed - r.exceptions, 0),
    exceptions: all.reduce((a, r) => a + r.exceptions, 0),
    awaiting: all.filter((r) => r.state === "awaiting").length,
  };
  const vacancies = db.vacancies.filter((v) => clients.some((c) => c.id === v.client_id));

  return (
    <Screen
      region
      eyebrow="Workforce"
      title="Attendance"
      actions={
        <>
          {can("attendance.bulk_mark") && <IconBtn icon={CalendarDays} label="Bulk mark by employee" onPress={() => setBulk(true)} />}
          <IconBtn icon={Download} label="Export" onPress={() => toast(`Attendance for ${fmtShort(date)} exported`, "info")} />
        </>
      }
      sticky={
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { key: "board", label: "Daily board" },
            { key: "vacancies", label: "Vacancies", count: vacancies.length },
            ...(canShifts ? [{ key: "shifts" as const, label: "Shift management" }] : []),
          ]}
        />
      }
    >
      {tab === "board" && (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <IconBtn icon={ChevronLeft} label="Previous day" onPress={() => setDate(addDays(date, -1))} />
            <Pressable onPress={() => { tap(); setDate(TODAY); }} style={{ flex: 1, height: 40, borderRadius: radius.lg, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, alignItems: "center", justifyContent: "center" }}>
              <T v="smallStrong" style={{ fontSize: 14 }}>{date === TODAY ? `Today · ${fmtDay(date)}` : fmtDay(date)}</T>
            </Pressable>
            <IconBtn icon={ChevronRight} label="Next day" onPress={() => date < TODAY && setDate(addDays(date, 1))} />
          </View>
          <StatGrid
            items={[
              { label: "Confirmed", value: `${totals.confirmed}/${all.length}`, tone: totals.confirmed === all.length ? "success" : "brand", hint: "shift reports" },
              { label: "On ground", value: String(totals.onGround), tone: "success" },
              { label: "Exceptions", value: String(totals.exceptions), tone: totals.exceptions ? "danger" : "neutral", hint: "absent or on leave" },
              { label: "Awaiting", value: String(totals.awaiting), tone: totals.awaiting ? "warning" : "neutral", hint: "not reported" },
            ]}
          />
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <View style={{ flex: 1 }}>
              <SearchBar value={q} onChange={setQ} placeholder="Site or client" />
            </View>
          </View>
          <View style={{ marginTop: 8 }}>
            <Select compact clearable label="Client" value={clientF} onChange={setClientF} placeholder="All clients" options={db.clients.filter((c) => c.status === "active").map((c) => ({ value: c.id, label: c.name }))} />
          </View>

          {board.map(({ client, rows }) => {
            const done = rows.filter((r) => r.state === "confirmed").length;
            return (
              <Section
                key={client.id}
                title={client.name}
                count={`${done}/${rows.length}`}
                action={<T v="smallStrong" color={t.tone("brand").text} onPress={() => router.push(`/attendance/monthly/${client.id}`)}>Monthly</T>}
              >
                {rows.map((r) => (
                  <Pressable
                    key={r.site.id + r.shift}
                    onPress={() => { tap(); router.push(`/attendance/site/${r.site.id}?shift=${r.shift}&date=${date}`); }}
                    style={({ pressed }) => ({
                      backgroundColor: pressed ? t.muted : t.card, borderRadius: radius.lg, borderWidth: 1, borderColor: t.border, padding: 14, marginBottom: 8,
                      borderLeftWidth: 4, borderLeftColor: r.state === "confirmed" ? t.tone("success").solid : r.state === "reported" ? t.tone("info").solid : t.tone("warning").solid,
                    })}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <T v="bodyStrong" numberOfLines={1}>{r.site.name}</T>
                        <T v="small" muted>{SHIFT_LABEL[r.shift]} shift · {r.site.area}</T>
                      </View>
                      <Badge label={r.state === "awaiting" ? "Awaiting" : r.state === "reported" ? "Reported" : "Confirmed"} tone={r.state === "confirmed" ? "success" : r.state === "reported" ? "info" : "warning"} dot />
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12, gap: 12 }}>
                      <View style={{ flex: 1 }}>
                        <Strength contracted={r.contracted} deployed={r.deployed} exceptions={r.exceptions} />
                      </View>
                      <T v="mono" style={{ fontSize: 13 }}>
                        <T v="mono" color={t.tone("success").text} style={{ fontSize: 13 }}>{r.deployed - r.exceptions}</T>
                        <T v="mono" muted style={{ fontSize: 13 }}>/{r.contracted}</T>
                      </T>
                    </View>
                    {r.exceptions > 0 || r.deployed < r.contracted ? (
                      <T v="small" color={t.tone("danger").text} style={{ marginTop: 8 }}>
                        {[r.exceptions ? `${r.exceptions} exception${r.exceptions > 1 ? "s" : ""}` : "", r.deployed < r.contracted ? `${r.contracted - r.deployed} unfilled` : ""].filter(Boolean).join(" · ")}
                      </T>
                    ) : null}
                  </Pressable>
                ))}
              </Section>
            );
          })}
          {board.length === 0 && <Empty icon={Grid3x3} title="No sites match" />}
          <View style={{ flexDirection: "row", gap: 14, marginTop: 16, flexWrap: "wrap" }}>
            <Legend color={t.tone("success").solid} label="On post" />
            <Legend color={t.tone("warning").solid} label="Exception" />
            <Legend color="transparent" border={t.tone("danger").solid} label="Unfilled" />
            <Legend color={t.tone("info").solid} label="Over strength" />
          </View>
        </>
      )}

      {tab === "vacancies" && (
        <>
          <T v="small" muted style={{ marginBottom: 12 }}>Posts short of their contracted strength. Dismiss once a guard is posted or the line is reduced.</T>
          {vacancies.map((v) => (
            <RecordCard
              key={v.id}
              title={v.reason}
              subtitle={`${clientName(db, v.client_id)} · ${siteName(db, v.site_id)}`}
              badge={<Badge label={SHIFT_LABEL[v.shift]} tone="info" small />}
              accent="warning"
              fields={[{ label: "Opened", value: fmtShort(v.opened) }, { label: "Open for", value: `${Math.max(0, Math.round((Date.parse(TODAY) - Date.parse(v.opened)) / 864e5))} days` }]}
              actions={can("attendance.edit") ? [{ label: "Dismiss", onPress: () => { commit((d) => { d.vacancies = d.vacancies.filter((x) => x.id !== v.id); }); toast("Vacancy dismissed"); } }] : undefined}
            />
          ))}
          {vacancies.length === 0 && <Empty icon={Users} title="No open vacancies" sub="Every contracted slot is posted." />}
        </>
      )}

      {tab === "shifts" && canShifts && <ShiftManagement />}

      <BulkMarkSheet open={bulk} onClose={() => setBulk(false)} />
    </Screen>
  );
}

function Legend({ color, label, border }: { color: string; label: string; border?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: color, borderWidth: border ? 1.5 : 0, borderColor: border, borderStyle: "dashed" }} />
      <T v="small" muted>{label}</T>
    </View>
  );
}

function ShiftManagement() {
  const { db, commit } = useDB();
  const { regionId } = useRegion();
  const { toast } = useOverlay();
  const clients = db.clients.filter((c) => c.status === "active" && inRegion(regionId, c.branch_id));
  return (
    <>
      <T v="small" muted style={{ marginBottom: 4 }}>Move a guard between shifts. Changes are recorded in the guard’s shift history.</T>
      {clients.map((c) => {
        const staff = db.employees.filter((e) => e.client_id === c.id && e.lifecycle === "active");
        return (
          <Section key={c.id} title={c.name} count={staff.length}>
            <Card pad={0}>
              {staff.map((e, i) => (
                <View key={e.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: i === staff.length - 1 ? 0 : 1, borderBottomColor: "transparent" }}>
                  <View style={{ flex: 1 }}>
                    <T v="smallStrong" style={{ fontSize: 14 }}>{e.name}</T>
                    <T v="mono" muted style={{ fontSize: 11 }}>{e.code} · {e.department}</T>
                  </View>
                  <View style={{ width: 130 }}>
                    <Select
                      compact
                      value={db.shiftOverride[e.id] ?? e.shift}
                      onChange={(v) => { commit((d) => { d.shiftOverride[e.id] = v as Shift; }); toast(`${e.name} → ${SHIFT_LABEL[v as Shift]} shift`); }}
                      options={(["day", "night", "evening"] as Shift[]).map((s) => ({ value: s, label: SHIFT_LABEL[s] }))}
                      sheetTitle={`Change shift — ${e.name}`}
                    />
                  </View>
                </View>
              ))}
            </Card>
          </Section>
        );
      })}
    </>
  );
}
