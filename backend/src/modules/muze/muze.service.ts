import { Injectable, NotFoundException } from "@nestjs/common";
import { muzeProjeDurumu, plaketiGorebilir, type MuzeKatkisi, type MuzePlaketi } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { AccessService } from "../../common/access/access.service";

/**
 * Müze: biten projelerin plaketleri (migration 189).
 *
 * Burada YALNIZCA OKUMA var. Plaketi veritabanı basar (`projects` üzerindeki
 * tetikleyici, projeyi "tamamlandı"ya çeviren her yolu kapsar) ve değişmezliği
 * de veritabanı korur — yazma, düzenleme ya da silme ucu bilerek yok.
 *
 * Görme kuralı `plaketiGorebilir` (packages/shared/src/muze.ts): bitiş anında
 * projede olanlar + işi bugün yönetenler + şirket proje alanının plaketlerinde
 * şirketin bütün çalışanları (migration 191).
 */
@Injectable()
export class MuzeService {
  constructor(
    private supabase: SupabaseService,
    private access: AccessService
  ) {}

  async listForUser(userId: string): Promise<MuzePlaketi[]> {
    const db = this.supabase.client;

    // 1) Katılımcısı olduğu plaketler — kesin görür.
    const { data: kendi, error } = await db.from("muze_plaketleri").select("*").contains("katilimci_ids", [userId]);
    if (error) throw error;
    const satirlar = new Map<string, any>((kendi ?? []).map((r: any) => [r.id, r]));
    const katilimci = new Set(satirlar.keys());

    // 2) Yönettiği kapsamların plaketleri — aday; aşağıda işin bugünkü
    //    yöneticisi mi diye ayrıca doğrulanır.
    const adaylar: any[] = [];
    const { data: isler } = await db.from("jobs").select("id").eq("owner_id", userId);
    const isIds = (isler ?? []).map((j: any) => j.id);
    if (isIds.length) {
      const { data } = await db.from("muze_plaketleri").select("*").in("job_id", isIds);
      adaylar.push(...(data ?? []));
    }
    const orgIds = await this.yonettigiSirketler(userId);
    if (orgIds.length) {
      const { data } = await db.from("muze_plaketleri").select("*").in("organization_id", orgIds);
      adaylar.push(...(data ?? []));
    }
    // Şirket proje alanının plaketleri: çalıştığı şirketlerin hepsi (taşeronda boş).
    const calistigi = new Set(await this.access.calistigiSirketler(userId));
    if (calistigi.size) {
      const { data } = await db
        .from("muze_plaketleri")
        .select("*")
        .in("organization_id", [...calistigi])
        .eq("sirket_geneli", true);
      adaylar.push(...(data ?? []));
    }
    const { data: gruplar } = await db.from("groups").select("id").eq("owner_id", userId);
    const grupIds = (gruplar ?? []).map((g: any) => g.id);
    if (grupIds.length) {
      const { data } = await db.from("muze_plaketleri").select("*").in("group_id", grupIds);
      adaylar.push(...(data ?? []));
    }

    const yonetim = new Map<string, Promise<boolean>>();
    const isiYonetiyor = (jobId: string | null) => {
      if (!jobId) return Promise.resolve(false);
      let p = yonetim.get(jobId);
      if (!p) {
        p = this.access.seesAllProjectsOfJob(jobId, userId).catch(() => false);
        yonetim.set(jobId, p);
      }
      return p;
    };

    // İşi silinmiş plaket: kapsamı (şirket/holding) sorgu 2'de zaten
    // yönettikleri arasından geldi; yalnızca taşeron olmadığı doğrulanır.
    const mevcutIsler = await this.mevcutIsler(adaylar.map((r) => r.job_id));
    const taseron = await this.access.isSubcontractor(userId);
    for (const r of adaylar) {
      if (satirlar.has(r.id)) continue;
      const sirketGeneli = r.sirket_geneli === true;
      const sirketCalisani = !!r.organization_id && calistigi.has(r.organization_id);
      if (plaketiGorebilir({ katilimciMi: false, isiYonetiyor: false, sirketGeneli, sirketCalisani })) {
        satirlar.set(r.id, r);
        continue;
      }
      const yonetiyor = r.job_id && mevcutIsler.has(r.job_id) ? await isiYonetiyor(r.job_id) : !taseron;
      if (plaketiGorebilir({ katilimciMi: false, isiYonetiyor: yonetiyor })) satirlar.set(r.id, r);
    }

    const liste = [...satirlar.values()];
    const durumlar = await this.projeDurumlari(liste, userId, isiYonetiyor);
    return liste
      .map((r) => {
        const d = durumlar.get(r.project_id);
        return { ...mapPlaket(r, d?.durum ?? "kapali"), projeGuncelAdi: d?.ad };
      })
      .sort((a, b) => b.bitis.localeCompare(a.bitis));
  }

