// Serbest çalışanın 3D ofisi: "Stüdyom" (web: pages/Yeni.tsx, components/ofis3d/).
//
// Şirket ofisinde her departman bir oda; stüdyoda her serbest İŞ bir oda
// (Music Production, Video Editing…). Odada işin sahibi yönetici masasında,
// işe davet edilip kabul eden ekip ekip masalarında oturur; işte açık modüller
// departmandaki gibi eşya olarak durur, işin Bütçe'si sahibine kasa olur.
//
// Şirkete ya da holdinge bağlı işler stüdyoya girmez: onlar şirketin
// departmanlarında zaten yer alıyor.

import type { Job, JobMember, Project, Task } from "@projelio/shared";
import { KASA_MODULU, KUPA_RAFI, PROJE_ONEKI, RAF_KAPASITESI, type IstasyonBilgisi, type Plaket } from "./ofisOyunu";

export interface StudyoIsi {
  job: Job;
  /** Onaylı iş ekibi (sahip hariç). */
  uyeler: JobMember[];
  /** İşte açık modül anahtarları. */
  moduller: string[];
  /** İşin arşivlenmemiş projeleri (bitenler kupa rafında plaket olur). */
  projeler: Project[];
  /** Bitmemiş projelerin görevleri (alt görevler dahil: aktif görev alt görev olabilir). */
  gorevler: Task[];
}

/** Odanın döşemesi: işin adından (müzik stüdyosu, kurgu odası…). */
export type IsTemasi = "muzik" | "video" | "foto" | "tasarim";

export function isTemasi(ad: string): IsTemasi | undefined {
  const a = ad.toLocaleLowerCase("tr");
  // Kısa kelimeler ("ses", "mix") yalnızca kelime başında: "Profesyonel" gibi adlara takılmasın.
  if (/müzik|muzik|music|prodüksiyon|production|(^|\s)(ses|mix|beat)|audio|sound|şarkı|podcast/.test(a)) return "muzik";
  if (/video|film|kurgu|edit|montaj|sinema|youtube|animasyon/.test(a)) return "video";
  if (/fotoğraf|fotograf|photo|çekim/.test(a)) return "foto";
  if (/tasarım|tasarim|design|grafik|illüstrasyon|illustrasyon|logo|marka|çizim/.test(a)) return "tasarim";
  return undefined;
}

/** Teslime bu kadar gün ya da daha az kaldıysa istasyonun ışığı sarı yanar. */
const YAKLASTI_GUN = 3;

export interface StudyoOdasi {
  id: string;
  ad: string;
  tema?: IsTemasi;
  moduller: { key: string; ad: string; bilgi?: IstasyonBilgisi }[];
  /** istasyon: kişinin üzerinde çalıştığı görevin projesinin istasyonu (orada ayakta çalışır). */
  kisiler: { id: string; ad: string; emek?: number; yonetici?: boolean; istasyon?: string }[];
  acikGorev: number;
  gecikmis: number;
}

/** Stüdyoya giren işler: şirkete/holdinge bağlı olmayan, arşivlenmemiş işler. */
export function serbestIsMi(j: Job): boolean {
  return !j.organizationId && !j.groupId && !j.archivedAt;
}

