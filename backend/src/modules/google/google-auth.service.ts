import { ConflictException, ForbiddenException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { OTURUM_KARARI_MESAJI } from "../../common/hesap-durumu/oturum-engeli";
import { AccountDeletionService } from "../users/account-deletion.service";
import { JwtService } from "@nestjs/jwt";
import { UsersService } from "../users/users.service";
import { GoogleAccount, GoogleAccountsService } from "./google-accounts.service";
import { GoogleIdentity } from "./google-oauth.service";
import { nowInSeconds } from "../auth/session-payload";
import { OAuthHandoffStore } from "../../common/auth/oauth-handoff";

@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private readonly handoffs = new OAuthHandoffStore();

  constructor(
    private usersService: UsersService,
    private accountDeletionService: AccountDeletionService,
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
      // Depo olarak eklenmiş hesapla giriş YAPILAMAZ (bkz. migration 088).
      // Şirketine ikinci bir Drive bağlayan kullanıcı, farkında olmadan
      // hesabına ikinci bir giriş anahtarı takmış olmamalı.
      if (!existingAccount.isLoginIdentity) {
        throw new UnauthorizedException(
          "Bu Google hesabı Projelio'ya yalnızca dosya deposu olarak bağlı; giriş için kullanılamaz."
        );
      }
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

    // Bir Projelio kullanıcısının GİRİŞ kimliği tektir. Depo hesabı çoğul
    // olabilir (bkz. connectToExistingUser) ama giriş yolu değil: aksi hâlde
    // e-postası ele geçen biri kendi Google hesabını ikinci bir anahtar olarak
    // takabilirdi.
    const currentForUser = await this.googleAccounts.findLoginIdentity(userId);
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
      isLoginIdentity: true,
    });

    if (identity.picture) {
      await this.usersService.setAvatarIfEmpty(userId, identity.picture).catch(() => undefined);
    }

    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException("Kullanıcı bulunamadı.");

    // Askıdaki hesap Google ile de giremez. Şifreli girişle aynı sıra: önce askı,
    // sonra silme talebinin geri alınması (bkz. AuthService.login).
    if (user.bannedAt) {
      throw new ForbiddenException(OTURUM_KARARI_MESAJI.askida);
    }

    // Silme talebi olan kişi geri döndüyse talep iptal olur — şifreyle girişte
    // de böyle. Eskiden yalnızca şifreli giriş geri alıyordu; Google ile dönen
    // kullanıcı uygulamayı kullanmaya devam ederken 30 gün sonra hesabı
    // silinirdi.
    if (user.deletedAt) {
      await this.accountDeletionService.restoreAccount(user.id);
    }

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

  /**
   * Zaten giriş yapmış bir kullanıcının Google hesabını bağlar (Drive izni için).
   *
   * Kullanıcı BİRDEN FAZLA hesap bağlayabilir: kişisel Drive'ı ile şirketinin
   * Drive'ını ayrı tutmak isteyen kullanıcı için tek yol bu (bkz. migration 088).
   * Ek hesaplar yalnızca depodur — `upsert` onları giriş kimliği yapmaz.
   */
  async connectToExistingUser(
    userId: string,
    identity: GoogleIdentity,
    tokens: { refreshToken?: string; scopes: string[] },
    options: { label?: string } = {}
  ): Promise<GoogleAccount> {
    const ownedBySomeoneElse = await this.googleAccounts.findByGoogleSub(identity.sub);
    if (ownedBySomeoneElse && ownedBySomeoneElse.userId !== userId) {
      throw new ConflictException(
        "Bu Google hesabı başka bir Projelio kullanıcısına bağlı."
      );
    }

    return this.googleAccounts.upsert({
      userId,
      googleSub: identity.sub,
      email: identity.email,
      pictureUrl: identity.picture,
      refreshToken: tokens.refreshToken,
      scopes: tokens.scopes,
      label: options.label,
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
