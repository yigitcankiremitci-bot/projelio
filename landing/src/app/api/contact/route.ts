import { NextResponse } from "next/server";
import { site } from "@/lib/site";
import { autoReplyEmail, notificationEmail, type ContactData } from "@/lib/emails";

/**
 * İletişim formu.
 *
 * İki e-posta gönderir:
 *   1. Size bildirim        → CONTACT_TO adresine
 *   2. Gönderene otomatik yanıt → formu dolduran kişiye ("mesajınızı aldık")
 *
 * Vercel'de tanımlanacak değişkenler:
 *   RESEND_API_KEY = re_xxx                        (resend.com)
 *   CONTACT_TO     = info@projelio.app             (mesajların düşeceği adres)
 *   CONTACT_FROM   = Projelio <merhaba@projelio.app>
 *
 * ÖNEMLİ: Otomatik yanıtın çalışması için alan adının Resend'de doğrulanmış
 * olması gerekir. Doğrulanmamışsa Resend yalnızca hesap sahibinin adresine
 * gönderim yapar; bu durumda otomatik yanıt sessizce atlanır, size gelen
 * bildirim etkilenmez.
 *
 * Anahtar hiç tanımlı değilse form yine çalışır; mesaj sunucu loguna yazılır.
 */

type Payload = Partial<Record<keyof ContactData | "consent" | "website", string>>;

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

type Mail = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  reply_to?: string;
};

async function send(apiKey: string, mail: Mail) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(mail),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * Gönderen adresini "Projelio <adres>" biçimine getirir.
 *
 * CONTACT_FROM'a sadece `merhaba@projelio.app` yazılırsa e-posta istemcileri
 * gönderen adı olarak "merhaba" gösterir. Görünen ad yoksa marka adını ekleriz.
 */
function senderFrom(): string {
  const raw = (process.env.CONTACT_FROM ?? "").trim();
  if (!raw) return `${site.name} <onboarding@resend.dev>`;
  if (raw.includes("<")) return raw;
  return `${site.name} <${raw}>`;
}

export async function POST(request: Request) {
  let body: Payload;
  try {
    body = (await request.json()) as Payload;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Bal küpü alanı doluysa bot demektir; sessizce başarılı dön.
  if (body.website) return NextResponse.json({ ok: true });

  const data: ContactData = {
    name: (body.name ?? "").trim().slice(0, 120),
    email: (body.email ?? "").trim().slice(0, 160),
    company: (body.company ?? "").trim().slice(0, 120),
    phone: (body.phone ?? "").trim().slice(0, 40),
    subject: (body.subject ?? "").trim().slice(0, 120),
    message: (body.message ?? "").trim().slice(0, 4000),
    locale: body.locale === "en" ? "en" : "tr",
  };

  if (!data.name || !isEmail(data.email) || data.message.length < 5) {
    return NextResponse.json({ error: "validation" }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_TO ?? site.email;
  const from = senderFrom();

  if (!apiKey) {
    console.log("[contact] RESEND_API_KEY tanımlı değil — mesaj yalnızca loglandı:", data);
    return NextResponse.json({ ok: true, delivered: false });
  }

  // 1) Bildirim — başarısız olursa kullanıcıya hata gösterilir.
  const notify = notificationEmail(data);
  try {
    await send(apiKey, {
      from,
      to: [to],
      reply_to: data.email,
      subject: notify.subject,
      html: notify.html,
      text: notify.text,
    });
  } catch (error) {
    console.error("[contact] bildirim gönderilemedi:", error);
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }

  // 2) Otomatik yanıt — başarısız olsa da forma "başarılı" dönülür,
  //    çünkü mesaj bize zaten ulaştı.
  let autoReplied = false;
  try {
    const reply = autoReplyEmail(data);
    await send(apiKey, {
      from,
      to: [data.email],
      reply_to: to,
      subject: reply.subject,
      html: reply.html,
      text: reply.text,
    });
    autoReplied = true;
  } catch (error) {
    console.error(
      "[contact] otomatik yanıt gönderilemedi (alan adı Resend'de doğrulanmamış olabilir):",
      error,
    );
  }

  return NextResponse.json({ ok: true, delivered: true, autoReplied });
}
