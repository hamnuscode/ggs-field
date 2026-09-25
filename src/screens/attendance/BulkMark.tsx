import React, { useState } from "react";
import { View } from "react-native";
import { MonthGrid, MonthStepper } from "../../components/MonthGrid";
import { Select, Sheet, useOverlay } from "../../components/Sheet";
import { T } from "../../components/Text";
import { Button, Chips } from "../../components/ui";
import { AttStatus, THIS_MONTH, TODAY } from "../../data/seed";
import { attendance, clientName, useDB } from "../../data/store";
import { MARK, MarkTag, PICKABLE } from "./marks";

/** BulkMarkByEmployeeModal: pick a guard, pick a mark, tap days on the month calendar. */
export function BulkMarkSheet({ open, onClose, employeeId }: { open: boolean; onClose: () => void; employeeId?: string }) {
  const { db, commit } = useDB();
  const { toast } = useOverlay();
  const [client, setClient] = useState("");
  const [emp, setEmp] = useState(employeeId ?? "");
  const [month, setMonth] = useState(THIS_MONTH);
  const [mark, setMark] = useState<AttStatus | "clear">("present");
  const [draft, setDraft] = useState<Record<string, AttStatus | null>>({});
  const staff = db.employees.filter((e) => e.lifecycle === "active" && (!client || e.client_id === client));

  const current = (d: string) => (d in draft ? draft[d]! : emp ? attendance(db, emp, d) : null);
  const tapDay = (d: string) => {
    if (!emp || d > TODAY) return;
    setDraft((x) => ({ ...x, [d]: mark === "clear" ? null : mark }));
  };
  const changed = Object.keys(draft).length;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Bulk mark by employee"
      subtitle="Pick a mark, then tap the days it applies to."
      full
      footer={
        <>
          <Button label="Discard" variant="secondary" full onPress={() => { setDraft({}); onClose(); }} />
          <Button
            label={changed ? `Save ${changed} day${changed > 1 ? "s" : ""}` : "Save"}
            full
            disabled={!changed}
            onPress={() => {
              commit((d) => { for (const [date, s] of Object.entries(draft)) { if (s) d.attOverride[`${emp}|${date}`] = s; else delete d.attOverride[`${emp}|${date}`]; } });
              toast(`${changed} day${changed > 1 ? "s" : ""} marked`);
              setDraft({});
              onClose();
            }}
          />
        </>
      }
    >
      <Select label="Client" clearable value={client} onChange={(v) => { setClient(v); setEmp(""); }} placeholder="All clients" options={db.clients.map((c) => ({ value: c.id, label: c.name }))} />
      <Select label="Employee" required searchable value={emp} onChange={(v) => { setEmp(v); setDraft({}); }} options={staff.map((e) => ({ value: e.id, label: e.name, sub: `${e.code} · ${clientName(db, e.client_id)}` }))} />
      <MonthStepper month={month} onChange={(m) => { setMonth(m); }} />
      <View style={{ marginVertical: 12 }}>
        <Chips
          value={mark}
          onChange={setMark}
          items={[...PICKABLE.map((s) => ({ key: s as AttStatus | "clear", label: MARK[s].label })), { key: "clear", label: "Clear" }]}
        />
      </View>
      {emp ? (
        <MonthGrid
          month={month}
          onPress={tapDay}
          render={(d) => {
            const s = current(d);
            return <MarkTag s={s} />;
          }}
        />
      ) : (
        <T v="small" muted center style={{ paddingVertical: 24 }}>Choose an employee to load their month.</T>
      )}
    </Sheet>
  );
}
