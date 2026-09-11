import { useEffect, useMemo, useState } from "react";
import type { SchedulableTask } from "@projelio/shared";
import { gorevleriAra } from "@projelio/shared";
import { api, isAbortError } from "../api/client";

/** Öneri listesinde gösterilecek en fazla satır. */
const TAVAN = 8;
/** Bir kerede çekilen aday görev sayısı. */
const ADAY_TAVANI = 300;

/** Giriş kutusunun açılır listesindeki tek satır — her zaman bir görev. */
export interface Oneri {
  id: string;
  baslik: string;
  /** Nerede yaşadığı: projesi, departmanı, işi. */
  altBaslik?: string;
  /** Bağlantı için uygulama içi adres. */
  path: string;
  task: SchedulableTask;
}

/**
 * Yaptım'ın giriş kutusundaki görev araması.
 *
 * LİSTE YALNIZCA GÖREV VE ALT GÖREVLERDEN oluşuyor. Bir ara proje/iş/departman
 * da aynı listeye konmuştu; yanlıştı. Kutuya yazan kişi "az önce yaptığım iş"i
 * arıyor ve o neredeyse her zaman bir görev. Kapsayıcılar listeyi şişirip
 * görevleri aşağı itiyordu. Eşleşme çıkmadığında açılan "yeni oluştur" satırı,
 * kapsayıcı seçimini kendi penceresinde yapıyor (bkz. WorkLogComposer).
 *
 * TAMAMLANMIŞ GÖREVLER DE GELİYOR (includeCompleted): kullanıcı zaten
 * kapattığı bir işe sonradan süre yazabilmeli. Takvim seçicisi aynı ucu
 * tamamlanmışlar olmadan çağırıyor — orada biten işe zaman ayrılmıyor.
 *
 * LİSTE BİR KEZ ÇEKİLİYOR, EŞLEŞTİRME TARAYICIDA: her tuşta sunucuya gitmek
 * hem yavaştı hem de `ilike` ile ek/yazım toleransı yazılamıyordu
 * (bkz. shared/taskSearch.ts).
 */
export function useTaskSearch(query: string, enabled = true) {
  const [gorevler, setGorevler] = useState<SchedulableTask[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState("");
  const [deneme, setDeneme] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    setYukleniyor(true);
    setHata("");
    api
      .get<SchedulableTask[]>(
        `/planning/schedulable-tasks?limit=${ADAY_TAVANI}&includeCompleted=true`,
        ac.signal
      )
      .then((liste) => {
        setGorevler(liste);
        setHata("");
      })
      .catch((err) => {
        if (isAbortError(err) || ac.signal.aborted) return;
        // HATAYI YUTMUYORUZ: sessizce boş kalan liste, kullanıcıya "arama
        // çalışmıyor" dedirtiyor ve nedenini görebileceği hiçbir yer olmuyor.
        setHata(err instanceof Error ? err.message : "Görevlerin yüklenemedi");
      })
      .finally(() => {
        if (!ac.signal.aborted) setYukleniyor(false);
      });
    return () => ac.abort();
  }, [deneme]);

  const adaylar = useMemo<Oneri[]>(
    () =>
      gorevler.map((g) => ({
        id: g.id,
        baslik: g.title,
        altBaslik: [
          g.parentTaskId ? "alt görev" : null,
          g.status === "completed" ? "tamamlandı" : null,
          g.projectTitle ?? departmanEtiketi(g.departmentName, g.departmentOrganizationName) ?? g.operationTitle,
          g.jobTitle,
        ]
          .filter(Boolean)
          .join(" · "),
        path: g.projectId ? `/projects/${g.projectId}` : `/departments/${g.departmentId}?tab=tasks`,
        task: g,
      })),
    [gorevler]
  );

  const aranan = query.trim();

  const oneriler = useMemo(() => {
    // Tek harfte liste neredeyse her şeyi getiriyor; kullanıcı daha yazmayı
    // bitirmeden ekranı doldurmak yardımcı olmuyor.
    if (!enabled || aranan.length < 2) return [];
    return gorevleriAra(
      aranan,
      adaylar,
      (o) => ({
        baslik: o.baslik,
        baglam: [o.altBaslik],
        // Açık görevler kapanmışların önünde: kullanıcı çoğunlukla hâlâ
        // üzerinde çalıştığı işi kaydediyor.
        oncelik: o.task.status === "completed" ? 0 : 25,
      }),
      TAVAN
    );
  }, [aranan, adaylar, enabled]);

  return {
    oneriler,
    loading: yukleniyor,
    hata,
    adaySayisi: adaylar.length,
    tekrarDene: () => setDeneme((n) => n + 1),
  };
}

function departmanEtiketi(ad?: string, sirket?: string): string | undefined {
  if (!ad) return undefined;
  return sirket ? `${ad} · ${sirket}` : ad;
}
