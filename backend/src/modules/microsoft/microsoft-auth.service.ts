import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { OAuthHandoffStore } from "../../common/auth/oauth-handoff";
import { nowInSeconds } from "../auth/session-payload";
import { UsersService } from "../users/users.service";
import { MicrosoftAccountsService } from "./microsoft-accounts.service";
import { MicrosoftIdentity } from "./microsoft-oauth.service";

/**
 * "Microsoft ile giriş" — google-auth.service.ts'in birebir karşılığı.
 *
 * Google'dan tek anlamlı fark e-posta güveni: Google `email_verified` diye
 * güvenilir bir claim veriyor, Microsoft vermiyor. Hangi adresin doğrulanmış
 * sayıldığının gerekçesi microsoft-oauth.service.ts'teki decodeIdentity'de.
 */
@Injectable()
export class MicrosoftAuthService {
  private readonly handoffs = new OAuthHandoffStore();

  constructor(
    private usersService: UsersService,
    private accounts: MicrosoftAccountsService,
    private jwtService: JwtService
  ) {}

  /**
   * Microsoft kimliğinden Projelio oturumu üretir.
   *
   * Üç durum var (loginWithGoogle ile aynı):
   *   1. Bu ms_sub daha önce bağlanmış      -> o kullanıcıyla giriş yap
   *   2. Aynı e-postalı bir Projelio hesabı var -> Microsoft'u o hesaba bağla
   *   3. Hiçbiri yok                        -> yeni kullanıcı oluştur
   *
   * (2) ancak adres doğrulanmışsa yapılır; aksi halde kendi Azure kiracısını
   * açan biri, `mail` özniteliğine kurbanın adresini yazarak onun hesabına
   * girebilirdi.
   */
  async loginWithMicrosoft(identity: MicrosoftIdentity): Promise<{ token: string; isNewUser: boolean }> {
    const existingAccount = await this.accounts.findByMsSub(identity.sub);

    let userId: string;
    let isNewUser = false;

    if (existingAccount) {
      userId = existingAccount.userId;
    } else {
      const byEmail = await this.usersService.findByEmail(identity.verifiedEmail ?? identity.email);

      if (byEmail) {
        if (!identity.verifiedEmail) {
          throw new UnauthorizedException(
            "Microsoft hesabınızın e-posta adresi doğrulanmış olarak gelmiyor; bu adresle var olan " +
              "Projelio hesabına bağlanamaz. Şifrenizle giriş yapıp Ayarlar'dan Microsoft hesabınızı bağlayabilirsiniz."
          );
        }
        userId = byEmail.id;
      } else {
        const email = identity.verifiedEmail ?? identity.email;
        const created = await this.usersService.createFromSocialLogin({
          fullName: identity.name || email.split("@")[0],
          email,
          usernameSeed: email.split("@")[0],
          // Doğrulanmamış adresle hesap açılabilir (kimseninkini devralmıyor)
          // ama doğrulanmış sayılmaz: e-posta doğrulaması bekler.
          emailVerified: Boolean(identity.verifiedEmail),
        });
        userId = created.id;
        isNewUser = true;
      }
    }

    // Bir Projelio kullanıcısına yalnızca tek Microsoft hesabı bağlanabilir:
    // microsoft_accounts'ta kullanıcı başına tek satır varsayılıyor
    // (findByUserId .maybeSingle() ile okuyor) ve ikinci bir hesap gelirse
    // OneDrive/posta hangisinden gideceği belirsizleşir.
    const currentForUser = await this.accounts.findByUserId(userId);
    if (currentForUser && currentForUser.msSub !== identity.sub) {
      throw new ConflictException(
        `Bu Projelio hesabına zaten ${currentForUser.email} Microsoft hesabı bağlı. Önce mevcut bağlantıyı kaldırın.`
      );
    }

    // Giriş akışında refresh token İSTEMİYORUZ (bkz. SIGN_IN_SCOPES), bu yüzden
    // satır yalnızca "bu Microsoft hesabı bu kullanıcıya ait" eşleşmesini tutar;
    // var olan bir OneDrive/posta jetonuna dokunmaz (upsert refreshToken
    // verilmediğinde jetonu ve izinleri korur).
    await this.accounts.upsert({
      userId,
      msSub: identity.sub,
      email: identity.email,
      scopes: [],
    });

    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException("Kullanıcı bulunamadı.");

    // loginAt: Microsoft ile giriş de yeni bir oturumdur, mutlak ömür saati
    // burada başlar (bkz. modules/auth/session-payload.ts).
    const token = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      loginAt: nowInSeconds(),
    });
    return { token, isNewUser };
  }

  // ------------------------------------------------------------- devir kodları
  // Mantığın tamamı common/auth/oauth-handoff.ts'te; Google akışı da aynısını
  // kullanıyor.

  createHandoff(token: string): string {
    return this.handoffs.create(token);
  }

  consumeHandoff(code: string): string {
    return this.handoffs.consume(code);
  }
}
