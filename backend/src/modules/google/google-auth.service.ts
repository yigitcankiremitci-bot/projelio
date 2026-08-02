import { randomUUID } from "node:crypto";
import { ConflictException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UsersService } from "../users/users.service";
import { GoogleAccountsService } from "./google-accounts.service";
import { GoogleIdentity } from "./google-oauth.service";

/**
 * Tek kullanımlık devir kodları.
 *
 * Google geri dönüşünden sonra kullanıcıyı ön yüze yönlendirmemiz gerekiyor ama
 * JWT'yi URL'e koymak istemiyoruz: adres çubuğunda, tarayıcı geçmişinde ve
 * Referer başlığında kalır. Bunun yerine 2 dakika ömürlü, tek kullanımlık bir kod
 * veriyoruz; ön yüz onu POST ile gerçek token'la takas ediyor.
 *
 * Bellekte tutuluyor: kod yalnızca saniyeler yaşıyor ve tek istekte harcanıyor.
 * (Backend birden fazla örnekte çalıştırılırsa buranın Redis'e taşınması gerekir —
 * projede zaten ioredis var.)
 */
interface HandoffEntry {
  token: string;
  expiresAt: number;
}

const HANDOFF_TTL_MS = 2 * 60 * 1000;

@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private readonly handoffs = new Map<string, HandoffEntry>();

  constructor(
    private usersService: UsersService,
    private googleAccounts: GoogleAccountsService,
    private jwtService: JwtService
  ) {}

  /**
   * Google kimliğinden Projelio oturumu üretir.
   *
   * Üç durum var:
   *   1. Bu google_sub daha önce bağlanmış  -> o kullanıcıyla giriş yap
   *   2. Aynı e-postalı bir Projelio hesabı var -> Google'ı o hesaba bağla
   *   3. Hiçbiri yok -> yeni kullanıcı oluştur
   *
   * (2) ancak e-posta Google tarafından doğrulanmışsa yapılır: doğrulanmamış bir
   * e-posta ile hesap devralma saldırısı mümkün olurdu.
   */
  async loginWithGoogle(
    identity: GoogleIdentity,
    tokens: { refreshToken?: string; scopes: string[] }
  ): Promise<{ token: string; isNewUser: boolean }> {
    const existingAccount = await this.googleAccounts.findByGoogleSub(identity.sub);

    let userId: string;
    let isNewUser = false;

    if (existingAccount) {
      userId = existingAccount.userId;
    } else {
      const byEmail = await this.usersService.findByEmail(identity.email);

      if (byEmail) {
        if (!identity.emailVerified) {
          throw new UnauthorizedException(
            "Google hesabınızın e-postası doğrulanmamış; bu e-postayla var olan hesaba bağlanamaz."
          );
        }
        userId = byEmail.id;
      } else {
        const created = await this.usersService.createFromGoogle({
          fullName: identity.name || identity.email.split("@")[0],
          email: identity.email,
          usernameSeed: identity.email.split("@")[0],
          avatarUrl: identity.picture,
        });
        userId = created.id;
        isNewUser = true;
      }
    }

    // Bir Projelio kullanıcısına yalnızca tek Google hesabı bağlanabilir; ikinci
    // bir hesapla gelinirse hangisinin Drive'ı kullanılacağı belirsizleşir.
    const currentForUser = await this.googleAccounts.findByUserId(userId);
    if (currentForUser && currentForUser.googleSub !== identity.sub) {
      throw new ConflictException(
        `Bu Projelio hesabına zaten ${currentForUser.email} Google hesabı bağlı. Önce mevcut bağlantıyı kaldırın.`
      );
    }

    await this.googleAccounts.upsert({
      userId,
      googleSub: identity.sub,
      email: identity.email,
      pictureUrl: identity.picture,
      refreshToken: tokens.refreshToken,
      scopes: tokens.scopes,
    });

    if (identity.picture) {
      await this.usersService.setAvatarIfEmpty(userId, identity.picture).catch(() => undefined);
    }

    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException("Kullanıcı bulunamadı.");

    const token = this.jwtService.sign({ sub: user.id, email: user.email, role: user.role });
    return { token, isNewUser };
  }

  /** Zaten giriş yapmış bir kullanıcının Google hesabını bağlar (Drive izni için). */
  async connectToExistingUser(
    userId: string,
    identity: GoogleIdentity,
    tokens: { refreshToken?: string; scopes: string[] }
  ): Promise<void> {
    const ownedBySomeoneElse = await this.googleAccounts.findByGoogleSub(identity.sub);
    if (ownedBySomeoneElse && ownedBySomeoneElse.userId !== userId) {
      throw new ConflictException(
        "Bu Google hesabı başka bir Projelio kullanıcısına bağlı."
      );
    }

    const current = await this.googleAccounts.findByUserId(userId);
    if (current && current.googleSub !== identity.sub) {
      throw new ConflictException(
        `Hesabınıza zaten ${current.email} bağlı. Önce mevcut bağlantıyı kaldırın.`
      );
    }

    await this.googleAccounts.upsert({
      userId,
      googleSub: identity.sub,
      email: identity.email,
      pictureUrl: identity.picture,
      refreshToken: tokens.refreshToken,
      scopes: tokens.scopes,
    });
  }

  // ------------------------------------------------------------- devir kodları

  createHandoff(token: string): string {
    this.purgeExpiredHandoffs();
    const code = randomUUID();
    this.handoffs.set(code, { token, expiresAt: Date.now() + HANDOFF_TTL_MS });
    return code;
  }

  consumeHandoff(code: string): string {
    const entry = this.handoffs.get(code);
    this.handoffs.delete(code); // tek kullanımlık: bulunsa da bulunmasa da düşer
    if (!entry || entry.expiresAt < Date.now()) {
      throw new UnauthorizedException("Giriş kodu geçersiz veya süresi dolmuş. Tekrar deneyin.");
    }
    return entry.token;
  }

  private purgeExpiredHandoffs(): void {
    const now = Date.now();
    for (const [code, entry] of this.handoffs) {
      if (entry.expiresAt < now) this.handoffs.delete(code);
    }
  }
}
