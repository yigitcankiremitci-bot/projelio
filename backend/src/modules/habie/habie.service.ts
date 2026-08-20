import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { SupabaseService } from "../../database/supabase.service";

/**
 * Habie köprüsü.
 *
 * Habie, Projelio'ya gömülen mesajlaşma modülü. Kendi kimlik sistemi var ve
 * Projelio'nun kullanıcılarını "iddia" (assertion) yoluyla tanıyor.
 *
 * Bu servis tek bir oturum açılışında iki ayrı jeton üretir:
 *
 *  1) assertion  — HABIE_APP_SECRET ile imzalı. Habie gateway'i bunu doğrulayıp
 *                  Projelio kullanıcısını kendi kimliğiyle eşler. Kısa ömürlü,
 *                  çünkü tek işi oturum açmak.
 *
 *  2) agent.token — Projelio'nun KENDİ JWT'si, kısa ömürlü. Habie arayüzü
 *                  Lio ile konuşurken /ai/chat'e bunu taşır. Böylece tarayıcıda
 *                  7 günlük ana oturum jetonu dolaşmak zorunda kalmaz.
 *
 * Habie'nin ajan sohbeti bilerek Habie gateway'inden GEÇMEZ; tarayıcı doğrudan
 * bu API'ye konuşur. Sohbet geçmişi de burada, ai_conversations tablosunda kalır.
 */

/** Habie tarafındaki uygulama kimliği. Habie'nin APP_SECRETS anahtarıyla aynı olmalı. */
const HABIE_APP_ID = "projelio";

/** İddia yalnızca oturum açmaya yarar; uzun ömürlü olmasının anlamı yok. */
const ASSERTION_TTL = "5m";

/** Ajan jetonu tarayıcıda durur. Kısa tut, Habie süresi dolunca yeniler. */
const AGENT_TOKEN_TTL_SECONDS = 30 * 60;

export interface HabieSession {
  assertion: string;
  agent: {
    id: string;
    name: string;
    chatPath: string;
    confirmPath: string;
    token: string;
    expiresInSeconds: number;
  };
  user: { id: string; name: string; email: string; role: string };
}

@Injectable()
export class HabieService {
  private readonly logger = new Logger(HabieService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly supabase: SupabaseService
  ) {}

  private appSecret(): string {
    const secret = process.env.HABIE_APP_SECRET?.trim();
    if (!secret) {
      this.logger.error("HABIE_APP_SECRET tanımlı değil — Habie oturumu açılamaz.");
      throw new ServiceUnavailableException(
        "Habie yapılandırılmamış. Sunucuda HABIE_APP_SECRET tanımlanmalı."
      );
    }
    return secret;
  }

  async createSession(userId: string, email: string, role: string): Promise<HabieSession> {
    let displayName = email;
    try {
      const { data } = await this.supabase.client
        .from("users")
        .select("full_name")
        .eq("id", userId)
        .single();
      if (data?.full_name) displayName = data.full_name;
    } catch (err: any) {
      // İsim kozmetik — alınamazsa e-posta ile devam et, oturumu düşürme.
      this.logger.warn(`Kullanıcı adı okunamadı (${userId}): ${err?.message ?? err}`);
    }

    const assertion = await this.jwt.signAsync(
      { iss: HABIE_APP_ID, sub: userId, name: displayName, role },
      { secret: this.appSecret(), expiresIn: ASSERTION_TTL }
    );

    // Modülün varsayılan secret'ı = Projelio JWT secret'ı. Burada yalnızca
    // ömrü kısaltıyoruz; yükü jwt.strategy.ts'in beklediğiyle birebir aynı.
    const agentToken = await this.jwt.signAsync(
      { sub: userId, email, role },
      { expiresIn: AGENT_TOKEN_TTL_SECONDS }
    );

    return {
      assertion,
      agent: {
        id: HABIE_APP_ID,
        name: "Lio",
        chatPath: "/ai/chat",
        confirmPath: "/ai/confirm",
        token: agentToken,
        expiresInSeconds: AGENT_TOKEN_TTL_SECONDS,
      },
      user: { id: userId, name: displayName, email, role },
    };
  }
}
