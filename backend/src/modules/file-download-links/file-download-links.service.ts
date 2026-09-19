import { randomBytes } from "node:crypto";
import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type {
  CreateFileDownloadLinkInput,
  FileDownloadLink,
  FileDownloadLinkClosedReason,
  PublicFileAccess,
  FileDownloadLinkSendResult,
  PublicFileView,
  UpdateFileDownloadLinkInput,
} from "@projelio/shared";
import { isLikelyEmail, normalizeShareEmail, shareEmailMatches } from "@projelio/shared";
import { getWebAppUrl } from "../../common/config/env";
import { LISTE_TAVANI } from "../../common/liste-tavani";
import { SupabaseService } from "../../database/supabase.service";
import { EmailService } from "../auth/email.service";
import { FilesService } from "../files/files.service";
import { NotificationsService } from "../notifications/notifications.service";
import { boyutMetni, dosyaTuruEtiketi, gorunenAd } from "./dosya-turu";
import {
  indirildiHtml,
  indirildiKonusu,
  indirildiMetni,
  kopyaKonusu,
  paylasimHtml,
  paylasimKonusu,
  paylasimMetni,
} from "./indirme-linki-eposta";
import { adresleriAyikla } from "./alici-adresleri";
import { linkGondereni } from "./link-gondereni";

/** İçerik adresine eklenen kısa ömürlü jetonun gövdesi. */
interface IcerikJetonu {
  typ: "file_link_content";
  linkId: string;
  /**
   * Çok dosyalı bağlantıda hangi dosya. Jetonun İÇİNDE, adreste değil: adreste
   * olsaydı alıcı kimliği değiştirip paketin dışındaki bir dosyayı isteyebilirdi.
   * Yoksa (114'ün jetonları) bağlantının tek dosyası.
   */
  fileId?: string;
}

/**
 * Bir bağlantıdaki dosya tavanı.
 *
 * Alıcının sayfası her dosya için buluttan künye okuyor (erişim her açılışta
 * yeniden doğrulanıyor, bkz. sınıf yorumu). Tavansız bir paket, tek bir sayfa
 * açılışını yüzlerce bulut çağrısına çevirirdi.
 */
export const PAKET_DOSYA_TAVANI = 50;

/**
 * Jetonun ömrü.
 *
 * 30 dakika: büyük bir dosyayı önizleyip indirmeye karar vermek için bol bol
 * yetiyor, ama adres bir yere yapıştırılırsa (sohbet, ticket) kısa sürede
 * ölüyor. Uzun ömür, linkin kapatılmasını da anlamsızlaştırırdı — asıl karar
 * her indirmede VERİTABANINDAN yeniden okunuyor (bkz. icerikIcinCoz), jeton
 * yalnızca "bu sekme kapıyı geçti" demek.
 */
const ICERIK_JETONU_SANIYE = 30 * 60;

/**
 * Üyelik gerektirmeyen tek dosyalık indirme linkleri (bkz. migration 114).
 *
 * NE YAPIYOR: kullanıcı bir dosyaya sağ tıklayıp link üretir ve Projelio'da
 * hesabı olmayan birine gönderir. Açan kişi dosyayı önizler, indirir; sahibi
 * indirmeyi kapatabilir, linki kaldırabilir ve indirildiğinde haber alır.
 *
 * GÜVENLİK:
 *
 * 1. Token tek koruma katmanı: 24 bayt (192 bit) base64url. Loglara,
 *    bildirimlere ve hata mesajlarına yazılmaz.
 * 2. İÇERİK, LİNKİ OLUŞTURANIN ERİŞİMİYLE ÇEKİLİR. Her okumada
 *    FilesService.findById(fileId, created_by) çağrılıyor — yani oluşturan kişi
 *    işten/departmandan çıkarıldığında link de kendiliğinden ölüyor. Dosyanın
 *    kimliğini bir kez kaydedip sonra kontrolsüz servis etmek, ayrılan bir
 *    çalışanın paylaştığı linkin sonsuza kadar açık kalması demekti.
 * 3. Her karar OKUMA ANINDA veriliyor: iptal, süre ve indirme anahtarı
 *    jetonun içinde taşınmıyor; sahibi "indirmeyi kapat" dediğinde elde
 *    dolaşan jetonlar da o an işlevsiz kalıyor.
 * 4. Yönetim uçları YALNIZCA kendi satırını görür (created_by). Dosyaya
 *    erişebilen herkesin başkasının linkini/token'ını görmesi, paylaşımı
 *    yapan kişinin kararını başkasına devretmek olurdu.
 */
