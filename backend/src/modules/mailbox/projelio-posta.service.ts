import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { MailAddress, MailFolder, MailListPage, MailMessage, MailMessageDetail } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { fetchWithTimeout } from "../../common/http/fetch-with-timeout";
import { NotificationsService } from "../notifications/notifications.service";
import { NotificationsGateway } from "../notifications/notifications.gateway";
import { ModuleMembersService } from "../module-members/module-members.service";
import { buildReplyBody, htmlToText } from "./mail-format";
import {
  adresListesi,
  adresAyristir,
  aliciMetniniAyristir,
  alintiEkle,
  ekYolu,
  gelenKlasoru,
  postaAlicilari,
  referanslar,
  yanitKonusu,
} from "./projelio-posta";

const RESEND_API = "https://api.resend.com";
const KOVA = "mail-ekleri";
const SAYFA = 50;

/**
 * Bir gönderimdeki eklerin ham toplam tavanı. Resend 40 MB kabul ediyor ama
 * base64 boyu ~%33 büyütüyor; 25 MB ham ≈ 33 MB gövde, altında kalıyoruz.
 */
export const GONDERIM_EK_TAVANI = 25 * 1024 * 1024;

/**
 * Kutu başına günlük giden posta tavanı. Kutular yalnızca yöneticinin
 * açtığı adresler ama modüle atanmış herkes gönderebiliyor; ele geçirilen bir
 * hesabın projelio.app'in gönderici itibarını bir gecede yakmasının önünde
 * duran tek şey bu.
 */
const GUNLUK_GONDERIM_TAVANI = 300;

export const PROJELIO_KLASORLERI: { id: "inbox" | "sent" | "spam" | "trash"; ad: string }[] = [
  { id: "inbox", ad: "Gelen kutusu" }, // dil:anahtar
  { id: "sent", ad: "Gönderilenler" }, // dil:anahtar
  { id: "spam", ad: "İstenmeyen" }, // dil:anahtar
  { id: "trash", ad: "Çöp kutusu" }, // dil:anahtar
];
type Klasor = (typeof PROJELIO_KLASORLERI)[number]["id"];

const LISTE_SUTUNLARI =
  "id, folder, direction, subject, from_address, from_name, to_addresses, body_text, is_read, has_attachments, received_at, send_error";

/** Gönderimde dosya: formdan yüklenen ya da iletilen postanın kovadaki eki. */
interface GidenEk {
  filename: string;
  content: Buffer;
  contentType?: string;
}

/**
 * @projelio.app kutularının postası: gelen (Resend webhook'u), giden (Resend
 * API'si) ve okuma. Outlook kutularındaki GraphMailService'in karşılığı;
 * yetki kararı burada YOK, MailboxService'in tek kapısında (`open`).
 *
 * Graph'tan farkı: iletiler bizde saklanıyor (bkz. migration 162) — sunucu
 * biziz, başka bir yerde okunabilen bir kopya yok.
 */
@Injectable()
export class ProjelioPostaService {
  private readonly logger = new Logger(ProjelioPostaService.name);
  private readonly apiKey = process.env.RESEND_API_KEY?.trim() ?? "";

  constructor(
    private supabase: SupabaseService,
    private notifications: NotificationsService,
    private gateway: NotificationsGateway,
    private moduleMembers: ModuleMembersService
  ) {}

  /** Gönderim yapılabilir mi — RESEND_API_KEY yoksa kutu açmanın anlamı yok. */
  get yapilandirildi(): boolean {
    return Boolean(this.apiKey);
  }

  // ============================================================ Okuma

