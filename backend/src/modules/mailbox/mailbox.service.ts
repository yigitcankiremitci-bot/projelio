import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { MailAccount, MailFolder, MailListPage, MailMessageDetail } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { AiAssistantService } from "../ai-assistant/ai-assistant.service";
import { MicrosoftAccountsService } from "../microsoft/microsoft-accounts.service";
import { ModuleMembersService } from "../module-members/module-members.service";
import { GraphMailService } from "./graph-mail.service";
import { buildReplyBody } from "./mail-format";

/**
 * E-posta modülünün gelen kutusu.
 *
 * İKİ ŞEYİ BİRDEN YAPMAZ: kutunun kime açık olduğu (yetki) burada, Graph'ın
 * nasıl konuştuğu GraphMailService'te. Gmail eklendiğinde yalnızca ikincisinin
 * bir eşi yazılacak.
 *
 * PAYLAŞILAN KUTU MODELİ: kutu bir KİŞİYE değil MODÜLE bağlanır. Modüle yazma
 * yetkisi olan herkes okur ve yanıtlar; okuma bağlayan kişinin Microsoft
 * bağlantısı üzerinden yapılır (bkz. 064_mail_accounts.sql). Bu bilinçli bir
 * ödün: departman e-postası kurumsal bir kutudur, ama bağlayan kişi bunu
 * bilerek yapmalıdır — arayüz bağlama anında açıkça söyler.
 *
 * İLETİ SAKLANMAZ. Her istek Graph'a gider. Yavaş ama doğru: e-postayı
 * kopyalamak onu Projelio'nun saklama/silme sorumluluğuna sokardı.
 */

export const MAIL_MODULE_KEY = "pd_email";

export type MailScope = { organizationId: string; departmentId?: string } | { jobId: string };

function mapAccount(row: any, connectedByName?: string): MailAccount {
  return {
    id: row.id,
    organizationId: row.organization_id ?? undefined,
    jobId: row.job_id ?? undefined,
    departmentId: row.department_id ?? undefined,
    provider: row.provider ?? "microsoft",
    address: row.address,
    displayName: row.display_name ?? undefined,
    sharedMailbox: row.shared_mailbox ?? undefined,
    signature: row.signature ?? undefined,
    connectedBy: row.connected_by ?? undefined,
    connectedByName,
    active: row.active ?? true,
    connectionError: row.connection_error ?? undefined,
    createdAt: row.created_at,
  };
}

@Injectable()
export class MailboxService {
  private readonly logger = new Logger(MailboxService.name);

  constructor(
    private supabase: SupabaseService,
    private moduleMembers: ModuleMembersService,
    private msAccounts: MicrosoftAccountsService,
    private graph: GraphMailService,
    private ai: AiAssistantService
  ) {}

  // ============================================================ Yetki

  private async access(scope: MailScope, userId?: string) {
    if ("jobId" in scope) return this.moduleMembers.resolveJobAccess(scope.jobId, MAIL_MODULE_KEY, userId);
    return this.moduleMembers.resolveOrganizationAccess(
      scope.organizationId,
      MAIL_MODULE_KEY,
      userId,
      scope.departmentId
    );
  }

  /**
   * Kutuyu OKUMAK bile yazma yetkisi ister.
   *
   * Alışılmadık ama kasıtlı: modülü "görebilen" (departman üyesi ama modüle
   * atanmamış) biri kayıt listesini görebilir, ama bir e-posta kutusunun içi
   * kayıt listesi değildir — müşteri yazışması, özlük konusu, sözleşme
   * pazarlığı olabilir. Kutuya yalnızca modüle ATANMIŞ kişiler girer.
   */
  private async assertMailAccess(scope: MailScope, userId?: string): Promise<void> {
    if (!userId) return;
    const access = await this.access(scope, userId);
    if (!access.canWrite) {
      throw new ForbiddenException(
        "Gelen kutusuna yalnızca bu modüle atanmış kişiler erişebilir."
      );
    }
  }

  private scopeOf(row: {
    organization_id?: string | null;
    job_id?: string | null;
    department_id?: string | null;
  }): MailScope {
    return row.job_id
      ? { jobId: row.job_id }
      : { organizationId: row.organization_id as string, departmentId: row.department_id ?? undefined };
  }

  // ============================================================ Kutular

  async listAccounts(scope: MailScope, userId?: string): Promise<MailAccount[]> {
    await this.assertMailAccess(scope, userId);

    const query = this.supabase.client
      .from("mail_accounts")
      .select("*, users:connected_by(full_name)")
      .is("archived_at", null)
      .order("created_at", { ascending: true });

    const { data, error } = await ("jobId" in scope
      ? query.eq("job_id", scope.jobId)
      : query.eq("organization_id", scope.organizationId));
    if (error) throw error;
    return (data ?? []).map((row: any) => mapAccount(row, row.users?.full_name));
  }

