import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { randomUUID } from "node:crypto";
import { SupabaseService } from "../../database/supabase.service";

/**
 * Habie köprüsü.
 *
 * Habie, Projelio'ya gömülen mesajlaşma modülü. Kendi kimlik sistemi var ve
 * Projelio kullanıcılarını "iddia" (assertion) yoluyla tanıyor.
 *
 * İki giriş yolu var:
 *
 *  1) createSession() — Habie zaten Projelio'nun içindeyse (asıl senaryo).
 *     Tarayıcıda oturum var, doğrudan çağrılır.
 *
 *  2) handoff → consumeHandoff() — Habie AYRI bir alan adındaysa. Farklı
 *     origin olduğu için Habie, Projelio'nun localStorage'ını okuyamaz.
 *     Projelio'daki /habie sayfası tek kullanımlık bir kod üretip Habie'ye
 *     yönlendirir, Habie o kodu burada takas eder.
 *
 *     Bu yol Google ile kaydolmuş kullanıcılar için de çalışır — parola
 *     bilmelerine gerek yok, Projelio'daki mevcut oturumları yeterli.
 *     (Aynı desen auth/google/exchange'de zaten kullanılıyor.)
 */

/** Habie tarafındaki uygulama kimliği. Habie'nin APP_SECRETS anahtarıyla aynı olmalı. */
const HABIE_APP_ID = "projelio";

/** İddia yalnızca oturum açmaya yarar; uzun ömürlü olmasının anlamı yok. */
const ASSERTION_TTL = "5m";

/** Ajan jetonu tarayıcıda durur. Kısa tut, Habie süresi dolunca yeniler. */
const AGENT_TOKEN_TTL_SECONDS = 30 * 60;

/** Devir kodu ömrü — Google akışıyla aynı. */
const HANDOFF_TTL_MS = 2 * 60 * 1000;

type HandoffEntry = { userId: string; email: string; role: string; expiresAt: number };

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

  /**
   * Devir kodları bellekte. Tek instance olduğu için bugün çalışıyor;
   * yatay ölçeklenirse Redis'e taşınmalı. (google-auth.service.ts'te de böyle.)
   */
  private readonly handoffs = new Map<string, HandoffEntry>();

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

  /** Tek kullanımlık devir kodu üretir. Token URL'e KONMAZ — geçmişte ve Referer'da kalırdı. */
  createHandoff(userId: string, email: string, role: string): string {
    this.sweepHandoffs();
    const code = randomUUID();
    this.handoffs.set(code, { userId, email, role, expiresAt: Date.now() + HANDOFF_TTL_MS });
    return code;
  }

  /** Kodu oturuma çevirir. Tek kullanımlık: bulunsa da bulunmasa da düşer. */
  async consumeHandoff(code: string): Promise<HabieSession> {
    const entry = this.handoffs.get(code);
    this.handoffs.delete(code);

    if (!entry || entry.expiresAt < Date.now()) {
      throw new UnauthorizedException("Bağlantı kodu geçersiz veya süresi dolmuş. Tekrar dene.");
    }
    return this.createSession(entry.userId, entry.email, entry.role);
  }

  private sweepHandoffs() {
    const now = Date.now();
    for (const [code, entry] of this.handoffs) {
      if (entry.expiresAt < now) this.handoffs.delete(code);
    }
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
