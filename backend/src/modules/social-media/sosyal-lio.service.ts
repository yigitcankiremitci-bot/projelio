import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";
import { FilesService } from "../files/files.service";
import { JobsService } from "../jobs/jobs.service";
import { OrganizationsService } from "../organizations/organizations.service";
import { gelenMedya, medyaTuru, MEDYA_TEK_DOSYA_TAVANI, type GelenMedya } from "./gelen-medya";
import { yedektenYukle, yedekSil } from "./medya-yedegi";
import { LioOneriService } from "./lio-oneri.service";
import { denemeReelsHatasi } from "./publish-format";
import { SocialMediaService, type SocialScope } from "./social-media.service";
import { icerikTuruSec, KARUSEL_TAVANI, planlamaEksikleri, zamaniCoz, zamaniGoster } from "./sosyal-lio";

/**
 * Lio'nun sosyal medya araçlarının arkasındaki servis: WhatsApp'tan (ya da
 * sohbetten) gelen video/fotoğraf/karusel için gönderi TASLAĞI açar, açıklama
 * ve etiket önerir, kullanıcı onaylayınca planlar.
 *
 * Yeni bir yetki kapısı AÇMAZ: her adım SocialMediaService'in kendi
 * kontrollerinden geçer (organizasyon sahibi > departman yöneticisi > modül
 * üyesi). Lio kullanıcının yapabildiğinden fazlasını yapamaz.
 *
 * ONAY: taslak oluşturmak ve düzenlemek serbest, PLANLAMAK ise kullanıcı
 * taslağı gördükten sonra bir mesaj yazmadan reddedilir (bkz. gelen-medya.ts).
 * Planlanmış içerik zamanı gelince kuyruk tarafından Instagram'a çıkar ve
 * bu geri alınamaz; modelin "onayladı" saymasına güvenilmiyor.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Model postId yerine mediaId ("med_…") verebiliyor; veritabanı "invalid input
 * syntax for type uuid" diye patlıyor ve model sebebi anlamayıp taslağı baştan
 * açmaya kalkıyordu (2026-09-30). Hata ne yapacağını söylesin.
 */
function postIdDogrula(postId: string): void {
  if (!UUID.test(postId)) {
    throw new BadRequestException(
      "postId bir gönderi kimliği olmalı (mediaId değil). Açık taslakların kimlikleri mesajdaki sistem notunda; taslağı yeniden AÇMA."
    );
  }
}

/** Şimdilik yalnızca Instagram için otomatik yayın var (bkz. SocialPublishService.runTarget). */
const OTOMATIK_YAYIN = new Set(["instagram"]);

/** Modele dönen gönderi özeti — ham satır yerine, Lio'nun kullanıcıya aktaracağı kadarı. */
interface TaslakOzeti {
  postId: string;
  hesaplar: string[];
  icerikTuru: string;
  denemeReels: string | null;
  medya: { ad: string; tur: string }[];
  aciklama: string | null;
  etiketler: string | null;
  yayinZamani: string | null;
  durum: string;
}

@Injectable()
export class SosyalLioService {
  private readonly logger = new Logger(SosyalLioService.name);

  constructor(
    private supabase: SupabaseService,
    private social: SocialMediaService,
    private files: FilesService,
    private oneri: LioOneriService,
    private organizations: OrganizationsService,
    private jobs: JobsService
  ) {}

  // ================================================================ hesaplar