@Injectable()
export class FileDownloadLinksService {
  private readonly logger = new Logger(FileDownloadLinksService.name);

  constructor(
    private supabase: SupabaseService,
    private files: FilesService,
    private email: EmailService,
    private notifications: NotificationsService,
    private jwt: JwtService
  ) {}

  // ==================================================================== Yönetim

  /**
   * Bu kullanıcının bu dosya için oluşturduğu linkler.
   *
   * Dosyaya erişimi olmayan kişi listeyi göremez: findById yetkiyi çözüyor.
   */
  async list(fileId: string, userId: string): Promise<FileDownloadLink[]> {
    await this.files.findById(fileId, userId);

    const { data, error } = await this.supabase.client
      .from("file_download_links")
      .select()
      .eq("file_id", fileId)
      .eq("created_by", userId)
      .order("created_at", { ascending: false })
      .limit(LISTE_TAVANI);
    if (error) throw error;

    // Bu dosyayı İÇEREN paket bağlantıları da listede: paketi kapatmak
    // isteyen kişinin başka bir yolu yok — paket penceresi yalnızca
    // oluşturulurken açılıyor. İlk dosyası bu olan paketler zaten yukarıda.
    const { data: paketSatirlari, error: paketHatasi } = await this.supabase.client
      .from("file_download_link_files")
      .select("link_id")
      .eq("file_id", fileId)
      .limit(LISTE_TAVANI);
    // Tablo okunamazsa (121 henüz uygulanmadıysa) tek dosyalık liste yine
    // döner: paket özelliği yüzünden 114'ün penceresi de açılmaz olmasın.
    if (paketHatasi) this.logger.warn(`Paket bağlantıları okunamadı: ${paketHatasi.message}`);

    const bilinen = new Set((data ?? []).map((r: any) => r.id));
    const eksik = (paketSatirlari ?? []).map((r: any) => r.link_id).filter((id: string) => !bilinen.has(id));
    let paketler: any[] = [];
    if (eksik.length) {
      const { data: ek, error: ekHatasi } = await this.supabase.client
        .from("file_download_links")
        .select()
        .in("id", eksik)
        .eq("created_by", userId);
      if (ekHatasi) throw ekHatasi;
      paketler = ek ?? [];
    }

    const satirlar = [...(data ?? []), ...paketler].sort((a, b) =>
      String(b.created_at).localeCompare(String(a.created_at))
    );
    return Promise.all(satirlar.map((row) => this.mapRow(row)));
  }