export function studyoOdalari(
  isler: StudyoIsi[],
  opt: { benId?: string; benAd?: string; benAktifGorev?: string; bugun: string; modulAdi: (key: string) => string | undefined }
): StudyoOdasi[] {
  const gunFarki = (a: string, b: string) => Math.round((Date.parse(a.slice(0, 10)) - Date.parse(b)) / 86_400_000);
  return isler.map(({ job, uyeler, moduller, projeler, gorevler: tumGorevler }) => {
    // Sayımlar üst görevlerle; aktif görev ise alt görev de olabilir.
    const gorevler = tumGorevler.filter((t) => !t.parentTaskId);
    const sahipAd = job.ownerId === opt.benId ? opt.benAd : job.ownerName;
    const kisiler: StudyoOdasi["kisiler"] = [{ id: job.ownerId, ad: sahipAd || "İşin sahibi", yonetici: true }];
    for (const u of uyeler) {
      if (u.status !== "approved" || u.userId === job.ownerId || kisiler.some((k) => k.id === u.userId)) continue;
      kisiler.push({ id: u.userId, ad: u.fullName || u.username || "Ekip üyesi" });
    }
    const emek = new Map<string, number>();
    for (const t of gorevler) if (t.status === "completed" && t.completedBy) emek.set(t.completedBy, (emek.get(t.completedBy) ?? 0) + 1);
    for (const k of kisiler) k.emek = emek.get(k.id) ?? 0;
    const acik = gorevler.filter((t) => t.status !== "completed" && !t.archivedAt);
    const canli = projeler.filter((p) => !p.archivedAt && p.status !== "archived");
    const biten = canli.filter((p) => p.status === "completed");
    // Projede bitiş anı tutulmuyor: teslim günü (yoksa açılış) en yakın olan en yeni sayılır.
    const plaketTarihi = (p: Project) => (p.deadline || p.createdAt || "").slice(0, 10);
    const plaketler: Plaket[] = [...biten]
      .sort((a, b) => plaketTarihi(b).localeCompare(plaketTarihi(a)))
      .slice(0, RAF_KAPASITESI)
      .map((p) => ({ projeId: p.id, ad: p.title, kapak: p.coverImageUrl || undefined, tarih: plaketTarihi(p) || undefined }));
    const suren = canli.filter((p) => p.status !== "completed");
    // Kişi "üzerinde çalışıyorum" dediği görevin projesinin istasyonunda durur
    // (proje bu işin süren projelerinden biriyse).
    const aktif = new Map(uyeler.filter((u) => u.activeTaskId).map((u) => [u.userId, u.activeTaskId as string]));
    if (opt.benId && opt.benAktifGorev) aktif.set(opt.benId, opt.benAktifGorev);
    const sureni = new Set(suren.map((p) => p.id));
    for (const k of kisiler) {
      const proje = tumGorevler.find((t) => t.id === aktif.get(k.id))?.projectId;
      if (proje && sureni.has(proje)) k.istasyon = `${PROJE_ONEKI}${proje}`;
    }
    return {
      id: job.id,
      ad: job.title,
      tema: isTemasi(job.title),
      // Sıra duvara konma sırasıdır (sığmayan yalnızca panelde görünür): önce
      // projeler (teslimi en yakın önce), sonra kasa ve kupa rafı, en son modüller.
      moduller: [
        ...suren
          .sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"))
          .map((p) => {
            const ust = gorevler.filter((t) => t.projectId === p.id);
            const kalan = p.deadline ? gunFarki(p.deadline, opt.bugun) : undefined;
            const bilgi: IstasyonBilgisi = {
              biten: ust.filter((t) => t.status === "completed").length,
              toplam: ust.length,
              teslim: p.deadline?.slice(0, 10) || undefined,
              gecikti: kalan !== undefined && kalan < 0,
              yaklasti: kalan !== undefined && kalan >= 0 && kalan <= YAKLASTI_GUN,
            };
            return { key: `${PROJE_ONEKI}${p.id}`, ad: p.title, bilgi };
          }),
        // İşin Bütçe sekmesi sahibine odada kasa olarak durur.
        ...(job.ownerId === opt.benId ? [{ key: KASA_MODULU, ad: "Kasa" }] : []),
        ...(biten.length ? [{ key: KUPA_RAFI, ad: `Biten projeler (${biten.length})`, bilgi: { biten: 0, toplam: 0, kupa: biten.length, plaketler } }] : []),
        ...moduller.map((key) => ({ key, ad: opt.modulAdi(key) ?? key })),
      ],
      kisiler,
      acikGorev: acik.length,
      gecikmis: acik.filter((t) => t.deadline && t.deadline.slice(0, 10) < opt.bugun).length,
    };
  });
}
