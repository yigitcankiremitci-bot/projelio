import { useEffect, useState } from "react";
import type { ModuleStatsResponse, ModuleUsageStat } from "@projelio/shared";
import { api } from "../api/client";
import { resolveModuleTabs, type ModuleTab } from "./moduleLayout";
import { useIsDesktop } from "./useIsDesktop";

/**
 * Sekme çubuğuna çıkacak modüller.
 *
 * Karar saf fonksiyonda (moduleLayout.ts); bu kanca yalnızca onu veriyle besler
 * ve sonucu önbelleğe alır.
 *
 * Önbellek neden var: sekme çubuğunun oturum ortasında değişmemesi gerekiyor.
 * Kullanıcının gezinmede en çok güvendiği şey sekmenin dünkü yerinde olması;
 * her sayfa yüklemesinde yeniden hesaplamak sekmeleri oynatırdı. 24 saat taze
 * kabul edilir, sonra bir önceki liste "previous" olarak verilip yeniden
 * hesaplanır (histerezis oradan çalışır).
 *
 * Bkz. docs/moduller/24-yerlesim-modul-yuzeyleri.md §3.3
 */

export interface ModuleTabItem extends ModuleTab {
  /** Serbest çalışan tarafında modülün açılacağı iş. */
  jobId?: string;
}

interface Cache {
  at: number;
  tabs: ModuleTabItem[];
}

const FRESH_MS = 24 * 60 * 60 * 1000;

function cacheKey(scope: string): string {
  return `projelio_module_tabs_${scope}`;
}

function readCache(scope: string): Cache | null {
  try {
    const raw = localStorage.getItem(cacheKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cache;
    return Array.isArray(parsed.tabs) ? parsed : null;
  } catch {
    // Bozuk önbellek sekmeleri kaybettirmemeli; yok sayılır ve yeniden hesaplanır.
    return null;
  }
}

/**
 * @param organizationId verilirse organizasyon bağlamı, verilmezse serbest
 *   çalışanın kendi işleri.
 */
export function useModuleTabs(organizationId?: string): ModuleTabItem[] {
  const isDesktop = useIsDesktop();
  const [tabs, setTabs] = useState<ModuleTabItem[]>([]);

  useEffect(() => {
    // Mobilde modül sekmesi hiç çıkmaz (bkz. slotCount). Boşuna istek atma.
    if (!isDesktop) {
      setTabs([]);
      return;
    }

    const scope = organizationId ?? "me";
    const cached = readCache(scope);
    const now = Date.now();

    if (cached && now - cached.at < FRESH_MS) {
      setTabs(cached.tabs);
      return;
    }

    let cancelled = false;
    const path = organizationId ? `/organizations/${organizationId}/module-stats` : "/me/module-stats";

    api
      .get<ModuleStatsResponse>(path)
      .then((stats) => {
        if (cancelled) return;
        const resolved = resolveModuleTabs({
          size: stats.size,
          modules: stats.modules.map((m: ModuleUsageStat) => ({
            key: m.moduleKey,
            name: m.moduleName,
            recordCount: m.recordCount,
            lastActivityAt: m.lastActivityAt,
            enabledAt: m.enabledAt,
            assignedToMe: m.assignedToMe,
          })),
          now: new Date().toISOString(),
          isMobile: false,
          previous: cached?.tabs.map((t) => t.key),
        });

        const jobByKey = new Map(stats.modules.map((m) => [m.moduleKey, m.jobId]));
        const next: ModuleTabItem[] = resolved.map((t) => ({ ...t, jobId: jobByKey.get(t.key) }));

        setTabs(next);
        try {
          localStorage.setItem(cacheKey(scope), JSON.stringify({ at: now, tabs: next }));
        } catch {
          // Depolama kotası dolu ya da kapalı: sekmeler yine çalışır, yalnızca
          // her yüklemede yeniden hesaplanır.
        }
      })
      .catch(() => {
        // Gösterge alınamadıysa sekme çubuğu çekirdek sekmelerle kalır —
        // eldeki önbellek varsa o gösterilir.
        if (!cancelled && cached) setTabs(cached.tabs);
      });

    return () => {
      cancelled = true;
    };
  }, [organizationId, isDesktop]);

  return tabs;
}