  /** Kullanıcının içerik ekleyebildiği hesaplar. Yazma yetkisi olmayan listeye girmez. */
  async hesaplar(userId: string) {
    // Dağıtımdan sonra bellek boşalır; bekleyen medya yedekten geri gelir.
    await yedektenYukle(this.supabase, userId).catch(() => undefined);
    const [orgs, jobs] = await Promise.all([this.organizations.findAllForUser(userId), this.jobs.findAllForUser(userId)]);
    const orgAd = new Map(orgs.map((o) => [o.id, o.name]));
    const jobAd = new Map(jobs.map((j) => [j.id, j.title]));

    const satirlar: any[] = [];
    if (orgs.length) {
      const { data } = await this.supabase.client
        .from("social_accounts")
        .select("*")
        .in("organization_id", orgs.map((o) => o.id))
        .is("archived_at", null);
      satirlar.push(...(data ?? []));
    }
    if (jobs.length) {
      const { data } = await this.supabase.client
        .from("social_accounts")
        .select("*")
        .in("job_id", jobs.map((j) => j.id))
        .is("archived_at", null);
      satirlar.push(...(data ?? []));
    }

    const yetki = new Map<string, boolean>();
    const cikti: any[] = [];
    for (const r of satirlar) {
      if (r.active === false) continue;
      const kapsam = this.social.scopeOfRow(r);
      const anahtar = "jobId" in kapsam ? `j:${kapsam.jobId}` : `o:${kapsam.organizationId}:${kapsam.departmentId ?? ""}`;
      if (!yetki.has(anahtar)) {
        yetki.set(anahtar, await this.social.assertWritable(kapsam, userId).then(() => true, () => false));
      }
      if (!yetki.get(anahtar)) continue;
      cikti.push({
        accountId: r.id,
        platform: r.platform,
        kullaniciAdi: r.handle,
        ad: r.display_name ?? undefined,
        kapsam: r.job_id ? jobAd.get(r.job_id) : orgAd.get(r.organization_id),
        baglanti: r.connection_status ?? "manual",
        // Bağlı değilse zamanı gelince yayın hata verir; Lio kullanıcıya baştan söylesin.
        otomatikYayin: OTOMATIK_YAYIN.has(r.platform) && r.connection_status === "connected" && !!r.external_account_id,
        ton: r.tone_note ?? undefined,
      });
    }
    return cikti;
  }

  /** Gelen (henüz taslağa bağlanmamış) medya. Lio kimliklerini buradan ya da mesaj notundan alır. */
  bekleyenMedya(userId: string) {
    return gelenMedya.liste(userId).map((m) => ({ mediaId: m.id, ad: m.ad, tur: medyaTuru(m.mimeType) ?? m.mimeType, boyutMB: +(m.boyut / 1048576).toFixed(1), kalite: m.orijinal ? "orijinal (dosya olarak)" : "sıkıştırılmış (WhatsApp medyası)" }));
  }

  // ================================================================ taslak

  async taslakOlustur(
    userId: string,
    girdi: {
      accountIds: string[];
      mediaIds: string[];
      baslik?: string;
      aciklama?: string;
      etiketler?: string;
      icerikTuru?: string;
      denemeReels?: string;
      yayinZamani?: string;
      /** Kullanıcı sıkıştırılmış medyayla devam etmeyi AÇIKÇA istedi. */
      sikistirilmisKabul?: boolean;
    }
  ): Promise<{ taslaklar: TaslakOzeti[]; uyari?: string }> {
    if (!girdi.accountIds?.length) throw new BadRequestException("En az bir hesap seçilmeli (social_list_accounts).");
    if (!girdi.mediaIds?.length) throw new BadRequestException("En az bir görsel ya da video gerekli.");
    if (girdi.mediaIds.length > KARUSEL_TAVANI) {
      throw new BadRequestException(`Bir gönderiye en çok ${KARUSEL_TAVANI} medya eklenebilir.`);
    }

    await yedektenYukle(this.supabase, userId).catch(() => undefined);
    const { medya, eksik } = gelenMedya.coz(userId, girdi.mediaIds);
    if (eksik.length) {
      throw new BadRequestException(
        "Bu medya artık bende yok (süre doldu). Aynı çağrıyı TEKRARLAMA; kullanıcıdan dosyayı WhatsApp'tan yeniden göndermesini iste."
      );
    }
    // WhatsApp video/fotoğrafı sıkıştırıyor; Instagram'a bu hâliyle çıkarsa
    // kalite geri gelmez. Kullanıcı bilerek "böyle gönder" demedikçe orijinal istenir.
    const sikisik = medya.filter((m) => !m.orijinal);
    if (sikisik.length && !girdi.sikistirilmisKabul) {
      throw new BadRequestException(
        `${sikisik.length} medya WhatsApp tarafından sıkıştırılmış geldi; Instagram'da kalite düşük görünür. ` +
          `Kullanıcıya şunu öner: dosyayı ataç (📎) > Belge/Dosya olarak yeniden göndersin, kalite korunur. ` +
          `Kullanıcı "böyle gönder/devam et" derse sikistirilmisKabul=true ile yeniden çağır; ` +
          `dosya olarak gönderirse yeni mediaId ile devam et.`
      );
    }
    // Medya HEMEN ayrılır: model aynı turda aracı iki kez paralel çağırınca ikisi
    // de medyayı bulup iki ayrı taslak açıyordu (2026-09-30). Taslak açılamazsa
    // medya depoya geri konur.
    gelenMedya.birak(userId, girdi.mediaIds);
    try {
      return await this.taslakOlusturAyrilmis(userId, girdi, medya);
    } catch (e) {
      for (const m of medya) gelenMedya.geriYukle(userId, m);
      throw e;
    }
  }