  async listFolders(accountId: string): Promise<MailFolder[]> {
    // Dört küçük sayım: klasör başına toplam ve okunmamış. Görünüm/RPC yazmak
    // yerine bu — kutu başına birkaç bin iletide head:true sayımı ucuz.
    return Promise.all(
      PROJELIO_KLASORLERI.map(async (k) => {
        const [toplam, okunmamis] = await Promise.all([
          this.say(accountId, k.id),
          k.id === "inbox" || k.id === "spam" ? this.say(accountId, k.id, true) : Promise.resolve(0),
        ]);
        return { id: k.id, name: k.ad, totalCount: toplam, unreadCount: okunmamis };
      })
    );
  }

  async listMessages(
    accountId: string,
    options: { folderId?: string; skip?: number; search?: string }
  ): Promise<MailListPage> {
    const skip = Math.max(0, Number(options.skip) || 0);
    let query = this.supabase.client
      .from("mail_messages")
      .select(LISTE_SUTUNLARI)
      .eq("account_id", accountId)
      .order("received_at", { ascending: false })
      .range(skip, skip + SAYFA); // bir fazlası: "daha var mı" sorusu için

    const arama = options.search?.trim();
    if (arama) {
      // Arama ÇÖP DIŞINDAKİ her klasörde. Filtre metnine gömüldüğü için
      // PostgREST'in ayırıcıları (virgül, parantez) ve joker karakterler atılır.
      const temiz = arama.replace(/[,()%*\\]/g, " ").trim().slice(0, 100);
      query = query.neq("folder", "trash");
      if (temiz) {
        query = query.or(
          `subject.ilike.*${temiz}*,from_address.ilike.*${temiz}*,from_name.ilike.*${temiz}*,body_text.ilike.*${temiz}*`
        );
      }
    } else {
      query = query.eq("folder", klasorMu(options.folderId) ? options.folderId : "inbox");
    }

    const { data, error } = await query;
    if (error) throw error;
    const satirlar = data ?? [];
    return { messages: satirlar.slice(0, SAYFA).map(listeSatiri), hasMore: satirlar.length > SAYFA };
  }

  async getMessage(accountId: string, messageId: string): Promise<MailMessageDetail> {
    const row = await this.iletiSatiri(accountId, messageId);
    const { data: ekler, error } = await this.supabase.client
      .from("mail_attachments")
      .select("id, filename, content_type, size_bytes, storage_path")
      .eq("message_id", messageId)
      .order("created_at", { ascending: true });
    if (error) throw error;

    return {
      ...listeSatiri(row),
      cc: adresDizisi(row.cc_addresses),
      bodyHtml: row.body_html ?? undefined,
      bodyText: row.body_text ?? "",
      attachments: (ekler ?? []).map((e: any) => ({
        id: e.id,
        name: e.filename,
        contentType: e.content_type ?? "application/octet-stream",
        sizeBytes: e.size_bytes ?? 0,
        // Kovaya yazılamamış ek (tavan, Resend hatası) adıyla görünür ama indirilemez.
        downloadable: Boolean(e.storage_path),
      })),
      folder: row.folder,
      sendError: row.send_error ?? undefined,
    };
  }

  async markRead(accountId: string, messageId: string, isRead: boolean): Promise<void> {
    const { error } = await this.supabase.client
      .from("mail_messages")
      .update({ is_read: isRead })
      .eq("account_id", accountId)
      .eq("id", messageId);
    if (error) throw error;
  }

  /**
   * Klasör değiştirme. Kalıcı silme YOK: çöp kutusu da bir klasör. Ortak
   * kutuda bir kişinin "sil"i diğerlerinin postasını yok etmesin; gerçek
   * silme kutu arşivlendiğinde ya da ileride bir saklama süresiyle.
   */
  async moveMessage(accountId: string, messageId: string, istenen: string): Promise<void> {
    const row = await this.iletiSatiri(accountId, messageId);
    // "restore": çöpten/spam'den geri al — hedefi istemci bilmek zorunda değil,
    // iletinin yönü belirler.
    const folder = istenen === "restore" ? (row.direction === "out" ? "sent" : "inbox") : istenen;
    if (!klasorMu(folder)) throw new BadRequestException("Geçersiz klasör"); // dil:anahtar
    // Gönderilmiş bir ileti gelen kutusuna, gelen bir ileti gönderilenlere taşınmaz.
    if ((folder === "sent" && row.direction !== "out") || (folder === "inbox" && row.direction !== "in")) {
      throw new BadRequestException("İleti bu klasöre taşınamaz"); // dil:anahtar
    }
    const { error } = await this.supabase.client
      .from("mail_messages")
      .update({ folder })
      .eq("account_id", accountId)
      .eq("id", messageId);
    if (error) throw error;
  }

