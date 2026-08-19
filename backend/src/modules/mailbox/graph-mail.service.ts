import { HttpException, Injectable, Logger } from "@nestjs/common";
import type { MailFolder, MailListPage, MailMessageDetail } from "@projelio/shared";
import { describeGraphError, mapMessage, mapMessageDetail } from "./mail-format";

/**
 * Microsoft Graph'ın posta uçlarına ince bir sarmalayıcı.
 *
 * Yalnızca HTTP bilir: yetki, kapsam ve hangi kutunun kime ait olduğu bir üst
 * katmanın (MailboxService) işi. Böylece Gmail eklendiğinde bu dosyanın bir
 * eşi yazılır, üst katman değişmez.
 *
 * KUTU YOLU: kullanıcının kendi kutusu `/me`, paylaşılan kutu
 * `/users/{adres}`. Paylaşılan kutuya erişim, bağlayan kişinin Exchange
 * tarafında o kutuda "tam erişim" yetkisi olmasına bağlı — yetki yoksa Graph
 * 403 döner ve mesajı kullanıcıya olduğu gibi gösteririz.
 */

const GRAPH = "https://graph.microsoft.com/v1.0";

/** Liste satırında gövde çekmiyoruz: 25 iletinin tam gövdesi megabaytlarca. */
const LIST_FIELDS =
  "id,conversationId,subject,from,toRecipients,bodyPreview,receivedDateTime,isRead,hasAttachments,importance,webLink";

const DETAIL_FIELDS = `${LIST_FIELDS},ccRecipients,body`;

@Injectable()
export class GraphMailService {
  private readonly logger = new Logger(GraphMailService.name);

  /** Kutunun Graph tabanı. */
  private base(sharedMailbox?: string | null): string {
    return sharedMailbox ? `${GRAPH}/users/${encodeURIComponent(sharedMailbox)}` : `${GRAPH}/me`;
  }

  async listFolders(accessToken: string, sharedMailbox?: string | null): Promise<MailFolder[]> {
    const json = await this.request<{ value: any[] }>(
      accessToken,
      `${this.base(sharedMailbox)}/mailFolders?$top=25&$select=id,displayName,unreadItemCount,totalItemCount`
    );
    return (json.value ?? []).map((f) => ({
      id: f.id,
      name: f.displayName,
      unreadCount: f.unreadItemCount ?? 0,
      totalCount: f.totalItemCount ?? 0,
    }));
  }