  async findOne(id: string, userId: string): Promise<MuzePlaketi> {
    const plaket = (await this.listForUser(userId)).find((p) => p.id === id || p.projectId === id);
    // Görülemeyen plaket ile hiç olmayan plaket dışarıdan ayırt edilmez.
    if (!plaket) throw new NotFoundException("Plaket bulunamadı");
    return plaket;
  }

  /** Sahibi olduğu ya da bir departmanını yönettiği şirketler. */
  private async yonettigiSirketler(userId: string): Promise<string[]> {
    const db = this.supabase.client;
    const ids = new Set<string>();
    const { data: sahip } = await db.from("organizations").select("id").eq("owner_id", userId);
    for (const o of sahip ?? []) ids.add((o as any).id);
    const { data: yonetici } = await db
      .from("department_members")
      .select("departments(organization_id)")
      .eq("user_id", userId)
      .eq("role", "manager")
      .eq("status", "approved");
    for (const m of yonetici ?? []) {
      const org = (m as any).departments?.organization_id;
      if (org) ids.add(org);
    }
    return [...ids];
  }

  private async mevcutIsler(jobIds: (string | null)[]): Promise<Set<string>> {
    const ids = [...new Set(jobIds.filter((x): x is string => !!x))];
    if (!ids.length) return new Set();
    const { data } = await this.supabase.client.from("jobs").select("id").in("id", ids);
    return new Set((data ?? []).map((j: any) => j.id));
  }

  /**
   * Kaynak projelerin bugünkü hâli ("Arşivde aç" bağlantısı buna göre).
   * Görme kuralı proje sayfasınınkiyle aynı: sahip, onaylı üye ya da işi yöneten
   * (AccessService.canViewProject) — tek tek çağırmak yerine toplu sorgu.
   */
  private async projeDurumlari(
    satirlar: any[],
    userId: string,
    isiYonetiyor: (jobId: string | null) => Promise<boolean>
  ): Promise<Map<string, { durum: MuzePlaketi["projeDurumu"]; ad?: string }>> {
    const sonuc = new Map<string, { durum: MuzePlaketi["projeDurumu"]; ad?: string }>();
    const ids = satirlar.map((r) => r.project_id);
    if (!ids.length) return sonuc;
    const db = this.supabase.client;
    const { data: projeler } = await db.from("projects").select("id, title, status, archived_at, owner_id, job_id").in("id", ids);
    const { data: uyelikler } = await db
      .from("project_members")
      .select("project_id")
      .eq("user_id", userId)
      .eq("status", "approved")
      .in("project_id", ids);
    const uye = new Set((uyelikler ?? []).map((m: any) => m.project_id));
    for (const p of projeler ?? []) {
      const gorebilir = p.owner_id === userId || uye.has(p.id) || (await isiYonetiyor(p.job_id));
      sonuc.set(p.id, {
        durum: muzeProjeDurumu({ status: p.status, archivedAt: p.archived_at }, gorebilir),
        ad: gorebilir ? p.title : undefined,
      });
    }
    return sonuc;
  }
}

function mapPlaket(r: any, projeDurumu: MuzePlaketi["projeDurumu"]): MuzePlaketi {
  return {
    id: r.id,
    projectId: r.project_id,
    jobId: r.job_id ?? undefined,
    organizationId: r.organization_id ?? undefined,
    groupId: r.group_id ?? undefined,
    projeAdi: r.proje_adi,
    isAdi: r.is_adi ?? undefined,
    kapak: r.kapak ?? undefined,
    baslangic: r.baslangic ?? undefined,
    teslim: r.teslim ?? undefined,
    bitis: new Date(r.bitis).toISOString(),
    tahminiTarih: !!r.tahmini_tarih,
    sureGun: r.sure_gun,
    teslimFarkiGun: r.teslim_farki_gun ?? undefined,
    gorevSayisi: r.gorev_sayisi ?? 0,
    ciktiSayisi: r.cikti_sayisi ?? 0,
    paylasimSayisi: r.paylasim_sayisi ?? 0,
    katkilar: (Array.isArray(r.katkilar) ? r.katkilar : []).map(
      (k: any): MuzeKatkisi => ({ userId: k.userId ?? null, ad: String(k.ad ?? ""), gorev: Number(k.gorev ?? 0) })
    ),
    sira: r.sira ?? undefined,
    siraKapsami: r.sira_kapsami ?? undefined,
    projeDurumu,
    // Sütun yoksa (migration 191 uygulanmadan) false.
    sirketGeneli: r.sirket_geneli === true || undefined,
  };
}