  /** Ekin süreli indirme bağlantısı. Kova özel; bağlantı 5 dakika geçerli. */
  async ekBaglantisi(accountId: string, attachmentId: string): Promise<{ url: string; filename: string }> {
    const { data, error } = await this.supabase.client
      .from("mail_attachments")
      .select("filename, storage_path, mail_messages!inner(account_id)")
      .eq("id", attachmentId)
      .eq("mail_messages.account_id", accountId)
      .maybeSingle();
    if (error) throw error;
    if (!data?.storage_path) throw new NotFoundException("Ek bulunamadı"); // dil:anahtar

    const { data: imzali, error: imzaHatasi } = await this.supabase.client.storage
      .from(KOVA)
      .createSignedUrl(data.storage_path, 300, { download: data.filename });
    if (imzaHatasi || !imzali?.signedUrl) throw new BadRequestException("Ek bağlantısı oluşturulamadı"); // dil:anahtar
    return { url: imzali.signedUrl, filename: data.filename };
  }

  // ============================================================ Gönderme

  /**
   * Yeni e-posta. Gövde düz metin gelir, HTML'e burada çevrilir (Outlook
   * yanıtındaki gerekçe: istemcinin HTML üretmesine izin vermiyoruz).
   */
  async compose(
    kutu: any,
    input: { to?: string | string[]; cc?: string | string[]; subject?: string; text?: string },
    ekler: GidenEk[],
    userId: string
  ): Promise<{ ok: true; id: string }> {
    const to = this.alicilar(input.to, true);
    const cc = this.alicilar(input.cc, false);
    const konu = (input.subject ?? "").trim();
    if (!konu) throw new BadRequestException("Konu boş olamaz"); // dil:anahtar
    if (!input.text?.trim()) throw new BadRequestException("E-posta metni boş olamaz"); // dil:anahtar

    return this.gonder(kutu, {
      to,
      cc,
      subject: konu.slice(0, 300),
      html: buildReplyBody(input.text, kutu.signature),
      ekler,
      userId,
    });
  }

