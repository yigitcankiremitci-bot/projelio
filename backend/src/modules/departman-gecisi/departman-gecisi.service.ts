import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { DepartmanGecisiDurumu } from "@projelio/shared";
import { defaultLocale, departmanSayilirMi, departmanSiniri, gecisSeciminiDogrula } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { cevirmen } from "../../common/i18n";
import { KullaniciDiliService } from "../../common/i18n/kullanici-dili.service";
import { FilesService } from "../files/files.service";

/**
 * Mevcut şirketlerin departman kuralına BİR KERELİK geçişi (migration 173).
 *
 * Şirket sahibine bir pencere çıkar (apps/web DepartmanGecisiModal): kural
 * anlatılır, ekip büyüklüğüne göre hangi departmanları tutacağı sorulur.
 * Tutulmayanların kişileri ve verisi Yönetim departmanına taşınır, departman
 * SİLİNİR (kullanıcı kararı, 2026-11-01). Taşıma + silme veritabanında TEK
 * transaction (departman_gecisi_uygula): CASCADE'li bir tabloyu unutmak
 * veriyi sessizce silerdi. Buluttaki klasör düzeni ondan sonra, en iyi çabayla.
 */
@Injectable()
export class DepartmanGecisiService {
  private readonly logger = new Logger(DepartmanGecisiService.name);

  constructor(
    private supabase: SupabaseService,
    private files: FilesService,
    private kullaniciDili: KullaniciDiliService
  ) {}

  /**
   * Kullanıcının sahibi olduğu ve geçişi bekleyen şirketler. Migration 173
   * uygulanmadan (sütun yok) boş döner: pencere hiç çıkmaz, uygulama durmaz.
   */
  async bekleyenler(userId: string): Promise<{ organizationId: string; name: string }[]> {
    const { data, error } = await this.supabase.client
      .from("organizations")
      .select("id, name")
      .eq("owner_id", userId)
      .is("departman_gecisi_at", null)
      .order("created_at", { ascending: true });
    if (error) {
      this.logger.warn(`Departman geçişi okunamadı (migration 173 uygulandı mı?): ${error.message}`);
      return [];
    }
    return (data ?? []).map((o: any) => ({ organizationId: o.id, name: o.name }));
  }

  async durum(organizationId: string, userId: string): Promise<DepartmanGecisiDurumu> {
    const org = await this.sahipOlmali(organizationId, userId);

    const { data: depts, error } = await this.supabase.client
      .from("departments")
      .select("id, name, catalog_key, sort_order")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    const tum = depts ?? [];
    const ids = tum.map((d: any) => d.id as string);

    const kadroByDept = new Map<string, Set<string>>();
    const kisiler = new Set<string>();
    if (ids.length) {
      const { data: kadro, error: kadroError } = await this.supabase.client
        .from("department_members")
        .select("department_id, user_id")
        .in("department_id", ids)
        .in("status", ["approved", "leave_pending"])
        .not("user_id", "is", null);
      if (kadroError) throw kadroError;
      for (const k of kadro ?? []) {
        if (k.user_id === org.owner_id) continue;
        kisiler.add(k.user_id);
        const set = kadroByDept.get(k.department_id) ?? new Set<string>();
        set.add(k.user_id);
        kadroByDept.set(k.department_id, set);
      }
    }

    const sayilan = tum.filter((d: any) => departmanSayilirMi(d.catalog_key));
    const departmanlar = await Promise.all(
      sayilan.map(async (d: any) => {
        const [gorev, dosya] = await Promise.all([
          this.supabase.client.from("tasks").select("id", { count: "exact", head: true }).eq("department_id", d.id),
          this.supabase.client.from("files").select("id", { count: "exact", head: true }).eq("department_id", d.id),
        ]);
        return {
          id: d.id as string,
          name: d.name as string,
          catalogKey: d.catalog_key ?? undefined,
          kisiSayisi: kadroByDept.get(d.id)?.size ?? 0,
          gorevSayisi: gorev.count ?? 0,
          dosyaSayisi: dosya.count ?? 0,
        };
      })
    );

    return {
      organizationId,
      organizationName: org.name,
      departmanlar,
      kisiSayisi: kisiler.size,
      sinir: departmanSiniri(kisiler.size),
      yonetimVar: tum.some((d: any) => !departmanSayilirMi(d.catalog_key)),
    };
  }

