import { useEffect, useMemo, useState } from "react";
import type { ModuleRecord, OrganizationModule, Party } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import { MODULE_RECORD_CONFIGS } from "../lib/moduleConfigs";
import {
  PERIOD_KEYS,
  buildPeriod,
  inPeriod,
  panelSourceKeys,
  type PanelConfig,
  type PanelContext,
  type PeriodKey,
} from "../lib/panelConfigs";

interface Props {
  config: PanelConfig;
  organizationId?: string;
  jobId?: string;
}

/**
 * A6 — Türev panel görünümü.
 *
 * Veri girişi yoktur: kaynak modüllerin kayıtlarını okur, dönem filtresi
 * uygular ve gösterge üretir. Tek bileşen 11 modülü birden karşılıyor.
 *
 * Grafik kütüphanesi kullanılmıyor — kırılımlar CSS çubuklarıyla çiziliyor,
 * yeni bağımlılık eklemeye değecek bir kazanç yok.
 */
export default function ModulePanelView({ config, organizationId, jobId }: Props) {
  const c = colors.light;
  const [periodKey, setPeriodKey] = useState<PeriodKey>("this_month");
  const [allRecords, setAllRecords] = useState<ModuleRecord[]>([]);
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);

  const sourceKeys = useMemo(() => panelSourceKeys(config), [config]);

  useEffect(() => {
    setLoading(true);
    const recordPath = jobId ? `/jobs/${jobId}/module-records` : `/organizations/${organizationId}/module-records`;
    const partyPath = jobId ? `/jobs/${jobId}/party` : `/organizations/${organizationId}/party`;

    Promise.all([
      // Tek istekte tüm kayıtlar: panel birkaç modülden birden okuyor, her biri
      // için ayrı istek atmak gereksiz gidiş-geliş olurdu.
      api.get<ModuleRecord[]>(recordPath).catch(() => []),
      jobId
        ? Promise.resolve<OrganizationModule[]>([])
        : api.get<OrganizationModule[]>(`/organizations/${organizationId}/modules`).catch(() => []),
      api.get<Party[]>(partyPath).catch(() => []),
    ])
      .then(([records, mods, p]) => {
        setAllRecords(records);
        setEnabled(new Set(mods.map((m) => m.moduleKey)));
        setParties(p);
      })
      .finally(() => setLoading(false));
  }, [organizationId, jobId]);

  const period = useMemo(() => buildPeriod(periodKey), [periodKey]);

  const ctx: PanelContext = useMemo(() => {
    const byModule = new Map<string, ModuleRecord[]>();
    for (const key of sourceKeys) byModule.set(key, []);
    for (const r of allRecords) {
      if (!byModule.has(r.moduleKey)) continue;
      if (!inPeriod(r, r.moduleKey, period)) continue;
      byModule.get(r.moduleKey)!.push(r);
    }
    return {
      records: byModule,
      enabledModules: enabled,
      period,
      partyCount: parties.length,
      customerCount: parties.filter((p) => p.roles.includes("customer")).length,
    };
  }, [allRecords, sourceKeys, period, enabled, parties]);

  // Kaynağı kapalı olan modüller: panel boş görünürse sebebini söylemeli,
  // kullanıcı "bozuk" sanmamalı.
  const missingSources = useMemo(
    () =>
      sourceKeys.filter(
        (k) => MODULE_RECORD_CONFIGS[k] && !enabled.has(k) && !jobId && (ctx.records.get(k)?.length ?? 0) === 0
      ),
    [sourceKeys, enabled, ctx, jobId]
  );

  const exportBreakdowns = () => {
    // Bağımlılıksız CSV: panelin gördüğü her kırılım satır satır.
    const lines: string[] = [`Panel;${config.title}`, `Dönem;${period.label}`, ""];
    for (const b of config.breakdowns ?? []) {
      lines.push(b.title);
      for (const row of b.compute(ctx)) lines.push(`${row.label};${row.display ?? row.value}`);
      lines.push("");
    }
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${config.title}-${period.key}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>Yükleniyor…</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <h5 style={{ fontSize: 14, fontWeight: 500, color: c.textPrimary, margin: 0 }}>{config.title}</h5>
          <p style={{ fontSize: 12, color: c.textSecondary, margin: "2px 0 0" }}>{config.purpose}</p>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <select
            value={periodKey}
            onChange={(e) => setPeriodKey(e.target.value as PeriodKey)}
            style={{ fontSize: 13, padding: "5px 6px" }}
            aria-label="Dönem"
          >
            {PERIOD_KEYS.map((k) => (
              <option key={k} value={k}>
                {buildPeriod(k).label}
              </option>
            ))}
          </select>
          {(config.breakdowns?.length ?? 0) > 0 && (
            <button
              onClick={exportBreakdowns}
              style={{ fontSize: 12, color: c.primary, background: "transparent", border: "none", cursor: "pointer" }}
            >
              Dışa aktar
            </button>
          )}
        </div>
      </div>

      {config.scopeNote && (
        <div
          style={{
            fontSize: 12,
            color: c.textSecondary,
            background: c.background,
            border: `1px solid ${c.border}`,
            borderRadius: 8,
            padding: "8px 10px",
          }}
        >
          {config.scopeNote}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
        {config.metrics.map((metric) => {
          const hint = metric.hint?.(ctx);
          return (
            <div
              key={metric.label}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                padding: "10px 12px",
                borderRadius: 10,
                background: c.background,
                border: `1px solid ${c.border}`,
              }}
            >
              <span style={{ fontSize: 11, color: c.textSecondary }}>{metric.label}</span>
              <span style={{ fontSize: 17, fontWeight: 500, color: c.textPrimary }}>{metric.compute(ctx)}</span>
              {hint && <span style={{ fontSize: 11, color: c.textSecondary }}>{hint}</span>}
            </div>
          );
        })}
      </div>

      {config.breakdowns?.map((breakdown) => {
        const rows = breakdown.compute(ctx);
        const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
        return (
          <div key={breakdown.title} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: c.textPrimary }}>{breakdown.title}</span>
            {rows.length === 0 ? (
              <p style={{ fontSize: 12, color: c.textSecondary, margin: 0 }}>
                {breakdown.emptyLabel ?? "Veri yok."}
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {rows.slice(0, 10).map((row) => (
                  <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        fontSize: 12,
                        color: c.textPrimary,
                        width: 120,
                        flexShrink: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={row.label}
                    >
                      {row.label}
                    </span>
                    <div style={{ flex: 1, height: 8, background: c.background, borderRadius: 4, overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${(Math.abs(row.value) / max) * 100}%`,
                          height: "100%",
                          // Negatif değer (ör. zararla kapanan ay) ayrı renkte.
                          background: row.value < 0 ? c.danger : c.primary,
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 12, color: c.textSecondary, flexShrink: 0 }}>
                      {row.display ?? row.value}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {missingSources.length > 0 && (
        <div
          style={{
            fontSize: 12,
            color: c.textSecondary,
            borderTop: `1px solid ${c.border}`,
            paddingTop: 8,
          }}
        >
          Bu panel şu modüllerden de okur ama onlar henüz etkin değil:{" "}
          {missingSources.map((k) => MODULE_RECORD_CONFIGS[k]?.title ?? k).join(", ")}.
        </div>
      )}
    </div>
  );
}