  /** Yanıt / tümünü yanıtla / ilet — orijinal alıntılanır, zincir başlıkları kurulur. */
  async reply(
    kutu: any,
    messageId: string,
    input: { text?: string; mode?: "reply" | "replyAll" | "forward"; to?: string[] },
    userId: string,
    yeniEkler: GidenEk[] = []
  ): Promise<{ ok: true; id: string }> {
    if (!input.text?.trim()) throw new BadRequestException("Yanıt metni boş olamaz");
    const mod = input.mode ?? "reply";
    const orijinal = await this.iletiSatiri(kutu.id, messageId);
    const kendi = String(kutu.address).toLowerCase();

    let to: string[];
    let cc: string[] = [];
    if (mod === "forward") {
      to = this.alicilar(input.to, true);
    } else {
      // Kendi gönderdiğimiz bir iletiyi "yanıtlamak" = aynı kişilere tekrar yazmak.
      const karsi =
        orijinal.direction === "out"
          ? adresDizisi(orijinal.to_addresses).map((a) => a.address)
          : [adresAyristir(orijinal.reply_to)?.address ?? orijinal.from_address].filter(Boolean);
      to = tekil(karsi).filter((a) => a !== kendi);
      if (mod === "replyAll") {
        const digerleri = [
          ...adresDizisi(orijinal.to_addresses).map((a) => a.address),
          ...adresDizisi(orijinal.cc_addresses).map((a) => a.address),
        ];
        cc = tekil(digerleri).filter((a) => a !== kendi && !to.includes(a));
      }
      if (!to.length) throw new BadRequestException("Yanıtlanacak bir adres bulunamadı"); // dil:anahtar
    }

    const gonderen = orijinal.from_name ? `${orijinal.from_name} <${orijinal.from_address}>` : orijinal.from_address ?? "";
    const html = alintiEkle({
      govdeHtml: buildReplyBody(input.text, kutu.signature),
      tarih: new Date(orijinal.received_at).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" }),
      gonderen,
      orijinalHtml: orijinal.body_html,
      orijinalMetin: orijinal.body_text ?? "",
    });

    // İletmede orijinalin ekleri de gider; yanıtta gitmez (e-postanın alışılmış davranışı).
    const ekler = mod === "forward" ? [...(await this.kovadanEkler(messageId)), ...yeniEkler] : yeniEkler;

    return this.gonder(kutu, {
      to,
      cc,
      subject: yanitKonusu(orijinal.subject ?? "", mod),
      html,
      ekler,
      userId,
      inReplyTo: mod === "forward" ? undefined : orijinal.message_id_header ?? undefined,
      references: mod === "forward" ? undefined : referanslar(orijinal.references_header, orijinal.message_id_header),
    });
  }

