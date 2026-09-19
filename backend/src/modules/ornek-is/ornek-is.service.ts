import { Injectable, Logger } from "@nestjs/common";
import { isLocale } from "@projelio/shared";
import type { Locale } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { yerelAn, zamanDilimiGecerliMi } from "../notifications/notification-email.zaman";
import { gunEkle, ornekIcerik, ornekTuru } from "./ornek-is.icerik";

/**
 * Yeni üyenin hesabına eğitici örnek iş açar ve tek tıkla siler (bkz.
 * migration 118, ornek-is.icerik.ts).
 *
 * NEDEN DİĞER SERVİSLERİ ÇAĞIRMIYOR (JobsService, TasksService...): onlar
 * kullanıcının kendi eylemi için yazıldı ve yan etkileri var — görev açılınca
 * ekibe bildirim, atamada "X seni bu göreve ekledi" bildirimi. Örnek içerik
 * bir eylem değil; yeni üyenin ilk gördüğü şey kendi kendine gönderilmiş on
 * bildirim olmamalı. Ayrıca UsersModule'ün bu servisi kullanması, o
 * servislerin bağımlılık ağacını (dosyalar, erişim, bulut) sihirbaza bağlardı.
 *
 * SİLME YALNIZCA `is_sample` İŞARETLİ İŞLERE dokunur ve yalnızca kullanıcının
 * KENDİ işlerine (owner_id). Kullanıcı örnek işin adını değiştirse ya da içine
 * kendi görevlerini yazsa bile, silinen şey "örnek" olarak açtığımız iştir —
 * bu yüzden arayüz silmeden önce onay istiyor.
 */

const VARSAYILAN_ZAMAN_DILIMI = "Europe/Istanbul";

@Injectable()
export class OrnekIsService {
  private readonly logger = new Logger(OrnekIsService.name);

  constructor(private supabase: SupabaseService) {}

  /** Kullanıcının örnek işi (varsa). */
  async durum(userId: string): Promise<{ jobId: string | null }> {
    const { data, error } = await this.supabase.client
      .from("jobs")
      .select("id")
      .eq("owner_id", userId)
      .eq("is_sample", true)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return { jobId: data?.id ?? null };
  }

  /**
   * Örnek işi oluşturur; zaten varsa onu döndürür (idempotent).
   *
   * Yarıda kalan kurulum GERİ ALINIR: işi açıp görevlerde düşen bir kurulum,
   * kullanıcıya içi boş bir "örnek iş" bırakırdı — tekil indeks yüzünden de
   * yenisi açılamazdı. İş silinince proje ve görevler zincirleme gidiyor.
   */
  async olustur(
    userId: string,
    baglanti: { organizationId?: string; groupId?: string } = {}
  ): Promise<{ jobId: string; created: boolean }> {
    const mevcut = await this.durum(userId);
    if (mevcut.jobId) return { jobId: mevcut.jobId, created: false };

    const { locale, timezone, hesapTipi } = await this.kullaniciBaglami(userId);
    const tur = ornekTuru(hesapTipi);
    const icerik = ornekIcerik(locale, tur);
    const bugun = yerelAn(new Date(), timezone).gun;
    // Şirket örneği şirketin İÇİNDE durur: şirket sayfasında işler arasında
    // görünsün ki "işler şirkete bağlanır" kartı gördüğü şeyi anlatsın.
    const yer = tur === "sirket" ? await this.sirketYeri(userId, baglanti) : {};

    const { data: is, error: isHatasi } = await this.supabase.client
      .from("jobs")
      .insert({
        owner_id: userId,
        title: icerik.is.baslik,
        description: icerik.is.aciklama,
        is_sample: true,
        organization_id: yer.organizationId ?? null,
        group_id: yer.groupId ?? null,
      })
      .select("id")
      .single();
    if (isHatasi) {
      // 23505: tekil indeks — aynı anda gelen ikinci istek. Kazanan zaten
      // açtı; onu döndürmek, "zaten var" demekle aynı şey.
      if ((isHatasi as { code?: string }).code === "23505") {
        const yeniden = await this.durum(userId);
        if (yeniden.jobId) return { jobId: yeniden.jobId, created: false };
      }
      throw isHatasi;
    }

    try {
      await this.icerigiYaz(is.id, userId, icerik, bugun, timezone);
    } catch (err) {
      await this.supabase.client.from("operations").delete().eq("job_id", is.id);
      await this.supabase.client.from("jobs").delete().eq("id", is.id);
      throw err;
    }
    return { jobId: is.id, created: true };
  }

