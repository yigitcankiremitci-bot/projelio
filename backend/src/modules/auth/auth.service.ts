import { ConflictException, ForbiddenException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { hashPassword, needsRehash, verifyPassword, wasteVerifyTime } from "../../common/password.util";
import { UsersService } from "../users/users.service";
import { EmailVerificationService } from "./email-verification.service";
import { LoginAttemptService } from "./login-attempt.service";
import { nowInSeconds } from "./session-payload";
import { EmailService } from "./email.service";
import { AccountDeletionService } from "../users/account-deletion.service";
import { getWebAppUrl } from "../../common/config/env";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private emailVerificationService: EmailVerificationService,
    private loginAttemptService: LoginAttemptService,
    private emailService: EmailService,
    private accountDeletionService: AccountDeletionService
  ) {}

  /**
   * Kayıt artık DOĞRUDAN GİRİŞ YAPTIRMAZ: token yerine "e-postana baktık" durumu
   * döner. Kullanıcı e-postasındaki bağlantıya tıklayana kadar giriş yapamaz
   * (bkz. login içindeki emailVerifiedAt kontrolü).
   */
  async register(fullName: string, email: string, password: string, username: string) {
    // Kullanıcı adı çakışması AÇIKÇA söylenir: kullanıcı adı uygulamada zaten
    // herkese görünen bir tanımlayıcı, "alınmış" demek bir bilgi sızdırmaz — üstelik
    // söylemezsek kullanıcı neden kayıt olamadığını anlayamaz.
    if (await this.usersService.isUsernameTaken(username)) {
      throw new ConflictException("Bu kullanıcı adı zaten alınmış, başka bir tane dene.");
    }

    // Şifre HER İKİ dalda da hash'lenir. E-posta kayıtlıyken bu adımı atlamak
    // yanıtı ~300 ms hızlandırır ve "bu adres kayıtlı" bilgisini zamanlamadan
    // sızdırırdı (aynı gerekçe: password.util.ts wasteVerifyTime).
    const passwordHash = await hashPassword(password);

    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      // YANIT YENİ KAYITLA AYNI. Eskiden buradan "Bu kullanıcı adı veya e-posta
      // zaten kullanılıyor." dönüyordu; rastgele bir kullanıcı adıyla deneyen
      // biri, hatanın gelip gelmemesine bakarak bir e-postanın sistemde kayıtlı
      // olduğunu öğrenebiliyordu. Auth akışının geri kalanı (forgot-password,
      // resend-verification, login) bu bilgiyi özellikle saklıyor; kayıt ucu
      // açık kapı bırakıyordu.
      //
      // Gerçek sahibi bilgilendirmenin yolu artık e-posta: hesabı olan kişi
      // "birisi adresinle kayıt olmaya çalıştı, zaten hesabın var" bildirimi alır.
      // Adres kayıtlı DEĞİLSE zaten kimseye bir şey gitmez.
      try {
        await this.emailService.sendExistingAccountNotice(existing.email, `${getWebAppUrl()}/login`);
      } catch {
        // send kendi hatasını logluyor; bildirim gitmedi diye yanıt değişmemeli.
      }
      return this.registrationPendingResponse(existing.email);
    }

    const user = await this.usersService.create({ fullName, email, passwordHash, username });

    // Doğrulama e-postası gönderilemese bile kayıt başarılı sayılır — kullanıcı
    // giriş ekranından "tekrar gönder" diyebilir. Aksi halde geçici bir e-posta
    // sağlayıcı arızası, oluşmuş bir hesabı yarım bırakıp 500 döndürürdü.
    try {
      await this.emailVerificationService.sendVerification(user.id, user.email);
    } catch {
      // sendVerification kendi hatasını zaten logluyor
    }

    return this.registrationPendingResponse(user.email);
  }

  async login(email: string, password: string) {
    // Hesap kilitliyse burada 429 ile durur — bcrypt.compare bile çalışmaz.
    this.loginAttemptService.assertNotLocked(email);

    const user = await this.usersService.findByEmail(email);

    // Google ile kayıt olan kullanıcının şifresi yoktur. Bunu "geçersiz şifre"
    // diye geçiştirmek kullanıcıyı tekrar tekrar denemeye iter; doğru yolu söyle.
    // Başarısız deneme SAYILMAZ: burada şifre denenmiş değil, hesap yanlış yöntemle
    // giriş yapmaya çalışıyor. Saymak, Google ile kayıtlı kullanıcıyı kendi
    // alışkanlığı yüzünden kilitlerdi.
    if (user && !user.passwordHash) {
      throw new UnauthorizedException(
        "Bu hesap Google ile oluşturulmuş. Lütfen \"Google ile devam et\" ile giriş yapın."
      );
    }

    // Hesap yoksa da bcrypt kadar zaman harcanır: aksi halde yanıt süresi
    // "bu e-posta kayıtlı değil" bilgisini ele verirdi (bkz. wasteVerifyTime).
    const passwordOk = user
      ? await verifyPassword(password, user.passwordHash!)
      : await wasteVerifyTime(password);

    if (!user || !passwordOk) {
      // Kullanıcı bulunamadığında da sayılır — yalnızca kayıtlı adresleri saymak,
      // kilit yanıtı üzerinden adresin sistemde olduğunu ele verirdi.
      this.loginAttemptService.recordFailure(email);
      throw new UnauthorizedException("Geçersiz e-posta veya şifre");
    }

    // Buraya gelindiyse şifre DOĞRU: sayacı burada sıfırlıyoruz, aşağıdaki
    // e-posta doğrulama kontrolünden önce. Doğru şifreyle gelen ama adresini
    // henüz doğrulamamış kullanıcı, tekrar denedikçe kendini kilitlemesin.
    this.loginAttemptService.reset(email);

    // SİLME TALEBİ VARSA GİRİŞ ONU İPTAL EDER.
    //
    // Hesap silme iki aşamalı: talep alınınca 30 gün bekleniyor ve veri olduğu
    // gibi duruyor (bkz. AccountDeletionService). Doğru şifreyle giren kişi
    // kimliğini zaten kanıtlamış oluyor; ayrıca bir onay ekranı istemek "geri
    // gelmek zor olsun" demek olurdu. Kullanıcıya durumu döndürdüğümüz için ön
    // yüz "hesabın geri açıldı" diyebiliyor.
    let restored = false;
    if (user.deletedAt) {
      await this.accountDeletionService.restoreAccount(user.id);
      restored = true;
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

    // Maliyet katsayısı yükseltildiyse hash'i sessizce tazele. Kullanıcı bunu
    // fark etmez ve şifresini değiştirmesi gerekmez; eski hesaplar zamanla
    // güncel maliyete taşınmış olur. Başarısız olursa giriş yine de tamamlanır —
    // bakım işi yüzünden çalışan bir girişi bozmayalım.
    if (needsRehash(user.passwordHash!)) {
      try {
        await this.usersService.updatePasswordHash(user.id, await hashPassword(password));
      } catch (error) {
        this.logger.warn(`Şifre hash'i tazelenemedi (${user.id}): ${(error as Error).message}`);
      }
    }

    return { ...this.signToken(user.id, user.email, user.role), accountRestored: restored };
  }

  /**
   * @param loginAt Yalnızca YENİLEMEDE verilir: ilk girişin zamanı taşınsın diye.
   *                Verilmezse yeni bir oturum başlatılıyor demektir ve saat
   *                şimdiden işlemeye başlar (bkz. session-payload.ts, MUTLAK ÖMÜR).
   */
  /**
   * Kayıt yanıtı tek yerden üretilir: yeni kayıt ile "adres zaten kayıtlı" durumu
   * BİREBİR aynı yanıtı döndürmek zorunda, yoksa fark enumeration'a kapı açar.
   */
  private registrationPendingResponse(email: string) {
    return {
      requiresEmailVerification: true,
      email,
      message: "Hesabın oluşturuldu. Girişten önce e-postana gönderdiğimiz bağlantıyla adresini doğrula.",
    };
  }

  signToken(sub: string, email: string, role: string, loginAt?: number) {
    return {
      token: this.jwtService.sign({ sub, email, role, loginAt: loginAt ?? nowInSeconds() }),
    };
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
