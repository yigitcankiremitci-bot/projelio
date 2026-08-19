import type { MailAddress, MailMessage, MailMessageDetail } from "@projelio/shared";

/**
 * Graph yanıtlarının Projelio biçimine çevrilmesi ve yanıt metninin kurulması.
 *
 * Servislerden AYRI bir dosyada: burada HTTP ya da veritabanı taklidi
 * gerektirmeden test edilebilecek saf kurallar var (module-access.ts ve
 * publish-format.ts ile aynı gerekçe).
 */

interface GraphRecipient {
  emailAddress?: { name?: string; address?: string };
}

function toAddress(recipient: GraphRecipient | undefined): MailAddress | undefined {
  const address = recipient?.emailAddress?.address;
  if (!address) return undefined;
  return { name: recipient?.emailAddress?.name || undefined, address };
}

function toAddresses(recipients: GraphRecipient[] | undefined): MailAddress[] {
  return (recipients ?? []).map(toAddress).filter((a): a is MailAddress => Boolean(a));
}

/**
 * HTML gövdeden okunabilir düz metin.
 *
 * Tam bir HTML ayrıştırıcı değil ve olmamalı: bu metin ekranda gösterilmiyor,
 * Lio'ya bağlam olarak ve önizleme için gidiyor. Amaç anlamı korumak —
 * paragraf ve satır sonlarını boşluğa çevirmek, etiketleri düşürmek, HTML
 * varlıklarını çözmek.
 *
 * `<script>`/`<style>` içerikleri ÖNCE atılır: aksi halde CSS kuralları ve JS
 * kodu "metin" sanılıp Lio'nun bağlamını kirletiyordu.
 */
export function htmlToText(html: string | undefined | null): string {
  if (!html) return "";
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

/** Metni HTML'e gömerken kaçış — yanıt gövdesi kullanıcı metninden kuruluyor. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function mapMessage(raw: any): MailMessage {
  return {
    id: raw.id,
    conversationId: raw.conversationId ?? undefined,
    // Konusuz e-posta gerçek bir durum; listede boş satır görünmesin.
    subject: raw.subject?.trim() || "(konu yok)",
    from: toAddress(raw.from ?? raw.sender),
    to: toAddresses(raw.toRecipients),
    preview: (raw.bodyPreview ?? "").replace(/\s+/g, " ").trim(),
    receivedAt: raw.receivedDateTime,
    isRead: Boolean(raw.isRead),
    hasAttachments: Boolean(raw.hasAttachments),
    importance: raw.importance,
    webLink: raw.webLink ?? undefined,
  };
}

export function mapMessageDetail(raw: any): MailMessageDetail {
  const isHtml = raw.body?.contentType?.toLowerCase() === "html";
  const content: string = raw.body?.content ?? "";

  return {
    ...mapMessage(raw),
    cc: toAddresses(raw.ccRecipients),
    bodyHtml: isHtml ? content : undefined,
    // Düz metin gövdeler olduğu gibi, HTML olanlar sadeleştirilerek.
    bodyText: isHtml ? htmlToText(content) : content.trim(),
    attachments: (raw.attachments ?? []).map((a: any) => ({
      id: a.id,
      name: a.name ?? "ek",
      contentType: a.contentType ?? "application/octet-stream",
      sizeBytes: a.size ?? 0,
    })),
  };
}

/**
 * Yanıt gövdesi.
 *
 * Graph'ın `reply` eylemi orijinal iletiyi kendisi alıntılıyor; bize yalnızca
 * ÜSTTE duracak metin düşüyor. Kullanıcının yazdığı düz metni HTML'e çevirip
 * imzayı ekliyoruz.
 *
 * Satır sonları korunur: e-postada paragraf yapısı anlamın parçası ve düz
 * metni HTML'e olduğu gibi koymak bütün satırları tek bloğa yapıştırıyordu.
 */
export function buildReplyBody(text: string, signature?: string | null): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((block) => escapeHtml(block.trim()).replace(/\n/g, "<br>"))
    .filter(Boolean)
    .map((block) => `<p>${block}</p>`)
    .join("");

  if (!signature?.trim()) return paragraphs;

  // İmza zaten HTML ise olduğu gibi, düz metinse kaçırılarak eklenir.
  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(signature);
  const signatureHtml = looksLikeHtml
    ? signature
    : `<p>${escapeHtml(signature.trim()).replace(/\n/g, "<br>")}</p>`;

  return `${paragraphs}<br>${signatureHtml}`;
}

/**
 * Graph hata gövdesinden kullanıcıya gösterilecek cümle.
 *
 * Ham gövde ({"error":{"code":"ErrorAccessDenied","message":"Access is denied.
 * Check credentials and try again."}}) teknik; sık görülen birkaç kodu
 * Türkçeleştiriyoruz, kalanı olduğu gibi geçiyor — hata ayıklanabilir kalsın.
 */
export function describeGraphError(status: number, body: string): string {
  let code = "";
  let message = "";
  try {
    const parsed = JSON.parse(body) as { error?: { code?: string; message?: string } };
    code = parsed.error?.code ?? "";
    message = parsed.error?.message ?? "";
  } catch {
    // JSON değilse aşağıdaki duruma göre karar veriyoruz.
  }

  if (status === 401 || code === "InvalidAuthenticationToken") {
    return "Posta bağlantısının süresi dolmuş. Kutuyu yeniden bağlayın.";
  }
  if (status === 403 || code === "ErrorAccessDenied") {
    return "Bu kutuya erişim izni yok. Paylaşılan kutuda 'tam erişim' yetkisi gerekiyor olabilir.";
  }
  if (status === 404 || code === "ErrorItemNotFound") {
    return "İleti bulunamadı; başka bir yere taşınmış ya da silinmiş olabilir.";
  }
  if (status === 429) {
    return "Microsoft istek sınırına takıldı, biraz sonra tekrar deneyin.";
  }
  return message || `Posta servisi hata döndürdü (${status}).`;
}