  /**
   * Sihirbazın bitişinden çağrılan hâli: HATA FIRLATMAZ. Örnek içerik bir
   * armağan, kurulumun parçası değil — açılamadı diye kullanıcı sihirbazda
   * takılı kalmamalı (sihirbaz kapatılamıyor).
   */
  async olusturSessiz(userId: string, baglanti: { organizationId?: string; groupId?: string } = {}): Promise<void> {
    try {
      await this.olustur(userId, baglanti);
    } catch (err) {
      this.logger.warn(`Örnek iş açılamadı (${userId}): ${err instanceof Error ? err.message : err}`);
    }
  }

  /** Kullanıcının örnek işlerini (ve içindeki her şeyi) siler. */
  async sil(userId: string): Promise<{ deleted: number }> {
    const { data, error } = await this.supabase.client
      .from("jobs")
      .select("id")
      .eq("owner_id", userId)
      .eq("is_sample", true);
    if (error) throw error;
    const ids = (data ?? []).map((row: { id: string }) => row.id);
    if (ids.length === 0) return { deleted: 0 };

    // Rutin programları ÖNCE: operations.job_id'de ON DELETE CASCADE yok
    // (bkz. 021) ve iş silinirken program varsa yabancı anahtar reddeder.
    // Programın rutinleri ve ürettiği görevler kendi zincirleriyle gidiyor.
    const { error: programHatasi } = await this.supabase.client.from("operations").delete().in("job_id", ids);
    if (programHatasi) throw programHatasi;
    const { error: silmeHatasi } = await this.supabase.client
      .from("jobs")
      .delete()
      .in("id", ids)
      .eq("owner_id", userId)
      .eq("is_sample", true);
    if (silmeHatasi) throw silmeHatasi;
    return { deleted: ids.length };
  }

  private async icerigiYaz(
    jobId: string,
    userId: string,
    icerik: ReturnType<typeof ornekIcerik>,
    bugun: string,
    timezone: string
  ): Promise<void> {
    const simdi = new Date().toISOString();

    const { data: proje, error: projeHatasi } = await this.supabase.client
      .from("projects")
      .insert({
        owner_id: userId,
        job_id: jobId,
        title: icerik.proje.baslik,
        description: icerik.proje.aciklama,
        start_date: bugun,
        deadline: gunEkle(bugun, icerik.proje.gunSonra),
      })
      .select("id")
      .single();
    if (projeHatasi) throw projeHatasi;

    // Tamamlanmış açılan görevler damgasız kalmasın (bkz. TasksService.create).
    const tamamlanma = (durum: string) =>
      durum === "completed" ? { completed_at: simdi, completed_by: userId } : { completed_at: null, completed_by: null };

    const { data: anaGorevler, error: gorevHatasi } = await this.supabase.client
      .from("tasks")
      .insert(
        icerik.gorevler.map((g, sira) => ({
          project_id: proje.id,
          sort_order: sira,
          assigned_to: userId,
          title: g.baslik,
          description: g.aciklama,
          start_date: bugun,
          deadline: gunEkle(bugun, g.gunSonra),
          deadline_time: g.saat ?? null,
          status: g.durum,
          ...tamamlanma(g.durum),
        }))
      )
      .select("id, sort_order");
    if (gorevHatasi) throw gorevHatasi;

    // Sıra numarasıyla eşleştiriliyor: insert'in dönüş sırası garanti değil.
    const siradanId = new Map((anaGorevler ?? []).map((row: any) => [row.sort_order as number, row.id as string]));
    const altSatirlar = icerik.gorevler.flatMap((g, sira) =>
      (g.altGorevler ?? []).map((a, altSira) => ({
        project_id: proje.id,
        parent_task_id: siradanId.get(sira),
        sort_order: altSira,
        assigned_to: userId,
        title: a.baslik,
        deadline: gunEkle(bugun, g.gunSonra),
        status: a.durum,
        ...tamamlanma(a.durum),
      }))
    );
    let altGorevler: { id: string }[] = [];
    if (altSatirlar.length) {
      const { data, error } = await this.supabase.client.from("tasks").insert(altSatirlar).select("id");
      if (error) throw error;
      altGorevler = data ?? [];
    }

    // Atama ilişkisi ayrı tabloda (bkz. 055); Yapılacaklar ve sabah özeti
    // oradan okuyor. Bildirim BİLEREK yok — bkz. sınıf başlığı.
    const atamalar = [...(anaGorevler ?? []), ...altGorevler].map((row: any) => ({
      task_id: row.id,
      user_id: userId,
      assigned_by: userId,
    }));
    if (atamalar.length) {
      const { error } = await this.supabase.client.from("task_assignees").insert(atamalar);
      if (error) throw error;
    }

    const { data: program, error: programHatasi } = await this.supabase.client
      .from("operations")
      .insert({
        owner_id: userId,
        job_id: jobId,
        title: icerik.rutinProgrami.baslik,
        description: icerik.rutinProgrami.aciklama,
        started_on: bugun,
        timezone,
      })
      .select("id")
      .single();
    if (programHatasi) throw programHatasi;

    // Tekrarlar (görevler) veritabanı tetikleyicisiyle açılıyor, bkz.
    // OperationsService.createRoutine.
    const { error: rutinHatasi } = await this.supabase.client.from("operation_routines").insert(
      icerik.rutinler.map((r, sira) => ({
        operation_id: program.id,
        title: r.baslik,
        description: r.aciklama,
        default_assignee: userId,
        freq: r.freq,
        byweekday: r.byWeekday ?? null,
        bymonthday: r.byMonthDay ?? null,
        starts_on: bugun,
        due_time: r.dueTime,
        sort_order: sira,
      }))
    );
    if (rutinHatasi) throw rutinHatasi;
  }

