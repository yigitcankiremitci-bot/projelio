import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { UsersService } from "../users/users.service";
import { EmailVerificationService } from "./email-verification.service";

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private emailVerificationService: EmailVerificationService
  ) {}

  /**
   * Kayıt artık DOĞRUDAN GİRİŞ YAPTIRMAZ: token yerine "e-postana baktık" durumu
   * döner. Kullanıcı e-postasındaki bağlantıya tıklayana kadar giriş yapamaz
   * (bkz. login içindeki emailVerifiedAt kontrolü).
   */
  async register(fullName: string, email: string, password: string, username: string) {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.usersService.create({ fullName, email, passwordHash, username });

    // Doğrulama e-postası gönderilemese bile kayıt başarılı sayılır — kullanıcı
    // giriş ekranından "tekrar gönder" diyebilir. Aksi halde geçici bir e-posta
    // sağlayıcı arızası, oluşmuş bir hesabı yarım bırakıp 500 döndürürdü.
    try {
      await this.emailVerificationService.sendVerification(user.id, user.email);
    } catch {
      // sendVerification kendi hatasını zaten logluyor
    }

    return {
      requiresEmailVerification: true,
      email: user.email,
      message: "Hesabın oluşturuldu. Girişten önce e-postana gönderdiğimiz bağlantıyla adresini doğrula.",
    };
  }

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);

    // Google ile kayıt olan kullanıcının şifresi yoktur. Bunu "geçersiz şifre"
    // diye geçiştirmek kullanıcıyı tekrar tekrar denemeye iter; doğru yolu söyle.
    if (user && !user.passwordHash) {
      throw new UnauthorizedException(
        "Bu hesap Google ile oluşturulmuş. Lütfen \"Google ile devam et\" ile giriş yapın."
      );
    }

    if (!user || !(await bcrypt.compare(password, user.passwordHash!))) {
      throw new UnauthorizedException("Geçersiz e-posta veya şifre");
    }

    // Şifre kontrolünden SONRA bakılır: aksi halde rastgele bir e-posta deneyen
    // biri, aldığı hataya bakarak o adresin kayıtlı olup olmadığını anlayabilirdi.
    // 403 (401 değil) dönülüyor ki ön yüz bunu "şifre yanlış"tan ayırıp
    // "doğrulama e-postasını tekrar gönder" seçeneğini gösterebilsin.
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException(
        "E-posta adresin henüz doğrulanmadı. Kayıt olurken gönderdiğimiz bağlantıya tıkla ya da yeni bir bağlantı iste."
      );
    }

    return this.signToken(user.id, user.email, user.role);
  }

  signToken(sub: string, email: string, role: string) {
    return { token: this.jwtService.sign({ sub, email, role }) };
  }

  async me(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) return null;
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      username: user.username,
      role: user.role,
      accountType: user.accountType,
      activeTaskId: user.activeTaskId,
      onboardingCompletedAt: user.onboardingCompletedAt,
      emailVerifiedAt: user.emailVerifiedAt,
      avatarUrl: user.avatarUrl,
      title: user.title,
      bio: user.bio,
      // Ayarlar > Hesap, şifre kartında "mevcut şifreni gir" alanını yalnızca
      // şifresi olan hesaplara gösterir (Google ile açılanlarda null olabiliyor).
      // Hash'in kendisi DEĞİL, yalnızca varlığı dışarı çıkar.
      hasPassword: Boolean(user.passwordHash),
    };
  }
}
