import { Plus } from "lucide-react-native";
import React, { useState } from "react";
import { View } from "react-native";
import { Screen } from "../../components/Screen";
import { Select, Sheet, useOverlay } from "../../components/Sheet";
import { T } from "../../components/Text";
import { Badge, Button, Card, Checkbox, Empty, HStack, IconBtn, Input, Section, Segmented, toneOf } from "../../components/ui";
import { Task, TODAY } from "../../data/seed";
import { useDB } from "../../data/store";
import { useAuth } from "../../lib/auth";
import { isAdmin } from "../../lib/permissions";
import { daysBetween, fmtShort } from "../../lib/format";
import { useTheme } from "../../theme/ThemeProvider";

const COLS: { key: Task["status"]; label: string; tone: "info" | "warning" | "success" }[] = [
  { key: "todo", label: "To do", tone: "info" },
  { key: "in_progress", label: "In progress", tone: "warning" },
  { key: "done", label: "Done", tone: "success" },
];
const PRIORITY_TONE = { low: "neutral", medium: "info", high: "warning", urgent: "danger" } as const;

/** Kanban columns become a segmented switch — one column at a time fits a phone. */
export default function Tasks() {
  const t = useTheme();
  const { db, commit } = useDB();
  const { profile } = useAuth();
  const { toast } = useOverlay();
  const admin = isAdmin(profile);
  const [col, setCol] = useState<Task["status"]>("todo");
  const [edit, setEdit] = useState<Task | "new" | null>(null);
  const [newItem, setNewItem] = useState("");
  const mine = admin ? db.tasks : db.tasks.filter((x) => x.assignee === profile?.name);
  const shown = mine.filter((x) => x.status === col);

  return (
    <Screen
      eyebrow="Overview"
      title={admin ? "Task Board" : "My Tasks"}
      actions={admin ? <IconBtn icon={Plus} label="New task" filled onPress={() => setEdit("new")} /> : undefined}
      sticky={<Segmented value={col} onChange={setCol} items={COLS.map((c) => ({ key: c.key, label: c.label, count: mine.filter((x) => x.status === c.key).length }))} />}
    >
      {shown.map((x) => {
        const d = daysBetween(TODAY, x.due);
        return (
          <Card key={x.id} style={{ marginBottom: 10, borderTopWidth: 3, borderTopColor: t.tone(COLS.find((c) => c.key === x.status)!.tone).solid }} onPress={() => setEdit(x)}>
            <HStack style={{ alignItems: "flex-start" }}>
              <T v="bodyStrong" style={{ flex: 1 }}>{x.title}</T>
              <Badge label={x.priority} tone={PRIORITY_TONE[x.priority]} small />
            </HStack>
            {x.description ? <T v="small" muted style={{ marginTop: 4 }}>{x.description}</T> : null}
            <HStack style={{ marginTop: 10 }}>
              <T v="small" soft style={{ flex: 1 }}>{x.assignee}</T>
              <T v="mono" style={{ fontSize: 12 }} color={x.status !== "done" && d < 0 ? t.tone("danger").text : t.mutedFg}>{x.status !== "done" && d < 0 ? `${-d}d late` : `due ${fmtShort(x.due)}`}</T>
            </HStack>
            {x.status !== "done" && (
              <HStack style={{ marginTop: 12 }}>
                {x.status === "todo" && <Button size="sm" variant="secondary" label="Start" onPress={() => { commit((db2) => { db2.tasks.find((y) => y.id === x.id)!.status = "in_progress"; }); toast("Moved to In progress"); }} />}
                <Button size="sm" variant="success" label="Mark done" onPress={() => { commit((db2) => { db2.tasks.find((y) => y.id === x.id)!.status = "done"; }); toast("Task done"); }} />
              </HStack>
            )}
          </Card>
        );
      })}
      {shown.length === 0 && <Empty title="Nothing here" sub={col === "done" ? "Finished tasks land here." : "You're clear."} />}

      <Section title="Personal checklist" count={`${db.checklist.filter((c) => c.done).length}/${db.checklist.length}`} hint="Only you can see this.">
        <Card>
          {db.checklist.map((c) => (
            <Checkbox key={c.id} value={c.done} label={c.text} onChange={(v) => commit((d) => { d.checklist.find((y) => y.id === c.id)!.done = v; })} />
          ))}
          <HStack style={{ marginTop: 10 }}>
            <View style={{ flex: 1 }}><Input style={{ marginBottom: 0 }} value={newItem} onChangeText={setNewItem} placeholder="Add an item" onSubmitEditing={() => { if (newItem.trim()) { commit((d) => { d.checklist.push({ id: `pc${Date.now()}`, text: newItem.trim(), done: false }); }); setNewItem(""); } }} /></View>
          </HStack>
        </Card>
      </Section>

      <TaskSheet key={edit === "new" ? "new" : edit?.id ?? "none"} task={edit} onClose={() => setEdit(null)} canEdit={admin} />
    </Screen>
  );
}

function TaskSheet({ task, onClose, canEdit }: { task: Task | "new" | null; onClose: () => void; canEdit: boolean }) {
  const { db, commit } = useDB();
  const { toast } = useOverlay();
  const isNew = task === "new";
  const init: Task = isNew || !task ? { id: "", title: "", description: "", assignee: db.users[1]!.name, due: TODAY, status: "todo", priority: "medium" } : task;
  const [f, setF] = useState<Task>(init);
  return (
    <Sheet open={!!task} onClose={onClose} title={isNew ? "New task" : `Edit task — ${init.title}`}
      footer={canEdit ? <><Button label="Cancel" variant="secondary" full onPress={onClose} /><Button label="Save" full disabled={!f.title.trim()} onPress={() => {
        commit((d) => { if (isNew) d.tasks.unshift({ ...f, id: `tk${Date.now()}` }); else Object.assign(d.tasks.find((x) => x.id === f.id)!, f); });
        toast(isNew ? "Task created" : "Task saved"); onClose();
      }} /></> : <Button label="Close" full onPress={onClose} />}>
      <Input label="Title" required editable={canEdit} value={f.title} onChangeText={(v) => setF({ ...f, title: v })} />
      <Input label="Description" editable={canEdit} multiline value={f.description} onChangeText={(v) => setF({ ...f, description: v })} />
      <Select label="Assignee" value={f.assignee} onChange={(v) => setF({ ...f, assignee: v })} options={db.users.map((u) => ({ value: u.name, label: u.name, sub: u.title }))} />
      <Input label="Due date" editable={canEdit} value={f.due} onChangeText={(v) => setF({ ...f, due: v })} placeholder="YYYY-MM-DD" />
      <Select label="Status" value={f.status} onChange={(v) => setF({ ...f, status: v as Task["status"] })} options={COLS.map((c) => ({ value: c.key, label: c.label }))} />
      <Select label="Priority" value={f.priority} onChange={(v) => setF({ ...f, priority: v as Task["priority"] })} options={["low", "medium", "high", "urgent"].map((p) => ({ value: p, label: p[0]!.toUpperCase() + p.slice(1) }))} />
      <Badge label={f.status.replace("_", " ")} tone={toneOf(f.status)} />
    </Sheet>
  );
}