  /**
   * Kullanıcının dili ve saat dilimi. Saat dilimi bildirim e-postası
   * tercihinden geliyor — tarayıcının bildirdiği tek kalıcı kayıt orası.
   * Yoksa İstanbul: örnek görevlerin "bugün"ü birkaç saat kayarsa zararı yok.
   */
  /**
   * Şirket örneğinin bağlanacağı yer: sihirbazın az önce kurduğu şirket/grup,
   * yoksa kullanıcının SAHİBİ olduğu ilk şirket, o da yoksa ilk grubu.
   * Verilen kimlik kullanıcıya ait değilse yok sayılır — başkasının
   * şirketine iş açmak diye bir yol olmamalı.
   */
  private async sirketYeri(
    userId: string,
    baglanti: { organizationId?: string; groupId?: string }
  ): Promise<{ organizationId?: string; groupId?: string }> {
    const sahibiOldugu = async (tablo: "organizations" | "groups", id?: string) => {
      let sorgu = this.supabase.client.from(tablo).select("id").eq("owner_id", userId);
      sorgu = id ? sorgu.eq("id", id) : sorgu.order("created_at", { ascending: true });
      const { data } = await sorgu.limit(1).maybeSingle();
      return (data as { id: string } | null)?.id;
    };
    const org = (await sahibiOldugu("organizations", baglanti.organizationId)) ?? (await sahibiOldugu("organizations"));
    if (org) return { organizationId: org };
    const grup = (await sahibiOldugu("groups", baglanti.groupId)) ?? (await sahibiOldugu("groups"));
    return grup ? { groupId: grup } : {};
  }

  private async kullaniciBaglami(
    userId: string
  ): Promise<{ locale: Locale; timezone: string; hesapTipi: string | null }> {
    const [{ data: kullanici }, { data: tercih }] = await Promise.all([
      this.supabase.client.from("users").select("locale, account_type").eq("id", userId).maybeSingle(),
      this.supabase.client.from("notification_email_prefs").select("timezone").eq("user_id", userId).maybeSingle(),
    ]);
    const timezone =
      typeof tercih?.timezone === "string" && zamanDilimiGecerliMi(tercih.timezone)
        ? tercih.timezone
        : VARSAYILAN_ZAMAN_DILIMI;
    return {
      locale: isLocale(kullanici?.locale) ? kullanici.locale : "tr",
      timezone,
      hesapTipi: (kullanici as any)?.account_type ?? null,
    };
  }
}