  /**
   * Bir klasörün iletileri.
   *
   * `hasMore`, istenenden bir fazlasını çekip anlaşılıyor: Graph'ın
   * `@odata.nextLink`'i imzalı bir adres ve ön yüze taşınması gerekirdi;
   * "bir fazlası" hem daha ucuz hem de sayfalama durumunu bizde tutuyor.
   */
  async listMessages(
    accessToken: string,
    options: { folderId?: string; skip?: number; top?: number; search?: string; sharedMailbox?: string | null }
  ): Promise<MailListPage> {
    const top = Math.min(options.top ?? 25, 50);
    const base = this.base(options.sharedMailbox);

    // Arama bütün kutuda yapılır: kullanıcı "şu müşteriden gelen postayı"
    // ararken hangi klasörde olduğunu bilmiyor.
    const path = options.search
      ? `${base}/messages?$search=${encodeURIComponent(`"${options.search.replace(/"/g, "")}"`)}&$top=${top + 1}&$select=${LIST_FIELDS}`
      : `${base}/mailFolders/${encodeURIComponent(options.folderId || "inbox")}/messages` +
        `?$top=${top + 1}&$skip=${options.skip ?? 0}&$select=${LIST_FIELDS}&$orderby=receivedDateTime desc`;

    const json = await this.request<{ value: any[] }>(accessToken, path);
    const rows = json.value ?? [];
    return { messages: rows.slice(0, top).map(mapMessage), hasMore: rows.length > top };
  }

  async getMessage(
    accessToken: string,
    messageId: string,
    sharedMailbox?: string | null
  ): Promise<MailMessageDetail> {
    const base = this.base(sharedMailbox);
    const message = await this.request<any>(
      accessToken,
      `${base}/messages/${encodeURIComponent(messageId)}?$select=${DETAIL_FIELDS}`
    );

    // Ekler ayrı bir çağrı: $expand=attachments ek İÇERİĞİNİ de getiriyor ve
    // birkaç megabaytlık bir yanıt doğuyor. Bize yalnızca ad/boyut lazım.
    let attachments: any[] = [];
    if (message.hasAttachments) {
      const json = await this.request<{ value: any[] }>(
        accessToken,
        `${base}/messages/${encodeURIComponent(messageId)}/attachments?$select=id,name,contentType,size`
      ).catch(() => ({ value: [] as any[] }));
      attachments = json.value ?? [];
    }

    return mapMessageDetail({ ...message, attachments });
  }

  /**
   * Yanıtla / tümünü yanıtla / ilet.
   *
   * Graph'ın kendi eylemlerini kullanıyoruz: alıntılamayı, konuşma başlığını
   * ("RE:", "FW:") ve alıcı listesini Outlook'un kendi kurallarıyla kuruyor.
   * Elle kursaydık her istemcide farklı görünen, konuşma zincirinden kopan
   * yanıtlar üretirdik.
   */
  async reply(
    accessToken: string,
    params: {
      messageId: string;
      bodyHtml: string;
      mode: "reply" | "replyAll" | "forward";
      /** İletmede zorunlu. */
      to?: string[];
      sharedMailbox?: string | null;
    }
  ): Promise<void> {
    const action = params.mode === "replyAll" ? "replyAll" : params.mode === "forward" ? "forward" : "reply";
    const body: Record<string, unknown> = { comment: params.bodyHtml };
    if (params.mode === "forward") {
      body.toRecipients = (params.to ?? []).map((address) => ({ emailAddress: { address } }));
    }

    await this.request(
      accessToken,
      `${this.base(params.sharedMailbox)}/messages/${encodeURIComponent(params.messageId)}/${action}`,
      { method: "POST", body }
    );
  }

  async markRead(
    accessToken: string,
    messageId: string,
    isRead: boolean,
    sharedMailbox?: string | null
  ): Promise<void> {
    await this.request(
      accessToken,
      `${this.base(sharedMailbox)}/messages/${encodeURIComponent(messageId)}`,
      { method: "PATCH", body: { isRead } }
    );
  }

  /**
   * Kutunun gerçek adresini okur — BEST EFFORT.
   *
   * Neden hata fırlatmıyor: bu bilgi bir kolaylık. Adres zaten id_token'da var
   * (ya da paylaşılan kutuda kullanıcı elle yazdı); `/me` yalnızca takma ad /
   * UPN farkını düzeltmek için sorulur. Başarısız olduğunda bağlantıyı
   * reddetmek, düzeltilebilir bir ayrıntı yüzünden çalışan bir kurulumu
   * çöpe atmak olurdu.
   *
   * PAYLAŞILAN KUTUDA HİÇ SORULMAZ: `/users/{adres}` dizin okuması demek ve
   * `User.Read.All` ister — o izin yönetici onayı gerektiriyor. Adresi zaten
   * kullanıcı yazdığı için sormaya gerek de yok.
   */
  async probe(accessToken: string, sharedMailbox?: string | null): Promise<{ address?: string; name?: string }> {
    if (sharedMailbox) return {};

    try {
      const json = await this.request<any>(accessToken, `${GRAPH}/me?$select=mail,userPrincipalName,displayName`);
      return { address: json.mail ?? json.userPrincipalName, name: json.displayName };
    } catch (err) {
      this.logger.warn(`Kutu adresi Graph'tan okunamadı, id_token'daki adres kullanılacak: ${(err as Error).message}`);
      return {};
    }
  }

  // ============================================================ HTTP

  private async request<T>(
    accessToken: string,
    url: string,
    options: { method?: string; body?: unknown } = {}
  ): Promise<T> {
    const res = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!res.ok) {
      const raw = await res.text();
      this.logger.error(`Graph ${options.method ?? "GET"} başarısız (${res.status}): ${raw.slice(0, 500)}`);
      // Durum kodunu koruyoruz: ön yüz 401'de "yeniden bağlan" diyebilsin.
      throw new HttpException(describeGraphError(res.status, raw), res.status === 429 ? 503 : res.status);
    }

    // 202/204: gövde yok (reply, markRead).
    if (res.status === 202 || res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
}