  /**
   * OAuth dönüşünde kutuyu modüle bağlar.
   *
   * Aynı kapsamda aynı adres ikinci kez bağlanırsa yeni satır açılmaz,
   * mevcut kayıt tazelenir — kullanıcı "bağlantım koptu" diye yeniden
   * bağladığında kutusu ikiye bölünmesin.
   */
  async linkAccount(params: {
    scope: MailScope;
    userId: string;
    microsoftAccountId: string;
    address: string;
    displayName?: string;
    sharedMailbox?: string;
  }): Promise<MailAccount> {
    await this.assertMailAccess(params.scope, params.userId);

    const scopeColumns =
      "jobId" in params.scope
        ? { job_id: params.scope.jobId, organization_id: null, department_id: null }
        : {
            organization_id: params.scope.organizationId,
            job_id: null,
            department_id: params.scope.departmentId ?? null,
          };

    const existing = (await this.listAccountRows(params.scope)).find(
      (a: any) => a.address?.toLowerCase() === params.address.toLowerCase()
    );

    const patch = {
      ...scopeColumns,
      provider: "microsoft",
      microsoft_account_id: params.microsoftAccountId,
      address: params.address,
      display_name: params.displayName ?? null,
      shared_mailbox: params.sharedMailbox ?? null,
      connected_by: params.userId,
      connection_error: null,
      active: true,
      last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = existing
      ? await this.supabase.client.from("mail_accounts").update(patch).eq("id", existing.id).select("*").single()
      : await this.supabase.client.from("mail_accounts").insert(patch).select("*").single();
    if (error) throw error;
    return mapAccount(data);
  }

  async updateAccount(
    accountId: string,
    input: { signature?: string; displayName?: string; active?: boolean },
    userId: string
  ): Promise<MailAccount> {
    const row = await this.accountRow(accountId);
    await this.assertMailAccess(this.scopeOf(row), userId);

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.signature !== undefined) patch.signature = input.signature.trim() || null;
    if (input.displayName !== undefined) patch.display_name = input.displayName.trim() || null;
    if (input.active !== undefined) patch.active = input.active;

    const { data, error } = await this.supabase.client
      .from("mail_accounts")
      .update(patch)
      .eq("id", accountId)
      .select("*")
      .single();
    if (error) throw error;
    return mapAccount(data);
  }

  /**
   * Kutuyu modülden kaldırır.
   *
   * Microsoft bağlantısına DOKUNMAZ: aynı hesap OneDrive için de kullanılıyor
   * olabilir ve kullanıcı yalnızca "bu kutu ekibe kapansın" demiştir. Jetonu
   * gerçekten iptal etmek Ayarlar'daki ayrı bir eylem.
   */
  async unlinkAccount(accountId: string, userId: string): Promise<{ ok: true }> {
    const row = await this.accountRow(accountId);
    await this.assertMailAccess(this.scopeOf(row), userId);

    const { error } = await this.supabase.client
      .from("mail_accounts")
      .update({ archived_at: new Date().toISOString(), active: false })
      .eq("id", accountId);
    if (error) throw error;
    return { ok: true };
  }

  // ============================================================ Posta işlemleri

  async listFolders(accountId: string, userId: string): Promise<MailFolder[]> {
    const { row, token } = await this.open(accountId, userId);
    return this.graph.listFolders(token, row.shared_mailbox);
  }

  async listMessages(
    accountId: string,
    userId: string,
    options: { folderId?: string; skip?: number; search?: string }
  ): Promise<MailListPage> {
    const { row, token } = await this.open(accountId, userId);
    return this.graph.listMessages(token, { ...options, sharedMailbox: row.shared_mailbox });
  }

  async getMessage(accountId: string, messageId: string, userId: string): Promise<MailMessageDetail> {
    const { row, token } = await this.open(accountId, userId);
    return this.graph.getMessage(token, messageId, row.shared_mailbox);
  }

  async markRead(accountId: string, messageId: string, isRead: boolean, userId: string): Promise<{ ok: true }> {
    const { row, token } = await this.open(accountId, userId);
    await this.graph.markRead(token, messageId, isRead, row.shared_mailbox);
    return { ok: true };
  }

  /**
   * Yanıt / tümünü yanıtla / ilet.
   *
   * Gövde düz metin olarak gelir, HTML'e burada çevrilir ve kutunun imzası
   * eklenir. Ön yüzün HTML üretmesine izin vermiyoruz: kullanıcı metnini
   * doğrudan gövdeye koymak, e-postaya HTML enjekte etmenin en kolay yolu
   * olurdu (bkz. mail-format.ts escapeHtml).
   */
  async reply(
    accountId: string,
    messageId: string,
    input: { text?: string; mode?: "reply" | "replyAll" | "forward"; to?: string[] },
    userId: string
  ): Promise<{ ok: true }> {
    const { row, token } = await this.open(accountId, userId);
    if (!input.text?.trim()) throw new BadRequestException("Yanıt metni boş olamaz");

    const mode = input.mode ?? "reply";
    if (mode === "forward" && !(input.to ?? []).length) {
      throw new BadRequestException("İletmek için en az bir alıcı gerekli");
    }

    await this.graph.reply(token, {
      messageId,
      mode,
      to: input.to,
      bodyHtml: buildReplyBody(input.text, row.signature),
      sharedMailbox: row.shared_mailbox,
    });
    return { ok: true };
  }