  private async taslakOlusturAyrilmis(
    userId: string,
    girdi: Parameters<SosyalLioService["taslakOlustur"]>[1],
    medya: GelenMedya[]
  ): Promise<{ taslaklar: TaslakOzeti[]; uyari?: string }> {
    const tur = medya.map((m) => medyaTuru(m.mimeType));
    if (tur.includes(null)) throw new BadRequestException("Yalnızca JPEG/PNG/WebP görsel ve video paylaşılabilir.");
    if (tur.includes("video") && medya.length > 1) {
      throw new BadRequestException("Videolu gönderi tek videoyla yayımlanır; karuselde video olmaz. Ayrı gönderiler açalım mı?");
    }

    const hesaplar = await this.hesapSatirlari(girdi.accountIds);
    const otomatikOlmayan = hesaplar.filter((h) => !OTOMATIK_YAYIN.has(h.platform));
    if (otomatikOlmayan.length) {
      throw new BadRequestException(
        `${otomatikOlmayan.map((h) => `${h.platform} @${h.handle}`).join(", ")} için otomatik yayın henüz yok; ` +
          `yalnızca Instagram hesaplarına planlayabilirim. Diğerlerini kullanıcıya söyle.`
      );
    }
    const baglanmamis = hesaplar.filter((h) => h.connection_status !== "connected" || !h.external_account_id);
    if (baglanmamis.length) {
      throw new BadRequestException(
        `@${baglanmamis.map((h) => h.handle).join(", @")} Instagram'a bağlı değil; zamanı gelince yayımlanamaz. ` +
          `Kullanıcı Sosyal Medya > Hesaplar'dan bağlamalı.`
      );
    }

    if (girdi.denemeReels) {
      if (!["manual", "performance"].includes(girdi.denemeReels)) {
        throw new BadRequestException('denemeReels "manual" ya da "performance" olmalı.');
      }
      const hata = denemeReelsHatasi(medya.map((m) => ({ mimeType: m.mimeType })));
      if (hata) throw new BadRequestException(hata);
    }

    const vakit = zamaniCoz(girdi.yayinZamani);
    if (girdi.yayinZamani && !vakit) {
      throw new BadRequestException('yayinZamani "2026-10-01T19:00" biçiminde olmalı.');
    }

    // Hesaplar kapsamlarına göre gruplanır: gönderi tek kapsama ait olabilir,
    // farklı şirketlerin hesapları ayrı gönderi olur (her biri kendi deposuna yazar).
    const gruplar = new Map<string, { kapsam: SocialScope; hesaplar: any[] }>();
    for (const h of hesaplar) {
      const kapsam = this.social.scopeOfRow(h);
      const anahtar = "jobId" in kapsam ? `j:${kapsam.jobId}` : `o:${kapsam.organizationId}:${kapsam.departmentId ?? ""}`;
      const g = gruplar.get(anahtar) ?? { kapsam, hesaplar: [] };
      g.hesaplar.push(h);
      gruplar.set(anahtar, g);
    }

    const taslaklar: TaslakOzeti[] = [];
    for (const { kapsam, hesaplar: hs } of gruplar.values()) {
      await this.social.assertWritable(kapsam, userId);
      const dosyaIdleri: string[] = [];
      for (const m of medya) dosyaIdleri.push(await this.depoyaYaz(kapsam, userId, m));

      const post = await this.social.createPost(
        kapsam,
        {
          title: girdi.baslik?.trim() || `Lio · ${hs.map((h) => "@" + h.handle).join(", ")}`,
          caption: girdi.aciklama,
          hashtags: girdi.etiketler,
          contentType: icerikTuruSec(medya.map((m) => m.mimeType), girdi.icerikTuru),
          status: "draft",
          scheduledAt: vakit ? vakit.toISOString() : null,
          accountIds: hs.map((h) => h.id),
          publishVia: "projelio",
          trialReel: girdi.denemeReels ?? null,
          assigneeId: userId,
          departmentId: "organizationId" in kapsam ? kapsam.departmentId : undefined,
        },
        userId
      );
      for (const fileId of dosyaIdleri) await this.social.attachMedia(post.id, { fileId }, userId);
      gelenMedya.taslakDokunuldu(userId, post.id);
      taslaklar.push(await this.ozet(post.id, userId));
    }

    // Dosyalar artık Drive'da; yedek gereksiz yer tutmasın (bellekten zaten ayrıldı).
    await yedekSil(this.supabase, userId, girdi.mediaIds).catch(() => undefined);
    return { taslaklar };
  }

