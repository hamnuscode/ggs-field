// The one data seam. Screens read `db` and write through `commit()`.
// Demo mode: `db` is the in-memory fixture set; writes stay on this device.
// Live mode: replace the bodies of these reads/writes with supabase `.from()`
// reads and the existing RPCs — never raw writes to money or gated tables
// (build brief, "Backend rules").
import React, { createContext, useCallback, useContext, useState } from "react";
import * as seed from "./seed";
import type { AttStatus, Shift } from "./seed";

type Extra = {
  attOverride: Record<string, AttStatus>; // `${employeeId}|${date}`
  reportOverride: Record<string, "awaiting" | "reported" | "confirmed">; // `${siteId}|${shift}|${date}`
  shiftOverride: Record<string, Shift>;
};

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
export type DB = Mutable<typeof seed> & Extra;

const db: DB = { ...seed, attOverride: {}, reportOverride: {}, shiftOverride: {} } as DB;

const Ctx = createContext<{ db: DB; v: number; commit: (fn: (db: DB) => void) => void } | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [v, setV] = useState(0);
  const commit = useCallback((fn: (d: DB) => void) => {
    fn(db);
    setV((x) => x + 1);
  }, []);
  return <Ctx.Provider value={{ db, v, commit }}>{children}</Ctx.Provider>;
}

export function useDB() {
  const c = useContext(Ctx);
  if (!c) throw new Error("DataProvider missing");
  return c;
}

// ---------- pure selectors (no DOM, safe to share with web) ----------
export const clientName = (d: DB, id: string | null | undefined) => (id ? d.clients.find((c) => c.id === id)?.name ?? "—" : "Office");
export const siteName = (d: DB, id: string | null | undefined) => (id ? d.sites.find((s) => s.id === id)?.name ?? "—" : "—");
export const employee = (d: DB, id: string) => d.employees.find((e) => e.id === id);

export function attendance(d: DB, empId: string, date: string): AttStatus | null {
  return d.attOverride[`${empId}|${date}`] ?? seed.statusFor(empId, date);
}

export function reportState(d: DB, siteId: string, shift: Shift, date: string) {
  const o = d.reportOverride[`${siteId}|${shift}|${date}`];
  if (o) return o;
  if (date < seed.TODAY) return "confirmed";
  if (date > seed.TODAY) return "awaiting";
  return d.siteReports.find((r) => r.site_id === siteId && r.shift === shift)?.state ?? "awaiting";
}

export function roster(d: DB, siteId: string, shift: Shift) {
  return d.employees.filter((e) => e.site_id === siteId && (d.shiftOverride[e.id] ?? e.shift) === shift && e.lifecycle === "active");
}

export function receivableFor(d: DB, clientId: string) {
  const inv = d.invoices.filter((i) => i.client_id === clientId);
  const invoiced = inv.reduce((a, i) => a + i.amount, 0);
  const received = inv.reduce((a, i) => a + i.payments.reduce((b, p) => b + p.amount, 0), 0);
  const wht = inv.reduce((a, i) => a + i.payments.reduce((b, p) => b + p.wht, 0), 0);
  const opening = d.openingReceivable[clientId] ?? 0;
  return { opening, invoiced, received, wht, outstanding: opening + invoiced - received - wht };
}

export const invoiceReceived = (i: seed.Invoice) => i.payments.reduce((a, p) => a + p.amount + p.wht, 0);

export function accountBalances(d: DB) {
  const m: Record<string, { debit: number; credit: number }> = {};
  for (const j of d.journal) for (const l of j.lines) {
    m[l.account] ??= { debit: 0, credit: 0 };
    m[l.account]!.debit += l.debit;
    m[l.account]!.credit += l.credit;
  }
  return m;
}

/** lib/custodian.ts loadCustodianOptions: balance text only with banks.view (a data-exposure rule, handoff A5). */
export function custodianOptions(d: DB, canViewBanking: boolean) {
  return d.custodians.filter((c) => c.active).map((c) => ({
    value: c.id,
    label: canViewBanking ? `${c.holder} — holds PKR ${Math.round(c.held).toLocaleString("en-US")}` : c.holder,
    sub: c.location,
  }));
}

export function bankOptions(d: DB, canViewBanking: boolean) {
  return d.banks.map((b) => ({ value: b.id, label: b.name, sub: canViewBanking ? `${b.number} · PKR ${Math.round(b.balance).toLocaleString("en-US")}` : b.number }));
}