  async uygula(
    organizationId: string,
    userId: string,
    girdi: { tutulan?: unknown }
  ): Promise<{ yonetimId: string | null; silinen: number; bulut: { tasinan: number; kalan: number } }> {
    const tutulan = Array.isArray(girdi?.tutulan) ? girdi.tutulan.filter((x): x is string => typeof x === "string") : null;
    if (!tutulan) throw new BadRequestException("Tutulacak departmanları seç.");

    // Durum bugünkü kadroyla yeniden hesaplanır: pencere açıkken ekibe kişi
    // eklenmiş ya da çıkarılmış olabilir.
    const durum = await this.durum(organizationId, userId);
    const hata = gecisSeciminiDogrula(durum, tutulan);
    if (hata) throw new BadRequestException(hata);

    const tutulanSet = new Set(tutulan);
    const birakilan = durum.departmanlar.filter((d) => !tutulanSet.has(d.id)).map((d) => d.id);

    // Departman silinince bulut kök kaydı da gidiyor; önce oku.
    const kokler = await this.files.departmanBulutKokleri(birakilan).catch((err) => {
      this.logger.warn(`Geçiş: bulut kökleri okunamadı (${organizationId}): ${(err as Error).message}`);
      return [];
    });

    const t = cevirmen(await this.kullaniciDili.diliniBul(userId).catch(() => defaultLocale));
    const { data: yonetimId, error } = await this.supabase.client.rpc("departman_gecisi_uygula", {
      p_org: organizationId,
      p_birakilan: birakilan,
      p_yonetim_adi: t("YÖNETİM"),
      p_sahip: userId,
    });
    if (error) {
      this.logger.error(`Departman geçişi düştü (${organizationId}): ${error.message}`);
      throw new BadRequestException("Geçiş tamamlanamadı; hiçbir departman silinmedi. Tekrar dene.");
    }

    // Fonksiyon bırakılan departmanların modül satırlarını Yönetim'e sabitliyor;
    // ev hesaplanan bir şey (bkz. shared modulEvi.ts, migration 174): sabit
    // kalırsa ilgili departman sonradan açıldığında yetki Yönetim'de kalırdı.
    if (yonetimId) {
      const { error: modulHatasi } = await this.supabase.client
        .from("organization_modules")
        .update({ department_id: null })
        .eq("department_id", yonetimId as string);
      if (modulHatasi) this.logger.warn(`Geçiş: modül evleri boşaltılamadı (${organizationId}): ${modulHatasi.message}`);
    }

    const bulut = yonetimId
      ? await this.files.departmanKokleriniTasi(kokler, yonetimId as string, userId)
      : { tasinan: 0, kalan: 0 };
    this.logger.log(
      `Departman geçişi: org=${organizationId} tutulan=${tutulan.length} silinen=${birakilan.length} ` +
        `bulut taşınan=${bulut.tasinan} kalan=${bulut.kalan}`
    );
    return { yonetimId: (yonetimId as string) ?? null, silinen: birakilan.length, bulut };
  }

  private async sahipOlmali(organizationId: string, userId: string): Promise<{ owner_id: string; name: string }> {
    const { data: org } = await this.supabase.client
      .from("organizations")
      .select("owner_id, name")
      .eq("id", organizationId)
      .maybeSingle();
    if (!org) throw new NotFoundException("Organizasyon bulunamadı");
    if (org.owner_id !== userId) throw new ForbiddenException("Bu organizasyonu yalnızca sahibi düzenleyebilir");
    return org;
  }
}