  // ================================================================ öneri

  /** Medyaya bakıp açıklama + etiket yazar ve TASLAĞA işler (yayın kararı vermez). */
  async aciklamaOner(userId: string, postId: string, istek?: string) {
    postIdDogrula(postId);
    const oneri = await this.oneri.oner(postId, userId, { istek, dil: "tr" });
    await this.social.updatePost(postId, { caption: oneri.caption, hashtags: oneri.hashtags }, userId);
    gelenMedya.taslakDokunuldu(userId, postId);
    return {
      aciklama: oneri.caption,
      etiketler: oneri.hashtags,
      gorulen: oneri.gorulen,
      harcananBirim: oneri.kredi,
      taslak: await this.ozet(postId, userId),
    };
  }

  async taslakDuzenle(
    userId: string,
    postId: string,
    d: { aciklama?: string; etiketler?: string; baslik?: string; yayinZamani?: string; denemeReels?: string | null }
  ) {
    postIdDogrula(postId);
    const post = await this.social.findPost(postId, userId);
    if (["published", "cancelled"].includes(post.status)) {
      throw new BadRequestException("Yayımlanmış ya da iptal edilmiş gönderi düzenlenemez.");
    }
    const vakit = d.yayinZamani !== undefined ? zamaniCoz(d.yayinZamani) : undefined;
    if (d.yayinZamani && !vakit) throw new BadRequestException('yayinZamani "2026-10-01T19:00" biçiminde olmalı.');
    if (d.denemeReels) {
      if (!["manual", "performance"].includes(d.denemeReels)) throw new BadRequestException('denemeReels "manual" ya da "performance" olmalı.');
      const hata = denemeReelsHatasi(post.media.map((m) => ({ mimeType: m.mimeType ?? "" })));
      if (hata) throw new BadRequestException(hata);
    }
    await this.social.updatePost(
      postId,
      {
        caption: d.aciklama,
        hashtags: d.etiketler,
        title: d.baslik,
        scheduledAt: vakit === undefined ? undefined : vakit ? vakit.toISOString() : null,
        trialReel: d.denemeReels,
        // İçerik değişince planlanmış gönderi TASLAĞA döner: kullanıcının
        // onayladığı hâl artık yayımlanacak hâl değil.
        status: post.status === "scheduled" ? "draft" : undefined,
      },
      userId
    );
    gelenMedya.taslakDokunuldu(userId, postId);
    return this.ozet(postId, userId);
  }

  // ================================================================ planlama

  async planla(userId: string, postId: string, yayinZamani?: string) {
    postIdDogrula(postId);
    const post = await this.social.findPost(postId, userId);
    if (post.status === "scheduled") throw new BadRequestException("Bu gönderi zaten planlanmış.");
    if (post.status !== "draft") throw new BadRequestException(`Bu gönderi planlanamaz (durum: ${post.status}).`);

    if (!gelenMedya.planlanabilir(userId, postId)) {
      throw new BadRequestException(
        "Bu taslağı kullanıcıya henüz göstermedin ya da gösterdikten sonra değiştirdin. Açıklama, etiketler, hesap ve " +
          "yayın zamanını kullanıcıya yaz ve onayını bekle; kullanıcı onay mesajını yazınca yeniden dene."
      );
    }

    const vakit = yayinZamani ? zamaniCoz(yayinZamani) : post.scheduledAt ? new Date(post.scheduledAt) : null;
    if (yayinZamani && !vakit) throw new BadRequestException('yayinZamani "2026-10-01T19:00" biçiminde olmalı.');
    const eksik = planlamaEksikleri({
      medyaSayisi: post.media.length,
      hedefSayisi: post.targets.length,
      caption: post.caption,
      vakit,
      simdi: new Date(),
    });
    // Birleştirilmiş metin çeviri sözlüğünde anahtar olamaz; her eksik kendi
    // cümlesiyle gider, Lio düzeltip yeniden çağırınca sıradaki görünür.
    if (eksik.length) throw new BadRequestException(eksik[0]);

    await this.social.updatePost(
      postId,
      { status: "scheduled", scheduledAt: vakit!.toISOString(), publishVia: "projelio" },
      userId
    );
    gelenMedya.planlandi(userId, postId);
    this.logger.log(`Lio gönderi planladı · gönderi=${postId.slice(0, 8)}… kullanıcı=${userId.slice(0, 8)}…`);
    return { planlandi: true, yayinZamani: zamaniGoster(vakit!), taslak: await this.ozet(postId, userId) };
  }

