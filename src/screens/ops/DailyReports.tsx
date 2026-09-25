import { useRouter } from "expo-router";
import { Check, ChevronLeft, ChevronRight, FileDown, ShieldAlert } from "lucide-react-native";
import React, { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { Screen } from "../../components/Screen";
import { useOverlay } from "../../components/Sheet";
import { T } from "../../components/Text";
import { Badge, Button, Card, HStack, IconBtn, ListCard, Row, Section, tap } from "../../components/ui";
import { TODAY } from "../../data/seed";
import { attendance, useDB } from "../../data/store";
import { useAuth } from "../../lib/auth";
import { addDays, fmtDay, fmtShort, fmtTime } from "../../lib/format";
import { inRegion, useRegion } from "../../lib/region";
import { useTheme } from "../../theme/ThemeProvider";
import { fonts, radius } from "../../theme/tokens";

/** Daily Reports (FieldOps): one written note per active client per day, exported as a branded PDF. */
export default function DailyReports() {
  const t = useTheme();
  const router = useRouter();
  const { db, commit } = useDB();
  const { can, canAny, profile } = useAuth();
  const { regionId } = useRegion();
  const { toast } = useOverlay();
  const [date, setDate] = useState(TODAY);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const canWrite = can("roster.edit");
  const clients = db.clients.filter((c) => c.status === "active" && inRegion(regionId, c.branch_id));
  const notes = db.dailyNotes[date] ?? {};
  const written = clients.filter((c) => notes[c.id]).length;

  const saveNote = (cid: string) => {
    const text = drafts[cid];
    if (text === undefined) return;
    commit((d) => { d.dailyNotes[date] = { ...(d.dailyNotes[date] ?? {}), [cid]: text }; });
    setDrafts((x) => { const y = { ...x }; delete y[cid]; return y; });
    toast("Note saved");
  };

  return (
    <Screen
      region
      eyebrow="Operations"
      title="Daily Reports"
      subtitle={`${written} of ${clients.length} clients written for ${fmtShort(date)}`}
      actions={<IconBtn icon={FileDown} label="Export PDF" onPress={() => {
        commit((d) => { d.reportExports.unshift({ id: `x${Date.now()}`, date, clients: written, by: profile?.name ?? "", at: new Date().toISOString() }); });
        toast(`Daily report PDF for ${fmtShort(date)} saved`, "info");
      }} />}
      sticky={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <IconBtn icon={ChevronLeft} label="Previous day" onPress={() => setDate(addDays(date, -1))} />
          <Pressable onPress={() => { tap(); setDate(TODAY); }} style={{ flex: 1, height: 40, borderRadius: radius.lg, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, alignItems: "center", justifyContent: "center" }}>
            <T v="smallStrong" style={{ fontSize: 14 }}>{date === TODAY ? `Today · ${fmtDay(date)}` : fmtDay(date)}</T>
          </Pressable>
          <IconBtn icon={ChevronRight} label="Next day" onPress={() => date < TODAY && setDate(addDays(date, 1))} />
        </View>
      }
    >
      {canAny(["incidents.view", "incidents.edit"]) && (
        <Card onPress={() => router.push("/incidents")} style={{ marginBottom: 4 }}>
          <HStack>
            <ShieldAlert size={18} color={t.tone("danger").text} />
            <T v="smallStrong" style={{ flex: 1, fontSize: 14 }}>{db.incidents.filter((i) => i.occurred_at.startsWith(date)).length} incidents logged this day</T>
            {can("incidents.edit") && <T v="smallStrong" color={t.tone("brand").text}>Log incident</T>}
          </HStack>
        </Card>
      )}

      {clients.map((c) => {
        const staff = db.employees.filter((e) => e.client_id === c.id && e.lifecycle === "active");
        const absent = staff.filter((e) => attendance(db, e.id, date) === "absent").length;
        const draft = drafts[c.id];
        const val = draft ?? notes[c.id] ?? "";
        const dirty = draft !== undefined && draft !== (notes[c.id] ?? "");
        return (
          <Section key={c.id} title={c.name} action={notes[c.id] && !dirty ? <Badge label="Written" tone="success" small /> : dirty ? <Badge label="Unsaved" tone="warning" small /> : undefined}>
            <Card>
              <HStack gap={14} style={{ marginBottom: 10 }}>
                <T v="small" muted>{staff.length} posted</T>
                <T v="small" color={absent ? t.tone("danger").text : t.mutedFg}>{absent} absent</T>
                <T v="small" muted>{db.sites.filter((s) => s.client_id === c.id).length} sites</T>
              </HStack>
              <TextInput
                multiline
                editable={canWrite}
                value={val}
                onChangeText={(v) => setDrafts((x) => ({ ...x, [c.id]: v }))}
                placeholder={canWrite ? "Details for this client today…" : "No note written."}
                placeholderTextColor={t.mutedFg}
                style={{ minHeight: 84, color: t.fg, fontFamily: fonts.body, fontSize: 16, lineHeight: 22, textAlignVertical: "top", backgroundColor: t.input, borderRadius: radius.lg, borderWidth: 1, borderColor: dirty ? t.brand[500] : t.border, padding: 12 }}
              />
              {dirty && canWrite && (
                <View style={{ marginTop: 10, flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
                  <Button size="sm" label="Discard" variant="ghost" onPress={() => setDrafts((x) => { const y = { ...x }; delete y[c.id]; return y; })} />
                  <Button size="sm" label="Save note" icon={Check} onPress={() => saveNote(c.id)} />
                </View>
              )}
            </Card>
          </Section>
        );
      })}

      <Section title="Export history" count={db.reportExports.length}>
        <ListCard>
          {db.reportExports.map((x, i) => (
            <Row key={x.id} last={i === db.reportExports.length - 1} title={fmtDay(x.date)} subtitle={`${x.clients} clients · by ${x.by}`} meta={`${fmtShort(x.at.slice(0, 10))} ${fmtTime(x.at)}`} right={<FileDown size={16} color={t.mutedFg} />} onPress={() => toast("Re-downloading PDF", "info")} />
          ))}
        </ListCard>
      </Section>
    </Screen>
  );
}
