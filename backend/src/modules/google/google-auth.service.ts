import { ConflictException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UsersService } from "../users/users.service";
import { GoogleAccountsService } from "./google-accounts.service";
import { GoogleIdentity } from "./google-oauth.service";
import { nowInSeconds } from "../auth/session-payload";
import { OAuthHandoffStore } from "../../common/auth/oauth-handoff";

@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private readonly handoffs = new OAuthHandoffStore();

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
        const created = await this.usersService.createFromSocialLogin({
          fullName: identity.name || identity.email.split("@")[0],
          email: identity.email,
          usernameSeed: identity.email.split("@")[0],
          avatarUrl: identity.picture,
          // Google'da adres her zaman Google tarafından doğrulanmış kabul edilir
          // (bu akış bugüne kadar da hesabı doğrulanmış açıyordu).
          emailVerified: true,
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

    // loginAt: Google ile giriş de yeni bir oturumdur, mutlak ömür saati burada başlar
    // (bkz. modules/auth/session-payload.ts).
    const token = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      loginAt: nowInSeconds(),
    });
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
  // Mantığın tamamı common/auth/oauth-handoff.ts'te; Microsoft akışı da aynısını
  // kullanıyor.

  createHandoff(token: string): string {
    return this.handoffs.create(token);
  }

  consumeHandoff(code: string): string {
    return this.handoffs.consume(code);
  }
}