  async create(
    fileId: string,
    userId: string,
    input: CreateFileDownloadLinkInput
  ): Promise<FileDownloadLink> {
    const { file } = await this.files.findById(fileId, userId);

    const { data, error } = await this.supabase.client
      .from("file_download_links")
      .insert({
        file_id: fileId,
        token: yeniToken(),
        label: temizEtiket(input?.label),
        recipient_email: temizAlici(input?.recipientEmail),
        // Varsayılanlar bilerek AÇIK: link oluşturmanın amacı dosyayı
        // gönderebilmek. Kapalı başlasaydı her paylaşım iki adım olurdu.
        download_enabled: input?.downloadEnabled !== false,
        notify_on_download: input?.notifyOnDownload !== false,
        expires_at: sureden(input?.expiresInDays),
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw error;

    return this.mapLink(data, [fileId], [file.name]);
  }

  /**
   * Birden fazla dosyayı TEK bağlantıda paylaşır (bkz. migration 121).
   *
   * Her dosyaya erişim AYRI AYRI doğrulanıyor: seçimin tamamı aynı ekrandan
   * gelse de kimlikler istemciden geliyor ve biri erişilemeyen bir dosyanın
   * kimliğini listeye ekleyebilir. Tek bir dosya bile reddedilirse bağlantı
   * hiç üretilmez — "9'u paylaşıldı, 1'i sessizce düştü" alıcıya eksik bir
   * paket göndermek olurdu.
   */
  async createMany(userId: string, input: CreateFileDownloadLinkInput): Promise<FileDownloadLink> {
    const ids = [...new Set((input?.fileIds ?? []).filter((id) => typeof id === "string" && id))];
    if (!ids.length) throw new BadRequestException("En az bir dosya seçin");
    if (ids.length > PAKET_DOSYA_TAVANI) {
      // Sabit metin: istisna mesajları çeviri anahtarı, şablon dizesi olamaz.
      throw new BadRequestException("Bir bağlantıda en fazla 50 dosya olabilir");
    }
    // Tek dosya: 114'ün yolu. Paket tablosuna tek satır yazmak, aynı şeyin
    // iki farklı biçimde saklanması olurdu.
    if (ids.length === 1) return this.create(ids[0], userId, input);

    const dosyalar = await Promise.all(ids.map((id) => this.files.findById(id, userId)));

    const { data, error } = await this.supabase.client
      .from("file_download_links")
      .insert({
        file_id: ids[0],
        file_count: ids.length,
        token: yeniToken(),
        label: temizEtiket(input?.label),
        recipient_email: temizAlici(input?.recipientEmail),
        download_enabled: input?.downloadEnabled !== false,
        notify_on_download: input?.notifyOnDownload !== false,
        expires_at: sureden(input?.expiresInDays),
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw error;

    const { error: listeHatasi } = await this.supabase.client
      .from("file_download_link_files")
      .insert(ids.map((fileId, position) => ({ link_id: data.id, file_id: fileId, position })));
    if (listeHatasi) {
      // Dosya listesi yazılamadıysa bağlantı da kalmamalı: yalnızca ilk
      // dosyayı açan, sayısı yanlış bir paket kimsenin istediği şey değil.
      await this.supabase.client.from("file_download_links").delete().eq("id", data.id);
      throw listeHatasi;
    }

    return this.mapLink(data, ids, dosyalar.map((d) => d.file.name));
  }

  /**
   * Linkin ayarlarını değiştirir.
   *
   * Token DEĞİŞMEZ: sahibi "indirmeyi de aç" dediğinde daha önce gönderdiği
   * bağlantı çalışmaya devam etmeli. Linki gerçekten kapatmak isteyen kaldırır.
   */
  async update(id: string, userId: string, input: UpdateFileDownloadLinkInput): Promise<FileDownloadLink> {
    const mevcut = await this.kendiLinki(id, userId);

    const guncel: Record<string, unknown> = {};
    if (input.label !== undefined) guncel.label = temizEtiket(input.label);
    if (input.recipientEmail !== undefined) guncel.recipient_email = temizAlici(input.recipientEmail ?? undefined);
    if (input.downloadEnabled !== undefined) guncel.download_enabled = input.downloadEnabled === true;
    if (input.notifyOnDownload !== undefined) guncel.notify_on_download = input.notifyOnDownload === true;
    if (input.expiresInDays !== undefined) guncel.expires_at = sureden(input.expiresInDays);

    if (Object.keys(guncel).length === 0) return this.mapRow(mevcut);

    const { data, error } = await this.supabase.client
      .from("file_download_links")
      .update(guncel)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return this.mapRow(data);
  }

  /** Linki kapatır. Satır SİLİNMEZ, `revoked_at` damgalanır (bkz. migration 114). */
  async revoke(id: string, userId: string): Promise<FileDownloadLink> {
    const mevcut = await this.kendiLinki(id, userId);
    // Zaten kapalı linki yeniden damgalamak, "ne zaman kapattım" cevabını bozardı.
    if (mevcut.revoked_at) return this.mapRow(mevcut);

    const { data, error } = await this.supabase.client
      .from("file_download_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return this.mapRow(data);
  }

  /**
   * Linki alıcının e-postasına gönderir.
   *
   * GÖNDEREN link@ alan adı (bkz. link-gondereni.ts), YANIT gönderen kişinin
   * kendi adresi: alıcı "bu dosya ne?" diye yanıtladığında mesaj Projelio'ya
   * değil, paylaşan kişiye gitmeli.
   *
   * Sonuç `sent: false` dönebilir ve arayüz buna bakmak zorunda: "gönderildi"
   * deyip göndermemek, karşı tarafın beklediği bir dosyada en pahalı sessiz
   * hata olurdu.
   */
  async sendByEmail(
    id: string,
    userId: string,
    input: { email?: string; emails?: string[]; note?: string }
  ): Promise<FileDownloadLinkSendResult> {
    const row = await this.kendiLinki(id, userId);
    const kapali = kapanmaSebebi(row);
    if (kapali) throw new BadRequestException("Kapalı bir bağlantı gönderilemez");

    const adresler = adresleriAyikla([...(input?.emails ?? []), input?.email ?? ""]);

    const ozet = await this.dosyaOzeti(row);
    const dosyaAdi = gorunenAd(ozet.adlar);
    const gonderen = await this.kullanici(userId);

    const govde = {
      dosyaAdi,
      // Pakette alıcı NE geldiğini mesajdan görebilmeli; "a.pdf ve 4 dosya
      // daha" tek başına muhasebecinin "hepsi geldi mi" sorusunu cevaplamaz.
      dosyaAdlari: ozet.adlar.length > 1 ? ozet.adlar : undefined,
      paylasanAdi: gonderen?.full_name || undefined,
      not: input?.note?.trim() ? input.note.trim().slice(0, 1000) : undefined,
      url: linkUrl(row.token),
      boyutMetni: boyutMetni(ozet.toplamBoyut),
    };
    const mail = {
      subject: paylasimKonusu({ dosyaAdi, paylasanAdi: govde.paylasanAdi, dosyaSayisi: ozet.adlar.length }),
      html: paylasimHtml(govde),
      text: paylasimMetni(govde),
      from: linkGondereni(process.env.EMAIL_FROM, process.env.EMAIL_FROM_LINK) ?? undefined,
      replyTo: gonderen?.email || undefined,
    };

    // SIRAYLA, tek istekte değil: Resend'in `to` dizisi tüm alıcıları aynı
    // mesajın başlığında GÖSTERİR — bir müşteriye gönderilen dosyanın yanında
    // diğer müşterilerin adresleri görünürdü. Ayrıca adres başına sonuç
    // ancak ayrı gönderimle bilinebiliyor.
    const results: { email: string; sent: boolean }[] = [];
    for (const adres of adresler) {
      results.push({ email: adres, sent: await this.email.sendPrepared(adres, mail) });
    }

    // Gönderene KENDİ KOPYASI. Gerekçe: gönderen, karşı tarafın tam olarak neyi
    // gördüğünü kontrol etmek istiyor (not doğru yazılmış mı, bağlantı çalışıyor
    // mu). Ayrı bir "gönderdiniz" özeti bu soruyu cevaplamazdı; bu yüzden
    // alıcıya giden mesajın AYNISI, üstünde "kime gitti" şeridiyle yollanıyor.
    //
    // Hepsi düştüyse kopya da gitmez: gitmemiş bir mesajın kopyası yanıltıcı
    // olurdu. Gönderen zaten alıcılar arasındaysa ikinci bir kopya yollanmaz.
    const gidenler = results.filter((r) => r.sent).map((r) => r.email);
    if (gidenler.length && gonderen?.email && !adresler.includes(gonderen.email.toLowerCase())) {
      const kopya = { ...govde, kopyaAlicilari: gidenler };
      void this.email
        .sendPrepared(gonderen.email, {
          subject: kopyaKonusu(dosyaAdi),
          html: paylasimHtml(kopya),
          text: paylasimMetni(kopya),
          from: mail.from,
        })
        .catch(() => undefined);
    }

    return { results, link: this.mapLink(row, ozet.ids, ozet.adlar) };
  }

  // ===================================================== Linki açan kişi (public)

  /**
   * Linki açan kişinin ilk çağrısı.
   *
   * Kapalı link ile HİÇ VAR OLMAMIŞ link aynı yanıtı alır: "bu token bir
   * zamanlar vardı" bilgisi bile sızıntıdır.
   */
  async resolve(token: string, email?: string): Promise<PublicFileAccess> {
    const kapali: PublicFileAccess = { state: "closed" };
    // Uzunluk elemesi: biçimi tutmayan token için veritabanına hiç gitmeyelim.
    if (!token || token.length < 16 || token.length > 64) return kapali;

    const row = await this.tokenlaBul(token);
    if (!row || kapanmaSebebi(row)) return kapali;

    if (row.recipient_email) {
      if (email === undefined) return { state: "email_required" };
      if (!shareEmailMatches(row.recipient_email, email)) {
        return { state: "email_required", emailRejected: true };
      }
    }

    // Dosyanın künyesi, linki OLUŞTURANIN erişimiyle okunuyor: o kişi dosyaya
    // erişemez olduysa link de kapanır (bkz. sınıf yorumu).
    const view = await this.gorunum(row).catch(() => null);
    if (!view) return kapali;

    // Sayaç kapının ARDINDAN artıyor: yanlış adres deneyen biri sahibin
    // "linke bakan oldu mu" sorusunu kirletmesin.
    void this.sayacArtir(row, "view");
    return { state: "open", view };
  }

  /**
   * İçerik jetonunu çözer ve dosyayı açar.
   *
   * KARAR BURADA YENİDEN VERİLİYOR: jeton yalnızca hangi linke ait olduğunu
   * söylüyor; iptal, süre ve indirme anahtarı bu anda veritabanından okunuyor.
   */
  async icerikIcinCoz(
    contentToken: string,
    indir: boolean
  ): Promise<{ response: Response; fileName: string; mimeType: string; link: any; fileId: string }> {
    const { link, fileId } = await this.jetondanLink(contentToken);

    // "İndirme kapalı" ile "link yok" AYRI: burada gerçek sebebi söylemek
    // güvenlik açığı değil, çünkü kişi zaten linki açabilmiş durumda.
    if (indir && link.download_enabled !== true) {
      throw new BadRequestException("Bu bağlantıda indirme kapatılmış");
    }

    const { response, fileName, mimeType } = await this.files.openDownload(fileId, link.created_by);
    return { response, fileName, mimeType, link, fileId };
  }

  /** Önizlemesi olmayan türler için sağlayıcının küçük resmi. */
  async icerikIcinKucukResim(contentToken: string): Promise<Response | null> {
    const { link, fileId } = await this.jetondanLink(contentToken);
    return this.files.openThumbnail(fileId, link.created_by).catch(() => null);
  }

  /**
   * İndirme gerçekleşti: sayaç + (tercih açıksa) e-posta ve uygulama içi bildirim.
   *
   * ÇAĞRAN BEKLEMEZ (bkz. controller): dosya akmaya başladıktan sonra tetikleniyor,
   * burada çıkan bir hata indirmeyi bozmamalı.
   */
  async indirmeyiKaydet(link: any, fileId: string = link.file_id): Promise<void> {
    const sayilar = await this.sayacArtir(link, "download");
    if (link.notify_on_download !== true) return;

    // Pakette indirilen DOSYANIN adı: sahibi "hangisini aldı" diye merak ediyor.
    const dosyaAdi = await this.dosyaAdi(fileId);
    const sahip = await this.kullanici(link.created_by);

    // Uygulama içi bildirim: notifyUserSafe, çünkü sonucunu beklemiyoruz ve
    // bir DB hatası süreci öldürmemeli (bkz. NotificationsService).
    this.notifications.notifyUserSafe(
      link.created_by,
      "file_link_downloaded",
      { metin: "Paylaştığınız dosya indirildi" },
      { metin: '"{ad}" indirildi', params: { ad: dosyaAdi } }
    );

    if (!sahip?.email) return;
    const govde = {
      dosyaAdi,
      // Kapı varsa indiren kişinin adresini biliyoruz; yoksa uydurmuyoruz.
      alaniAcanEposta: link.recipient_email ?? undefined,
      indirmeSayisi: sayilar.download_count,
      yonetimUrl: `${getWebAppUrl()}/`,
    };
    const gonderildi = await this.email.sendPrepared(sahip.email, {
      subject: indirildiKonusu(dosyaAdi),
      html: indirildiHtml(govde),
      text: indirildiMetni(govde),
      from: linkGondereni(process.env.EMAIL_FROM, process.env.EMAIL_FROM_LINK) ?? undefined,
    });
    if (!gonderildi) {
      this.logger.warn(`İndirme bildirimi e-postası gönderilemedi (link ${link.id})`);
    }
  }

  // ==================================================================== İçeriden

  private async gorunum(row: any): Promise<PublicFileView> {
    const ids = await this.dosyaListesi(row);
    const paket = ids.length > 1;

    // Pakette erişilemeyen ya da kaybolan dosya ATLANIR, bağlantı kalanlarla
    // açılır: gönderenin bir dosyayı silmesi ya da taşıması diğer dokuzunu da
    // kapatmamalı. Hiçbiri kalmadıysa bağlantı kapalı sayılır.
    const okunanlar = await Promise.all(
      ids.map((id) =>
        this.files
          .findById(id, row.created_by)
          .then(({ file }) => (file.status === "missing" ? null : { id, file }))
          .catch(() => null)
      )
    );
    const dosyalar = okunanlar.filter((d): d is NonNullable<typeof d> => d !== null);
    if (!dosyalar.length) throw new NotFoundException("Dosya bulunamadı");

    const sahip = await this.kullanici(row.created_by);

    const ogeler = dosyalar.map(({ id, file }) => ({
      name: file.name,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      kindLabel: dosyaTuruEtiketi(file.mimeType),
      // Yalnızca kendi sunucumuzdan güvenle gömülebilen türler: görsel ve PDF.
      // Diğerlerinde içerik ucu zaten indirmeye zorluyor (bkz. files.controller).
      canPreview: !file.isGoogleDoc && (file.mimeType.startsWith("image/") || file.mimeType === "application/pdf"),
      hasThumbnail: file.hasThumbnail === true,
      // Tek dosyada jeton 114'teki biçimde (fileId'siz) kalıyor; pakette
      // hangi dosyanın açılacağı jetonun içinde.
      contentToken: this.jwt.sign(
        (paket
          ? { typ: "file_link_content", linkId: row.id, fileId: id }
          : { typ: "file_link_content", linkId: row.id }) satisfies IcerikJetonu,
        { expiresIn: ICERIK_JETONU_SANIYE }
      ),
    }));
    const ilk = ogeler[0];

    return {
      ...ilk,
      downloadEnabled: row.download_enabled === true,
      sharedByName: sahip?.full_name || undefined,
      sharedAt: row.created_at,
      contentTokenExpiresInSeconds: ICERIK_JETONU_SANIYE,
      files: ogeler,
    };
  }

  /** Jetondan linke — kapalı/ölmüş link burada eleniyor. */
  private async jetondanLink(contentToken: string): Promise<{ link: any; fileId: string }> {
    if (!contentToken) throw new NotFoundException("Bağlantı bulunamadı");
    let claims: IcerikJetonu;
    try {
      claims = this.jwt.verify<IcerikJetonu>(contentToken);
    } catch {
      throw new NotFoundException("Bağlantının süresi doldu, sayfayı yenileyin");
    }
    if (claims?.typ !== "file_link_content" || !claims.linkId) {
      throw new NotFoundException("Bağlantı bulunamadı");
    }

    const { data, error } = await this.supabase.client
      .from("file_download_links")
      .select()
      .eq("id", claims.linkId)
      .maybeSingle();
    if (error) throw error;
    if (!data || kapanmaSebebi(data)) throw new NotFoundException("Bağlantı bulunamadı");

    // Jeton imzalı olsa da paketin listesi O AN yeniden okunuyor: jeton
    // üretildikten sonra dosya paketten düşmüş (silinmiş) olabilir.
    const fileId = claims.fileId ?? data.file_id;
    if (fileId !== data.file_id || (data.file_count ?? 1) > 1) {
      const ids = await this.dosyaListesi(data);
      if (!ids.includes(fileId)) throw new NotFoundException("Bağlantı bulunamadı");
    }
    return { link: data, fileId };
  }

  private async tokenlaBul(token: string): Promise<any | null> {
    const { data, error } = await this.supabase.client
      .from("file_download_links")
      .select()
      .eq("token", token)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  }

  /** Yönetim uçlarının tek kapısı: satır yoksa ya da başkasınınsa 404. */
  private async kendiLinki(id: string, userId: string): Promise<any> {
    const { data, error } = await this.supabase.client
      .from("file_download_links")
      .select()
      .eq("id", id)
      .eq("created_by", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Bağlantı bulunamadı");
    return data;
  }

  /**
   * Sayaçlar. Okuyup-yazıyoruz; eşzamanlı iki indirmede bir sayı kaybolabilir.
   * Kabul edilebilir: bu sayaç bir bilgi, bir kota değil — kilit maliyeti
   * yanlış yere harcanmış olurdu.
   */
  private async sayacArtir(link: any, tur: "view" | "download"): Promise<{ download_count: number }> {
    const simdi = new Date().toISOString();
    const guncel =
      tur === "view"
        ? { view_count: (link.view_count ?? 0) + 1, last_viewed_at: simdi }
        : { download_count: (link.download_count ?? 0) + 1, last_downloaded_at: simdi };
    try {
      await this.supabase.client.from("file_download_links").update(guncel).eq("id", link.id);
    } catch (error) {
      this.logger.warn(`Bağlantı sayacı güncellenemedi (${link.id}): ${String(error)}`);
    }
    return { download_count: (link.download_count ?? 0) + (tur === "download" ? 1 : 0) };
  }

  private async dosyaAdi(fileId: string): Promise<string> {
    const { data } = await this.supabase.client.from("files").select("name").eq("id", fileId).maybeSingle();
    return data?.name ?? "Dosya";
  }

  /**
   * Bağlantının dosyaları, seçilen sırayla.
   *
   * Tek dosyalık bağlantının paket tablosunda satırı YOK (bkz. migration 121);
   * onu okumaya gitmemek 114'ün her isteğinden bir sorgu tasarrufu.
   */
  private async dosyaListesi(row: any): Promise<string[]> {
    if ((row.file_count ?? 1) <= 1) return [row.file_id];
    const { data, error } = await this.supabase.client
      .from("file_download_link_files")
      .select("file_id")
      .eq("link_id", row.id)
      .order("position", { ascending: true })
      .limit(PAKET_DOSYA_TAVANI);
    if (error) throw error;
    return (data ?? []).map((r: any) => r.file_id);
  }

  /** Dosyaların adları ve toplam boyutu — sahibin listesi ve e-posta için. */
  private async dosyaOzeti(row: any): Promise<{ ids: string[]; adlar: string[]; toplamBoyut?: number }> {
    const ids = await this.dosyaListesi(row);
    const { data } = await this.supabase.client.from("files").select("id, name, size_bytes").in("id", ids);
    const bilgi = new Map((data ?? []).map((f: any) => [f.id, f]));
    // Silinmiş dosya listeden düşer (cascade); burada kalan tek sebep yarış.
    const mevcut = ids.filter((id) => bilgi.has(id));
    const boyutlar = mevcut.map((id) => bilgi.get(id)?.size_bytes);
    return {
      ids: mevcut,
      adlar: mevcut.map((id) => bilgi.get(id)?.name ?? "Dosya"),
      // Boyutu bilinmeyen bir dosya varsa toplam YAZILMAZ: eksik toplam, doğru
      // görünen yanlış bir sayı olurdu.
      toplamBoyut: boyutlar.every((b) => b !== null && b !== undefined)
        ? boyutlar.reduce((t: number, b) => t + Number(b), 0)
        : undefined,
    };
  }

  private async mapRow(row: any): Promise<FileDownloadLink> {
    const { ids, adlar } = await this.dosyaOzeti(row);
    return this.mapLink(row, ids, adlar);
  }

  private async kullanici(userId: string): Promise<{ full_name?: string; email?: string } | null> {
    const { data } = await this.supabase.client
      .from("users")
      .select("full_name, email")
      .eq("id", userId)
      .maybeSingle();
    return data ?? null;
  }

  private mapLink(row: any, fileIds: string[], fileNames: string[]): FileDownloadLink {
    const sebep = kapanmaSebebi(row);
    return {
      id: row.id,
      fileId: row.file_id,
      fileName: gorunenAd(fileNames),
      fileIds,
      fileNames,
      token: row.token,
      url: linkUrl(row.token),
      label: row.label ?? undefined,
      recipientEmail: row.recipient_email ?? undefined,
      downloadEnabled: row.download_enabled === true,
      notifyOnDownload: row.notify_on_download === true,
      expiresAt: row.expires_at ?? undefined,
      revokedAt: row.revoked_at ?? undefined,
      viewCount: row.view_count ?? 0,
      lastViewedAt: row.last_viewed_at ?? undefined,
      downloadCount: row.download_count ?? 0,
      lastDownloadedAt: row.last_downloaded_at ?? undefined,
      createdAt: row.created_at,
      active: !sebep,
      closedReason: sebep,
    };
  }
}

/**
 * Linkin kapanma sebebi — YALNIZCA sahibine gösterilir.
 *
 * İki sebep var ve sırası önemli: iptal edilmiş bir linkin süresi de dolmuş
 * olabilir, ama sahibinin gördüğü "kaldırıldı" olmalı — kararı o vermiş.
 */
export function kapanmaSebebi(row: {
  revoked_at?: string | null;
  expires_at?: string | null;
}): FileDownloadLinkClosedReason | undefined {
  if (row.revoked_at) return "revoked";
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return "expired";
  return undefined;
}

/**
 * 24 bayt = 192 bit rastgelelik, base64url ile 32 karakter.
 * Proje paylaşım linkiyle aynı ölçü (bkz. project-shares.service.ts).
 */
function yeniToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Kopyalanmaya hazır adres. Sayfanın yolu tek yerden gelsin diye burada. */
export function linkUrl(token: string): string {
  return `${getWebAppUrl()}/dosya/${encodeURIComponent(token)}`;
}

function temizEtiket(label?: string): string | null {
  const t = label?.trim();
  return t ? t.slice(0, 120) : null;
}

/**
 * E-posta kapısının adresi. Bariz hatalı adres REDDEDİLİR: yanlış yazılmış bir
 * adres kapıyı kimsenin açamayacağı hâle getirir ve sahibi bunu ancak alıcı
 * şikâyet edince öğrenirdi (bkz. migration 077).
 */
function temizAlici(email?: string): string | null {
  const normalized = normalizeShareEmail(email);
  if (!normalized) return null;
  if (!isLikelyEmail(normalized)) throw new BadRequestException("Geçerli bir e-posta adresi girin");
  return normalized;
}

/** Gün sayısını bitiş anına çevirir. null/undefined = süresiz. */
function sureden(days?: number | null): string | null {
  if (days === undefined || days === null) return null;
  if (!Number.isFinite(days) || days <= 0 || days > 3650) {
    throw new BadRequestException("Geçerli bir süre girin (1-3650 gün)");
  }
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}