  /** "Vazgeç / iptal": taslağı ya da planlanmış gönderiyi iptal eder (yayımlanmışa dokunulmaz). */
  async iptalEt(userId: string, postId: string) {
    postIdDogrula(postId);
    const post = await this.social.findPost(postId, userId);
    if (post.status === "published") throw new BadRequestException("Yayımlanmış gönderi iptal edilemez.");
    if (post.status === "cancelled") throw new BadRequestException("Bu gönderi zaten iptal edilmiş.");
    // Durum "cancelled" olunca kuyruk hedefin saatini kaldırır (isQueueable).
    await this.social.updatePost(postId, { status: "cancelled" }, userId);
    gelenMedya.planlandi(userId, postId);
    return { iptalEdildi: true, taslak: await this.ozet(postId, userId) };
  }

  // ================================================================ yardımcılar

  private async hesapSatirlari(ids: string[]): Promise<any[]> {
    const { data, error } = await this.supabase.client.from("social_accounts").select("*").in("id", ids).is("archived_at", null);
    if (error) throw error;
    if ((data ?? []).length !== new Set(ids).size) {
      throw new BadRequestException("Hesaplardan biri bulunamadı; social_list_accounts'taki accountId'leri kullan.");
    }
    return data ?? [];
  }

  /** Medyayı gönderinin kapsamının Drive/OneDrive deposuna yazar; dosya kimliğini döner. */
  private async depoyaYaz(kapsam: SocialScope, userId: string, m: GelenMedya): Promise<string> {
    if (m.boyut > MEDYA_TEK_DOSYA_TAVANI) throw new BadRequestException("Dosya çok büyük (en çok 300 MB).");
    const dosya = { originalname: m.ad, mimetype: m.mimeType, size: m.boyut, buffer: m.buffer } as Express.Multer.File;
    const yuklenen =
      "jobId" in kapsam
        ? await this.files.uploadInline(kapsam.jobId, userId, dosya, {}, undefined, MEDYA_TEK_DOSYA_TAVANI)
        : await this.files.uploadInlineForFlat(
            kapsam.departmentId
              ? { kind: "department", id: kapsam.departmentId }
              : { kind: "organization", id: kapsam.organizationId },
            userId,
            dosya,
            undefined,
            MEDYA_TEK_DOSYA_TAVANI
          );
    return yuklenen.id;
  }

  private async ozet(postId: string, userId: string): Promise<TaslakOzeti> {
    const post = await this.social.findPost(postId, userId);
    const hesapIdleri = post.targets.map((t) => t.accountId);
    const { data } = hesapIdleri.length
      ? await this.supabase.client.from("social_accounts").select("id, handle").in("id", hesapIdleri)
      : { data: [] as any[] };
    const ad = new Map((data ?? []).map((a: any) => [a.id, a.handle]));
    return {
      postId: post.id,
      hesaplar: hesapIdleri.map((id) => `@${ad.get(id) ?? "?"}`),
      icerikTuru: post.contentType,
      denemeReels: post.trialReel ?? null,
      medya: post.media.map((m) => ({ ad: m.name ?? "medya", tur: (m.mimeType ?? "").startsWith("video/") ? "video" : "görsel" })),
      aciklama: post.caption ?? null,
      etiketler: post.hashtags ?? null,
      yayinZamani: post.scheduledAt ? zamaniGoster(new Date(post.scheduledAt)) : null,
      durum: post.status,
    };
  }
}
