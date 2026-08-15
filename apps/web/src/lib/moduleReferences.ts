import { useEffect, useMemo, useState } from "react";
import type { DepartmentMember, JobMember, Party } from "@projelio/shared";
import { api } from "../api/client";
import { displayReference, type ModuleFieldConfig, type ModuleRecordConfig } from "./moduleConfigs";

/**
 * Referans alanlarının (entity_ref / user_ref) seçenekleri ve ad çözümlemesi.
 *
 * Kayıtta id saklanır, ekranda ad gösterilir. Ama bu alanlar önceden serbest
 * metindi ve eski kayıtlarda ham ad duruyor olabilir — çözümleyici UUID
 * olmayan değerleri olduğu gibi bırakır, böylece hiçbir veri kaybolmaz.
 * Bkz. moduleConfigs/shared.ts displayReference
 */

export interface ReferenceOption {
  id: string;
  label: string;
  /** Seçicide ikinci satır (rol, unvan, iletişim). */
  hint?: string;
}

export interface ReferenceSource {
  parties: ReferenceOption[];
  users: ReferenceOption[];
  /** id -> ad. Bulunamazsa undefined döner. */
  resolve: (id: string) => string | undefined;
  loading: boolean;
  /** Yeni müşteri açıldıktan sonra listeyi tazelemek için. */
  reload: () => void;
}

interface Scope {
  organizationId?: string;
  departmentId?: string;
  jobId?: string;
}

export function useModuleReferences(scope: Scope, enabled: boolean): ReferenceSource {
  const [parties, setParties] = useState<ReferenceOption[]>([]);
  const [users, setUsers] = useState<ReferenceOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  const { organizationId, departmentId, jobId } = scope;

  useEffect(() => {
    // Yalnızca referans alanı olan modüllerde istek atılır; her modül açılışında
    // iki gereksiz sorgu yapmanın anlamı yok.
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);

    const partyPath = jobId ? `/jobs/${jobId}/party` : `/organizations/${organizationId}/party`;
    const memberPath = jobId ? `/jobs/${jobId}/members` : departmentId ? `/departments/${departmentId}/members` : null;

    Promise.all([
      api.get<Party[]>(partyPath).catch(() => []),
      memberPath ? api.get<(DepartmentMember | JobMember)[]>(memberPath).catch(() => []) : Promise.resolve([]),
    ])
      .then(([p, m]) => {
        if (cancelled) return;
        setParties(
          p.map((x) => ({
            id: x.id,
            label: x.displayName,
            hint: [x.email, x.phone].filter(Boolean).join(" · ") || undefined,
          }))
        );
        setUsers(
          m
            // İş ekibinde daveti bekleyen/reddeden kayıtlar da dönebiliyor;
            // referans alanında yalnızca fiilen ekipte olanlar listelenmeli.
            .filter((x: any) => x.userId && (x.status ?? "approved") === "approved")
            .map((x: any) => ({
              id: x.userId as string,
              label: x.fullName ?? x.username ?? x.email ?? "İsimsiz",
              hint: x.title ?? undefined,
            }))
        );
      })
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [enabled, organizationId, departmentId, jobId, tick]);

  const resolve = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of parties) map.set(p.id, p.label);
    for (const u of users) map.set(u.id, u.label);
    return (id: string) => map.get(id);
  }, [parties, users]);

  return { parties, users, resolve, loading, reload: () => setTick((t) => t + 1) };
}

/** Modülün referans ya da hesaplanan alanı var mı. */
export function hasDynamicFields(config: ModuleRecordConfig): boolean {
  return config.fields.some((f) => f.type === "entity_ref" || f.type === "user_ref");
}

export function referenceOptionsFor(field: ModuleFieldConfig, source: ReferenceSource): ReferenceOption[] {
  return field.type === "user_ref" ? source.users : source.parties;
}

/**
 * summary/detail fonksiyonlarına verilecek "gösterim verisi".
 *
 * Modül tanımları ham veriyi okur (`d.customerName`); alan referansa
 * çevrildiğinde orada artık UUID durur ve ekranda kimlik görünürdü. Bu yüzden
 * panel, tanımlara ham veriyi değil adları çözülmüş bir kopyasını verir.
 * Hesaplanan (formula) alanlar da burada üretilir.
 *
 * computeStats bilinçli olarak HAM veriyle çalışmaya devam eder: orada sayım ve
 * toplama yapılır, ad gösterilmez.
 */
export function toDisplayData(
  config: ModuleRecordConfig,
  data: Record<string, unknown>,
  resolve: (id: string) => string | undefined
): Record<string, unknown> {
  let copy: Record<string, unknown> | null = null;
  const ensure = () => (copy ??= { ...data });

  for (const field of config.fields) {
    if (field.type === "entity_ref" || field.type === "user_ref") {
      const shown = displayReference(data[field.key], resolve);
      if (shown !== data[field.key]) ensure()[field.key] = shown;
    } else if (field.type === "formula" && field.compute) {
      ensure()[field.key] = field.compute(data);
    }
  }
  return copy ?? data;
}