  private async gonder(
    kutu: any,
    p: {
      to: string[];
      cc: string[];
      subject: string;
      html: string;
      ekler: GidenEk[];
      userId: string;
      inReplyTo?: string;
      references?: string;
    }
  ): Promise<{ ok: true; id: string }> {
    if (!this.apiKey) throw new BadRequestException("E-posta gönderimi bu kurulumda yapılandırılmamış."); // dil:anahtar

    const toplam = p.ekler.reduce((t, e) => t + e.content.length, 0);
    if (toplam > GONDERIM_EK_TAVANI) throw new BadRequestException("Eklerin toplamı 25 MB'ı geçemez"); // dil:anahtar

    const gunBasi = new Date();
    gunBasi.setHours(0, 0, 0, 0);
    const { count } = await this.supabase.client
      .from("mail_messages")
      .select("id", { count: "exact", head: true })
      .eq("account_id", kutu.id)
      .eq("direction", "out")
      .gte("created_at", gunBasi.toISOString());
    if ((count ?? 0) >= GUNLUK_GONDERIM_TAVANI) {
      throw new BadRequestException("Bu kutunun bugünkü gönderim sınırı doldu, yarın tekrar deneyin."); // dil:anahtar
    }

    // Message-ID'yi Resend koyuyor; kendimizinkini yazmıyoruz (Resend onu
    // ezmeyi garanti etmiyor, çakışan iki kimlik zinciri bozardı). Zincir için
    // gereken yalnızca karşı tarafın kimliği: In-Reply-To + References.
    const basliklar: Record<string, string> = {};
    if (p.inReplyTo) basliklar["In-Reply-To"] = p.inReplyTo;
    if (p.references) basliklar.References = p.references;

    const from = kutu.display_name ? `${tirnakla(kutu.display_name)} <${kutu.address}>` : kutu.address;
    const text = htmlToText(p.html);

    let resendId: string | null = null;
    let hata: string | null = null;
    try {
      const yanit = await fetchWithTimeout(
        `${RESEND_API}/emails`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from,
            to: p.to,
            ...(p.cc.length ? { cc: p.cc } : {}),
            subject: p.subject,
            html: p.html,
            text,
            ...(Object.keys(basliklar).length ? { headers: basliklar } : {}),
            ...(p.ekler.length
              ? {
                  attachments: p.ekler.map((e) => ({
                    filename: e.filename,
                    content: e.content.toString("base64"),
                    ...(e.contentType ? { content_type: e.contentType } : {}),
                  })),
                }
              : {}),
          }),
        },
        // Ekli gönderim yavaş olabiliyor; varsayılan 20 sn'yi aşmasın diye.
        60_000
      );
      const govde: any = await yanit.json().catch(() => ({}));
      if (!yanit.ok) {
        hata = String(govde?.message ?? `HTTP ${yanit.status}`).slice(0, 500);
        this.logger.error(`Posta gönderilemedi (${kutu.address} → ${p.to.join(", ")}): ${hata}`);
      } else {
        resendId = govde?.id ?? null;
      }
    } catch (err) {
      hata = (err as Error).message;
      this.logger.error(`Posta gönderilirken ağ hatası (${kutu.address}): ${hata}`);
    }

    // Başarısız gönderim de "Gönderilenler"e yazılır, hatasıyla birlikte:
    // kullanıcının yazdığı metin kaybolmasın, neden gitmediği görünsün.
    const { data: satir, error } = await this.supabase.client
      .from("mail_messages")
      .insert({
        account_id: kutu.id,
        folder: "sent",
        direction: "out",
        resend_id: resendId,
        message_id_header: null,
        in_reply_to: p.inReplyTo ?? null,
        references_header: p.references ?? null,
        from_address: kutu.address,
        from_name: kutu.display_name ?? null,
        to_addresses: p.to.map((address) => ({ address })),
        cc_addresses: p.cc.map((address) => ({ address })),
        subject: p.subject,
        body_html: p.html,
        body_text: text,
        is_read: true,
        has_attachments: p.ekler.length > 0,
        sent_by: p.userId,
        send_error: hata,
      })
      .select("id")
      .single();
    if (error) throw error;

    // Giden ekler kovaya yazılmıyor, yalnızca adları: gönderilenlerde "ne
    // ekledim" görünsün ama aynı dosya ikinci kez depolanmasın.
    if (p.ekler.length) {
      await this.supabase.client.from("mail_attachments").insert(
        p.ekler.map((e) => ({
          message_id: satir.id,
          filename: e.filename,
          content_type: e.contentType ?? null,
          size_bytes: e.content.length,
          storage_path: null,
        }))
      );
    }

    // Ekipteki diğer kişilerin (ve göndericinin diğer sekmelerinin) Gönderilenler'i tazelensin.
    void this.canliHaber(kutu).catch(() => undefined);

    if (hata) throw new BadRequestException(`E-posta gönderilemedi: ${hata}`);
    return { ok: true, id: satir.id };
  }

  // ============================================================ Gelen posta

  /**
   * Resend'in `email.received` olayı. Webhook yalnızca kimliği ve başlıkları
   * taşır; gövde ve ekler API'den ayrıca çekilir.
   *
   * Tekrar güvenli: Resend teslim edemediği olayı yeniden dener ve aynı ileti
   * (kutu, resend_id) tekil indeksine çarpar — ikinci kez yazılmaz.
   *
   * Hiçbir kutuya uymayan posta (yanlış yazılmış adres, kapatılmış kutu)
   * sessizce düşer; log'a yazılır. Gönderene geri dönüş (bounce) üretmiyoruz:
   * Google zaten kabul etmiş, geri dönüşü spam'cilerin sahte adreslerine
   * göndermek bizi kara listeye sokardı.
   */
  async gelenIsle(emailId: string): Promise<{ kutular: number }> {
    if (!this.apiKey) {
      this.logger.warn("Gelen posta olayı geldi ama RESEND_API_KEY yok; işlenemedi.");
      return { kutular: 0 };
    }

    const email = await this.resendGet(`/emails/receiving/${encodeURIComponent(emailId)}`);
    const alicilar = postaAlicilari(email);
    if (!alicilar.length) {
      this.logger.warn(`Gelen posta hiçbir @projelio.app adresine gitmiyor (resend ${emailId}), atlandı.`);
      return { kutular: 0 };
    }

    const { data: kutular, error } = await this.supabase.client
      .from("mail_accounts")
      .select("id, address, organization_id, department_id, job_id")
      .eq("provider", "projelio")
      .eq("active", true)
      .is("archived_at", null)
      .in("address", alicilar);
    if (error) throw error;
    if (!kutular?.length) {
      this.logger.warn(`Gelen posta için kutu yok: ${alicilar.join(", ")} (resend ${emailId}).`);
      return { kutular: 0 };
    }

    const gonderen = adresAyristir(email.headers?.from ?? email.from) ?? adresAyristir(email.from);
    const auth = email.authentication ?? null;
    const html: string | null = email.html ?? null;
    const metin: string = (email.text ?? "").trim() || htmlToText(html);
    const basliklar = email.headers ?? {};

    let yazilan = 0;
    for (const kutu of kutular) {
      const { data: satir, error: hata } = await this.supabase.client
        .from("mail_messages")
        .insert({
          account_id: kutu.id,
          folder: gelenKlasoru(auth),
          direction: "in",
          resend_id: emailId,
          message_id_header: email.message_id ?? null,
          in_reply_to: basliklarda(basliklar, "in-reply-to"),
          references_header: basliklarda(basliklar, "references"),
          from_address: gonderen?.address ?? null,
          from_name: gonderen?.name ?? null,
          to_addresses: adresListesi(email.to),
          cc_addresses: adresListesi(email.cc),
          reply_to: Array.isArray(email.reply_to) ? email.reply_to[0] ?? null : email.reply_to ?? null,
          subject: (email.subject ?? "").slice(0, 1000),
          body_html: html,
          body_text: metin,
          has_attachments: Array.isArray(email.attachments) && email.attachments.length > 0,
          auth_result: auth,
          received_at: email.created_at ?? new Date().toISOString(),
        })
        .select("id")
        .single();

      if (hata) {
        // 23505 = aynı olay ikinci kez geldi; beklenen durum.
        if ((hata as any).code === "23505") continue;
        throw hata;
      }
      yazilan++;

      await this.ekleriIndir(emailId, kutu.id, satir.id, email.attachments ?? []);
      // Ekran her durumda tazelenir (spam'e düşen de klasör sayısını değiştirir);
      // bildirim yalnızca gelen kutusuna düşende.
      void this.canliHaber(kutu, gelenKlasoru(auth) === "inbox" ? { gonderen, konu: email.subject ?? "" } : undefined).catch(
        (err) => this.logger.warn(`Posta haberi gönderilemedi (${kutu.address}): ${(err as Error).message}`)
      );
    }
    return { kutular: yazilan };
  }

  /**
   * Ekler Resend'den kovaya taşınır: Resend'in indirme bağlantıları bir saat
   * geçerli ve gelen postayı ne kadar sakladığı bizim elimizde değil.
   * Bir ekin düşmesi postanın kendisini düşürmez — ek adıyla görünür,
   * indirilemez olarak işaretlenir.
   */
  private async ekleriIndir(emailId: string, kutuId: string, iletiId: string, ekler: any[]): Promise<void> {
    let toplam = 0;
    for (const ek of ekler) {
      const dosyaAdi = String(ek.filename || "ek");
      let yol: string | null = null;
      try {
        if (toplam + (ek.size ?? 0) > GONDERIM_EK_TAVANI) throw new Error("toplam ek tavanı aşıldı");
        const bilgi = await this.resendGet(
          `/emails/receiving/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(ek.id)}`
        );
        const indirme = await fetchWithTimeout(bilgi.download_url, {}, 60_000);
        if (!indirme.ok) throw new Error(`indirme HTTP ${indirme.status}`);
        const icerik = Buffer.from(await indirme.arrayBuffer());
        toplam += icerik.length;
        if (toplam > GONDERIM_EK_TAVANI) throw new Error("toplam ek tavanı aşıldı");

        const aday = ekYolu(kutuId, iletiId, String(ek.id), dosyaAdi);
        const { error } = await this.supabase.client.storage.from(KOVA).upload(aday, icerik, {
          contentType: ek.content_type || "application/octet-stream",
          upsert: true,
        });
        if (error) throw new Error(error.message);
        yol = aday;
      } catch (err) {
        this.logger.warn(`Posta eki kaydedilemedi (${dosyaAdi}, resend ${emailId}): ${(err as Error).message}`);
      }

      await this.supabase.client.from("mail_attachments").insert({
        message_id: iletiId,
        filename: dosyaAdi.slice(0, 250),
        content_type: ek.content_type ?? null,
        size_bytes: ek.size ?? 0,
        storage_path: yol,
        content_id: ek.content_id ?? null,
      });
    }
  }

  /**
   * Kutuya erişebilen herkese (modülün onaylı üyeleri + sahip) canlı "kutu
   * değişti" olayı; `bildirim` verilirse ayrıca uygulama içi bildirim.
   */
  private async canliHaber(kutu: any, bildirim?: { gonderen: MailAddress | undefined; konu: string }): Promise<void> {
    const kisiler = await this.erisenler(kutu);
    for (const userId of kisiler) this.gateway.sendMailChanged(userId, { accountId: kutu.id });
    if (bildirim) this.haberVer(kutu, kisiler, bildirim.gonderen, bildirim.konu);
  }

  private async erisenler(kutu: any): Promise<Set<string>> {
    const kisiler = new Set<string>();
    if (kutu.job_id) {
      const { data: is } = await this.supabase.client.from("jobs").select("owner_id").eq("id", kutu.job_id).maybeSingle();
      if (is?.owner_id) kisiler.add(is.owner_id);
      for (const u of await this.moduleMembers.findByJobModule(kutu.job_id, "pd_email")) {
        if (u.userId && u.status === "approved") kisiler.add(u.userId);
      }
    } else if (kutu.organization_id) {
      const { data: org } = await this.supabase.client
        .from("organizations")
        .select("owner_id")
        .eq("id", kutu.organization_id)
        .maybeSingle();
      if (org?.owner_id) kisiler.add(org.owner_id);
      const uyeler = await this.moduleMembers.findByOrganizationModule(
        kutu.organization_id,
        "pd_email",
        kutu.department_id ?? undefined
      );
      for (const u of uyeler) if (u.userId && u.status === "approved") kisiler.add(u.userId);
    }
    return kisiler;
  }

  private haberVer(kutu: any, kisiler: Set<string>, gonderen: MailAddress | undefined, konu: string): void {
    const link = kutu.job_id
      ? `/jobs/${kutu.job_id}/modules/pd_email`
      : kutu.department_id
        ? `/departments/${kutu.department_id}/modules/pd_email`
        : undefined;
    const gonderenAdi = gonderen?.name || gonderen?.address || "";
    for (const userId of kisiler) {
      this.notifications.notifyUserSafe(
        userId,
        "mail_received",
        { metin: "{adres} kutusuna yeni e-posta", params: { adres: kutu.address } },
        konu.trim()
          ? { metin: "{gonderen}: {konu}", params: { gonderen: gonderenAdi, konu: konu.trim().slice(0, 200) } }
          : { metin: "{gonderen} (konusuz)", params: { gonderen: gonderenAdi } },
        link
      );
    }
  }

  // ============================================================ Yardımcılar

  private alicilar(metin: string | string[] | undefined, zorunlu: boolean): string[] {
    const { adresler, gecersiz } = aliciMetniniAyristir(metin);
    if (gecersiz.length) {
      throw new BadRequestException(`Geçersiz adres: ${gecersiz.slice(0, 3).join(", ")}`);
    }
    if (zorunlu && !adresler.length) throw new BadRequestException("En az bir alıcı gerekli"); // dil:anahtar
    if (adresler.length > 50) throw new BadRequestException("Bir e-postada en fazla 50 alıcı olabilir"); // dil:anahtar
    return adresler;
  }

  private async kovadanEkler(messageId: string): Promise<GidenEk[]> {
    const { data } = await this.supabase.client
      .from("mail_attachments")
      .select("filename, content_type, storage_path")
      .eq("message_id", messageId);
    const sonuc: GidenEk[] = [];
    for (const ek of data ?? []) {
      if (!ek.storage_path) continue;
      const { data: blob } = await this.supabase.client.storage.from(KOVA).download(ek.storage_path);
      if (blob) {
        sonuc.push({
          filename: ek.filename,
          content: Buffer.from(await blob.arrayBuffer()),
          contentType: ek.content_type ?? undefined,
        });
      }
    }
    return sonuc;
  }

  private async iletiSatiri(accountId: string, messageId: string): Promise<any> {
    const { data, error } = await this.supabase.client
      .from("mail_messages")
      .select("*")
      .eq("account_id", accountId)
      .eq("id", messageId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("İleti bulunamadı"); // dil:anahtar
    return data;
  }

  private async say(accountId: string, folder: Klasor, okunmamis = false): Promise<number> {
    let q = this.supabase.client
      .from("mail_messages")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .eq("folder", folder);
    if (okunmamis) q = q.eq("is_read", false);
    const { count, error } = await q;
    if (error) throw error;
    return count ?? 0;
  }

  private async resendGet(yol: string): Promise<any> {
    const yanit = await fetchWithTimeout(`${RESEND_API}${yol}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    const govde: any = await yanit.json().catch(() => ({}));
    if (!yanit.ok) throw new Error(`Resend ${yol} → HTTP ${yanit.status}: ${govde?.message ?? ""}`);
    return govde;
  }
}

function klasorMu(deger: string | undefined): deger is Klasor {
  return PROJELIO_KLASORLERI.some((k) => k.id === deger);
}

function adresDizisi(ham: unknown): MailAddress[] {
  if (!Array.isArray(ham)) return [];
  return ham
    .filter((a: any) => a && typeof a.address === "string")
    .map((a: any) => ({ name: a.name || undefined, address: String(a.address).toLowerCase() }));
}

function tekil(adresler: (string | null | undefined)[]): string[] {
  return [...new Set(adresler.filter((a): a is string => Boolean(a)).map((a) => a.toLowerCase()))];
}

function basliklarda(basliklar: Record<string, unknown>, ad: string): string | null {
  for (const [k, v] of Object.entries(basliklar)) {
    if (k.toLowerCase() === ad && typeof v === "string") return v.slice(0, 4000);
  }
  return null;
}

/** Görünen adda virgül ya da tırnak varsa adres başlığı bozulmasın. */
function tirnakla(ad: string): string {
  return /[",<>@;:]/.test(ad) ? `"${ad.replace(/["\\]/g, "")}"` : ad;
}

function listeSatiri(row: any): MailMessage & { folder?: string; sendError?: string } {
  const gidenMi = row.direction === "out";
  const to = adresDizisi(row.to_addresses);
  return {
    id: row.id,
    subject: row.subject?.trim() || "(konu yok)",
    // Gönderilenlerde listede "kime" görünür; e-posta istemcilerinin alışkanlığı.
    from: gidenMi ? to[0] : row.from_address ? { name: row.from_name || undefined, address: row.from_address } : undefined,
    to,
    preview: (row.body_text ?? "").replace(/\s+/g, " ").trim().slice(0, 160),
    receivedAt: row.received_at,
    isRead: Boolean(row.is_read),
    hasAttachments: Boolean(row.has_attachments),
    folder: row.folder,
    sendError: row.send_error ?? undefined,
  };
}