  /**
   * Lio ile yanıt taslağı.
   *
   * LIO GÖNDERMEZ, YAZAR. Üretilen metin doğrudan yanıt kutusuna düşer;
   * kullanıcı okur, düzeltir, gönder düğmesine kendisi basar. Otomatik
   * gönderilen bir e-posta geri alınamaz ve yanlış cümle şirketin adına
   * kurulmuş olur — bu yüzden akışta insan onayı zorunlu bir halka.
   *
   * Modele giden bağlam bilinçli olarak dar: gelen iletinin metni, konusu ve
   * kullanıcının niyeti. Kutunun tamamı ya da başka müşterilerin yazışmaları
   * gönderilmiyor.
   */
  async draftReply(
    accountId: string,
    messageId: string,
    input: { instruction?: string; tone?: string },
    userId: string
  ): Promise<{ text: string }> {
    const message = await this.getMessage(accountId, messageId, userId);
    const row = await this.accountRow(accountId);

    const system = [
      "Sen bir iş e-postası yanıt taslağı yazıyorsun. Türkçe yaz.",
      "Kurallar: kısa ve net ol, gereksiz nezaket kalıbı yığma, somut soruları somut yanıtla.",
      "Emin olmadığın bilgiyi UYDURMA — bilmediğin bir tarih/fiyat/durum varsa yerine [ ] içinde yer tutucu bırak.",
      "Yalnızca yanıt METNİNİ döndür: selamlama ve kapanış dahil, ama konu satırı, imza ya da açıklama ekleme.",
      row.signature ? "İmza sistem tarafından ayrıca ekleniyor; sen imza yazma." : "",
      input.tone ? `İstenen üslup: ${input.tone}.` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const prompt = [
      `Gelen e-posta konusu: ${message.subject}`,
      `Gönderen: ${message.from?.name ?? ""} <${message.from?.address ?? "bilinmiyor"}>`,
      "",
      "Gelen e-postanın metni:",
      // Uzun zincirlerde en alttaki alıntılar bağlamı taşımıyor ama maliyeti
      // taşıyor; başı yeterli.
      message.bodyText.slice(0, 6000),
      "",
      input.instruction?.trim()
        ? `Yanıtta şunu söylemek istiyorum: ${input.instruction.trim()}`
        : "Uygun bir yanıt taslağı yaz.",
    ].join("\n");

    return this.ai.draftText({ userId, system, prompt });
  }

  // ============================================================ Yardımcılar

  /**
   * Kutuyu kullanıma açar: yetki kontrolü + erişim jetonu.
   *
   * Jeton, kutuyu BAĞLAYAN kişinin Microsoft hesabından alınır; isteği yapan
   * kişininkinden değil. Ortak kutu modelinin özü bu — ve tam da bu yüzden
   * yetki kontrolü burada, tek kapıda duruyor.
   */
  private async open(accountId: string, userId: string): Promise<{ row: any; token: string }> {
    const row = await this.accountRow(accountId);
    await this.assertMailAccess(this.scopeOf(row), userId);

    if (!row.active) throw new BadRequestException("Bu kutu pasif durumda.");
    if (!row.microsoft_account_id) throw new BadRequestException("Kutunun Microsoft bağlantısı yok.");

    try {
      const token = await this.msAccounts.mailAccessToken(row.microsoft_account_id);
      return { row, token };
    } catch (err) {
      // Bağlantı düştüyse kullanıcıya tek cümleyle söylüyoruz; ham hata log'da.
      const message = "Posta bağlantısı geçersiz. Kutuyu bağlayan kişinin yeniden bağlanması gerekiyor.";
      this.logger.warn(`Posta jetonu alınamadı (kutu ${accountId}): ${(err as Error).message}`);
      await this.supabase.client
        .from("mail_accounts")
        .update({ connection_error: message, last_checked_at: new Date().toISOString() })
        .eq("id", accountId);
      throw new BadRequestException(message);
    }
  }

  private async accountRow(accountId: string): Promise<any> {
    const { data, error } = await this.supabase.client
      .from("mail_accounts")
      .select("*")
      .eq("id", accountId)
      .is("archived_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Kutu bulunamadı");
    return data;
  }

  private async listAccountRows(scope: MailScope): Promise<any[]> {
    const query = this.supabase.client.from("mail_accounts").select("*").is("archived_at", null);
    const { data, error } = await ("jobId" in scope
      ? query.eq("job_id", scope.jobId)
      : query.eq("organization_id", scope.organizationId));
    if (error) throw error;
    return data ?? [];
  }
}
