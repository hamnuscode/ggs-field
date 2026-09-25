import React, { useState } from "react";
import { View } from "react-native";
import { Select, Sheet, useOverlay } from "../../components/Sheet";
import { T } from "../../components/Text";
import { Badge, Banner, Button, Input, ListCard, Row } from "../../components/ui";
import { Employee, Shift, TODAY } from "../../data/seed";
import { useDB } from "../../data/store";
import { fmtShort } from "../../lib/format";

export type EmpAction = "client" | "category" | "shift" | "transfer" | "fire" | "warnings" | null;

/** One host for the small HR sheets the web opens from Employees and Assignments & Pay. */
export function EmployeeActionSheets({ e, action, onClose }: { e: Employee | null; action: EmpAction; onClose: () => void }) {
  const { db, commit } = useDB();
  const { toast } = useOverlay();
  const [v1, setV1] = useState("");
  const [v2, setV2] = useState("");
  const [v3, setV3] = useState("");
  const reset = () => { setV1(""); setV2(""); setV3(""); onClose(); };
  if (!e) return null;
  const upd = (fn: (x: Employee) => void, msg: string) => {
    commit((d) => fn(d.employees.find((y) => y.id === e.id)!));
    toast(msg);
    reset();
  };
  const clientOpts = db.clients.filter((c) => c.status === "active").map((c) => ({ value: c.id, label: c.name }));
  const siteOpts = (cid: string) => db.sites.filter((s) => s.client_id === cid).map((s) => ({ value: s.id, label: s.name }));
  const lineOpts = (cid: string) => db.contracts.find((k) => k.client_id === cid)?.lines.map((l) => ({ value: l.id, label: l.category, sub: `${l.active}/${l.committed} posted` })) ?? [];

  return (
    <>
      <Sheet open={action === "client"} onClose={reset} title="Change client" subtitle={e.name}
        footer={<><Button label="Cancel" variant="secondary" full onPress={reset} /><Button label="Save" full disabled={!v1} onPress={() => upd((x) => { x.client_id = v1; x.site_id = v2 || null; x.line_id = v3 || null; x.category = "client"; }, `${e.name} moved`)} /></>}>
        <Select label="Client" required value={v1} onChange={(v) => { setV1(v); setV2(""); setV3(""); }} options={clientOpts} />
        {v1 ? <Select label="Site" value={v2} onChange={setV2} options={siteOpts(v1)} /> : null}
        {v1 ? <Select label="Contract line" value={v3} onChange={setV3} options={lineOpts(v1)} /> : null}
      </Sheet>

      <Sheet open={action === "category"} onClose={reset} title="Change category" subtitle={e.name}
        footer={<><Button label="Cancel" variant="secondary" full onPress={reset} /><Button label="Save" full disabled={!v1} onPress={() => upd((x) => { x.category = v1 as Employee["category"]; if (v1 !== "client") { x.client_id = null; x.site_id = null; } }, "Category changed")} /></>}>
        <Select label="Category" required value={v1 || e.category} onChange={setV1} options={[{ value: "client", label: "Client post" }, { value: "office_staff", label: "Office staff" }, { value: "reliever", label: "Reliever" }]} />
      </Sheet>

      <Sheet open={action === "shift"} onClose={reset} title={`Change shift — ${e.name}`}
        footer={<><Button label="Cancel" variant="secondary" full onPress={reset} /><Button label="Save" full disabled={!v1} onPress={() => upd((x) => { x.shift = v1 as Shift; }, "Shift changed")} /></>}>
        <Select label="Shift" required value={v1 || e.shift} onChange={setV1} options={[{ value: "day", label: "Day" }, { value: "night", label: "Night" }, { value: "evening", label: "Evening" }]} />
        <Input label="Effective from" value={v2 || TODAY} onChangeText={setV2} />
      </Sheet>

      <Sheet open={action === "transfer"} onClose={reset} title={`Transfer ${e.name}`}
        footer={<><Button label="Cancel" variant="secondary" full onPress={reset} /><Button label="Transfer" full disabled={!v1 || !v2} onPress={() => upd((x) => { x.client_id = v1; x.site_id = v2; }, `${e.name} transferred`)} /></>}>
        <Select label="To client" required value={v1} onChange={(v) => { setV1(v); setV2(""); }} options={clientOpts} />
        {v1 ? <Select label="To site" required value={v2} onChange={setV2} options={siteOpts(v1)} /> : null}
        <Input label="Reason" value={v3} onChangeText={setV3} multiline />
      </Sheet>

      <Sheet open={action === "fire"} onClose={reset} title={`Fire / Resign — ${e.name}`}
        footer={<><Button label="Cancel" variant="secondary" full onPress={reset} /><Button label="Confirm" variant="danger" full disabled={!v1 || !v2} onPress={() => upd((x) => { x.lifecycle = "terminated"; x.status = "Fired"; x.left_on = TODAY; }, `${e.name} removed from roster`)} /></>}>
        <Banner tone="danger" title="This ends the posting today" sub="A vacancy opens on their line and clearance starts for issued kit." />
        <Select label="Type" required value={v1} onChange={setV1} options={[{ value: "fired", label: "Fired" }, { value: "resigned", label: "Resigned" }, { value: "absconded", label: "Absconded" }]} />
        <Input label="Reason" required value={v2} onChangeText={setV2} multiline />
      </Sheet>

      <Sheet open={action === "warnings"} onClose={reset} title={`Disciplinary warnings — ${e.name}`}
        footer={<><Button label="Close" variant="secondary" full onPress={reset} /><Button label="Issue warning" full disabled={!v1} onPress={() => upd((x) => { x.warnings += 1; }, "Warning issued")} /></>}>
        <ListCard style={{ marginBottom: 16 }}>
          {e.warnings ? (
            <Row last title="Late to post twice in a week" meta={fmtShort(TODAY)} right={<Badge label="Written" tone="warning" small />} />
          ) : (
            <View style={{ padding: 14 }}><T v="small" muted>No warnings on record.</T></View>
          )}
        </ListCard>
        <Input label="New warning" value={v1} onChangeText={setV1} multiline placeholder="What happened" />
      </Sheet>
    </>
  );
}
