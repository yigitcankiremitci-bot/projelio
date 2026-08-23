import { randomUUID } from "crypto";
import { hashPassword, verifyPassword } from "../../common/password.util";
import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";
import { removeStaleUploadsInFolder } from "../../common/storage/public-upload.util";
import { detectImageUpload } from "../../common/upload-image.util";

const AVATAR_BUCKET = "avatars";

export type AccountType = "freelancer" | "organization_owner" | "group_owner" | "employee" | "subcontractor";

// Kimlik doğrulama akışında (login/register) kullanılan, hash'i de içeren dahili tip.
// Bu tip HİÇBİR ZAMAN doğrudan bir controller yanıtı olarak dönmemeli.
export interface UserRecord {
  id: string;
  fullName: string;
  email: string;
  username: string;
  // Google ile kayıt olan kullanıcılarda şifre yoktur.
  passwordHash?: string;
  /** Dolu ise hesap silinmiş: giriş kapalı, kimlik alanları anonimleştirilmiş. */
  deletedAt?: string;
  role: "admin" | "freelancer";
  accountType: AccountType;
  activeTaskId?: string;
  onboardingCompletedAt?: string;
  // Boşsa kullanıcı e-postasını henüz doğrulamamıştır ve giriş yapamaz
  // (bkz. 044_email_verification.sql, AuthService.login).
  emailVerifiedAt?: string;
  avatarUrl?: string;
  title?: string;
  bio?: string;
}

// Dışarıya (frontend'e) dönülen güvenli kullanıcı görünümü - şifre hash'i içermez.
export interface PublicUser {
  id: string;
  fullName: string;
  email: string;
  username: string;
  role: "admin" | "freelancer";
  accountType: AccountType;
  activeTaskId?: string;
  onboardingCompletedAt?: string;
  emailVerifiedAt?: string;
  avatarUrl?: string;
  title?: string;
  bio?: string;
}

const USERNAME_PATTERN = /^[a-z0-9_.]{3,30}$/;
const ACCOUNT_TYPES: AccountType[] = ["freelancer", "organization_owner", "group_owner", "employee", "subcontractor"];

function mapUser(row: any): UserRecord {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    username: row.username,
    passwordHash: row.password_hash ?? undefined,
    deletedAt: row.deleted_at ?? undefined,
    role: row.role,
    accountType: row.account_type,
    activeTaskId: row.active_task_id ?? undefined,
    onboardingCompletedAt: row.onboarding_completed_at ?? undefined,
    emailVerifiedAt: row.email_verified_at ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    title: row.title ?? undefined,
    bio: row.bio ?? undefined,
  };
}

function toPublicUser(user: UserRecord): PublicUser {
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}

export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@/, "").toLowerCase();
}

// E-posta karşılaştırmaları büyük/küçük harfe duyarsız olmalı: "Ali@Gmail.com" ile
// kaydolan biri "ali@gmail.com" ile giriş yapabilmeli, ve ikisi ayrı hesap
// sayılmamalı. `email` sütunu DB'de case-sensitive UNIQUE olduğu için bu
// normalizasyonun HER YAZMA/OKUMA noktasında (create, createFromGoogle,
// findByEmail) tutarlı şekilde uygulanması şart — aksi halde aynı adresin farklı
// yazımlarıyla iki ayrı satır oluşabilir.
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function assertValidUsername(username: string): void {
  if (!USERNAME_PATTERN.test(username)) {
    throw new ConflictException(
      "Kullanıcı adı 3-30 karakter olmalı; sadece küçük harf, rakam, nokta ve alt çizgi içerebilir."
    );
  }
}

@Injectable()
export class UsersService {
  constructor(private supabase: SupabaseService) {}

  /**
   * Kullanıcı adı alınmış mı?
   *
   * Kayıtta e-posta ve kullanıcı adı çakışması AYRI ele alınmak zorunda: kullanıcı
   * adı uygulamada zaten herkese görünen bir tanımlayıcı, "alınmış" demek bir şey
   * sızdırmaz. E-posta ise sızdırır (bkz. AuthService.register). Tek bir 23505
   * hatasından hangisinin çakıştığı anlaşılmadığı için kullanıcı adı burada
   * önceden kontrol ediliyor.
   */
  async isUsernameTaken(rawUsername: string): Promise<boolean> {
    const username = normalizeUsername(rawUsername);
    const { data, error } = await this.supabase.client
      .from("users")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }

  async create(data: { fullName: string; email: string; passwordHash: string; username: string }): Promise<UserRecord> {
    const username = normalizeUsername(data.username);
    assertValidUsername(username);
    const email = normalizeEmail(data.email);

    const { data: row, error } = await this.supabase.client
      .from("users")
      .insert({
        full_name: data.fullName,
        email,
        password_hash: data.passwordHash,
        username,
      })
      .select()
      .single();
    if (error) {
      // Buraya normalde düşülmez: AuthService.register hem kullanıcı adını hem
      // e-postayı önceden kontrol ediyor. Kalan tek durum yarış (aynı anda iki
      // kayıt) — mesaj bilerek hangi alanın çakıştığını söylemiyor.
      if ((error as any).code === "23505") throw new ConflictException("Bu bilgilerle kayıt oluşturulamadı, tekrar deneyin.");
      throw error;
    }
    return mapUser(row);
  }

  /**
   * Google ile ilk kez giriş yapan kullanıcıyı oluşturur.
   *
   * Şifre yoktur (password_hash null). Kullanıcı adı e-postanın yerel kısmından
   * türetilir; çakışırsa sonuna sayı eklenerek boş bir ad bulunur — kullanıcıyı
   * girişin ortasında "kullanıcı adı seçin" ekranına düşürmemek için.
   */
  async createFromGoogle(data: {
    fullName: string;
    email: string;
    usernameSeed: string;
    avatarUrl?: string;
  }): Promise<UserRecord> {
    const username = await this.findAvailableUsername(data.usernameSeed);
    const email = normalizeEmail(data.email);

    const { data: row, error } = await this.supabase.client
      .from("users")
      .insert({
        full_name: data.fullName,
        email,
        password_hash: null,
        username,
        avatar_url: data.avatarUrl ?? null,
        // Google ile açılan hesaplarda e-posta doğrulaması istemiyoruz: adresin
        // sahibi olduğu zaten Google tarafından doğrulanmış oluyor (bkz.
        // google-auth.service.ts'teki identity.emailVerified kontrolü).
        email_verified_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) {
      if ((error as any).code === "23505") throw new ConflictException("Bu e-posta zaten kullanılıyor.");
      throw error;
    }
    return mapUser(row);
  }

  private async findAvailableUsername(seed: string): Promise<string> {
    // Geçersiz karakterleri at, kısa kalırsa doldur: "a.b@x.com" -> "a.b"
    let base = normalizeUsername(seed).replace(/[^a-z0-9_.]/g, "");
    if (base.length < 3) base = `kullanici${base}`;
    base = base.slice(0, 26);

    for (let attempt = 0; attempt < 25; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}${attempt}`;
      const { data, error } = await this.supabase.client
        .from("users")
        .select("id")
        .eq("username", candidate)
        .maybeSingle();
      if (error) throw error;
      if (!data) return candidate;
    }
    // 25 denemede boş ad bulunamadıysa rastgeleye düş - çarpışma olasılığı yok denecek kadar az.
    return `${base}${randomUUID().slice(0, 6)}`;
  }

  /** Google ile gelen kullanıcının profil fotoğrafı yoksa Google'ınkini kullan. */
  async setAvatarIfEmpty(userId: string, avatarUrl: string): Promise<void> {
    const { error } = await this.supabase.client
      .from("users")
      .update({ avatar_url: avatarUrl })
      .eq("id", userId)
      .is("avatar_url", null);
    if (error) throw error;
  }

  // Sadece dahili kullanım (auth.service login/register) için - şifre hash'ini içerir.
  async findByEmail(email: string): Promise<UserRecord | undefined> {
    const { data: row, error } = await this.supabase.client
      .from("users")
      .select()
      .eq("email", normalizeEmail(email))
      .maybeSingle();
    if (error) throw error;
    return row ? mapUser(row) : undefined;
  }

  // Sadece dahili kullanım için - şifre hash'ini içerir.
  async findById(id: string): Promise<UserRecord | undefined> {
    const { data: row, error } = await this.supabase.client
      .from("users")
      .select()
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return row ? mapUser(row) : undefined;
  }

  // Sınırsız kullanıcı listesi hem gereksiz bir veri ifşasıydı (herkesin e-postası/
  // kullanıcı adı tüm giriş yapmış kullanıcılara açıktı) hem de kullanıcı sayısı
  // arttıkça büyüyen bir performans riskiydi. Zaten hedefe yönelik arama için
  // `search()` var; bu uç nokta artık makul bir üst sınırla dönüyor.
  async findAll(limit = 100): Promise<PublicUser[]> {
    const safeLimit = Math.min(Math.max(1, limit), 1000);
    const { data, error } = await this.supabase.client.from("users").select().limit(safeLimit);
    if (error) throw error;
    return (data ?? []).map((row: any) => toPublicUser(mapUser(row)));
  }

  async findByIdPublic(id: string): Promise<PublicUser | undefined> {
    const user = await this.findById(id);
    return user ? toPublicUser(user) : undefined;
  }

  /**
   * Ekip üyesi ekleme modalindeki arama kutusu için: kullanıcı adı (@handle'sız da
   * yazılabilir), e-posta veya ad soyada göre kısıtlı sayıda sonuç döner.
   *
   * ÜÇ AYRI SORGU, TEK BİR `.or(...)` YERİNE — güvenlik gerekçesiyle.
   *
   * Eskiden şöyleydi:
   *   .or(`username.ilike.%${term}%,email.ilike.%${term}%,full_name.ilike.%${term}%`)
   *
   * `.or()` argümanı PostgREST'e METİN olarak gidiyor ve orada ayrıştırılıyor;
   * yani arama terimi filtrenin SÖZDİZİMİNİN içine giriyordu. Terimdeki bir virgül
   * yeni bir koşul açıyordu. Eski kod yalnızca `%` ve `_` kaçırıyordu (LIKE joker
   * karakterleri), virgülü değil — ve PostgREST'te joker olarak `*` de kullanılabildiği
   * için o kaçış bir engel oluşturmuyordu.
   *
   * Sonuç: giriş yapmış herhangi biri `q` alanına virgülle yeni bir koşul ekleyip
   * İSTEDİĞİ SÜTUNA göre sorgu yapabiliyordu — `password_hash.like.$2b$12$a*` gibi
   * bir koşulla, sonucun boş dönüp dönmediğine bakarak başka kullanıcıların şifre
   * hash'ini karakter karakter çıkarmak mümkündü. (SQL injection değil, PostgREST
   * filtre injection'ı; etkisi kör SQL injection'la aynı kapıya çıkıyor.)
   *
   * `.ilike(sütun, desen)` ise deseni PARAMETRE olarak geçiriyor: metin filtre
   * sözdizimi olarak ayrıştırılmıyor, dolayısıyla enjeksiyon yapısal olarak
   * imkânsız. Aynı yaklaşım planning.service.ts'te de tercih edilmişti.
   */
  async search(query: string, limit = 8): Promise<PublicUser[]> {
    const term = normalizeUsername(query || "");
    if (!term) return [];

    // LIKE joker karakterleri hâlâ kaçırılıyor: "%" yazan biri tüm kullanıcıları
    // listelememeli. Ters bölü de kaçırılmalı, yoksa kaçış karakterinin kendisi
    // desene sızar.
    const pattern = `%${term.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    const columns = ["username", "email", "full_name"] as const;

    const results = await Promise.all(
      columns.map(async (column) => {
        const { data, error } = await this.supabase.client
          .from("users")
          .select()
          .ilike(column, pattern)
          .limit(limit);
        if (error) throw error;
        return data ?? [];
      })
    );

    // Sütun sırası korunur (önce kullanıcı adı eşleşmeleri), aynı kişi tekrarlanmaz.
    const seen = new Set<string>();
    const merged: PublicUser[] = [];
    for (const rows of results) {
      for (const row of rows) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        merged.push(toPublicUser(mapUser(row)));
        if (merged.length >= limit) return merged;
      }
    }
    return merged;
  }

  // İlk giriş onboarding sihirbazını tamamlar: hesap tipini kaydeder. Organizasyon/Grup
  // oluşturma işi (varsa) çağıran taraf (UsersController) tarafından ayrıca yapılır —
  // bu metod sadece users satırını günceller.
  async completeOnboarding(userId: string, accountType: AccountType): Promise<PublicUser> {
    if (!ACCOUNT_TYPES.includes(accountType)) {
      throw new BadRequestException("Geçersiz hesap tipi");
    }
    const { data: row, error } = await this.supabase.client
      .from("users")
      .update({ account_type: accountType, onboarding_completed_at: new Date().toISOString() })
      .eq("id", userId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new ConflictException("Kullanıcı bulunamadı");
    return toPublicUser(mapUser(row));
  }

  async updateUsername(userId: string, rawUsername: string): Promise<PublicUser> {
    const username = normalizeUsername(rawUsername);
    assertValidUsername(username);

    const { data: row, error } = await this.supabase.client
      .from("users")
      .update({ username })
      .eq("id", userId)
      .select()
      .maybeSingle();
    if (error) {
      if ((error as any).code === "23505") throw new ConflictException("Bu kullanıcı adı zaten alınmış.");
      throw error;
    }
    return toPublicUser(mapUser(row));
  }

  // Anasayfadaki kişi kartı için: ad soyad, görev/unvan ve kısa açıklama düzenleme.
  async updateProfile(
    userId: string,
    data: { fullName?: string; title?: string; bio?: string }
  ): Promise<PublicUser> {
    const patch: Record<string, any> = {};
    if (data.fullName !== undefined) {
      const fullName = data.fullName.trim();
      if (!fullName) throw new BadRequestException("Ad soyad boş olamaz");
      patch.full_name = fullName;
    }
    if (data.title !== undefined) patch.title = data.title.trim() || null;
    if (data.bio !== undefined) patch.bio = data.bio.trim() || null;

    const { data: row, error } = await this.supabase.client
      .from("users")
      .update(patch)
      .eq("id", userId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new ConflictException("Kullanıcı bulunamadı");
    return toPublicUser(mapUser(row));
  }

  /**
   * Ayarlar > Hesap'tan şifre değiştirme.
   *
   * İki durum var ve ikisi de geçerli:
   *  1. Şifresi olan hesap — mevcut şifre doğrulanmadan değişiklik yapılmaz.
   *     (Oturum çalınmışsa saldırgan şifreyi tek başına değiştirip hesabı
   *     ele geçirmesin diye; JWT'ye sahip olmak yetmez.)
   *  2. Google ile açılmış, password_hash'i null hesap — burada "mevcut şifre"
   *     diye bir şey yok, kullanıcı ilk kez şifre belirler ve böylece
   *     e-posta+şifre ile de girebilir hale gelir.
   *
   * Şifre sıfırlama (unutanlar) ayrı bir akış: bkz. password-reset.service.ts.
   */
  async changePassword(
    userId: string,
    currentPassword: string | undefined,
    newPassword: string
  ): Promise<{ ok: true; hasPassword: true }> {
    if (typeof newPassword !== "string" || newPassword.length < 8) {
      throw new BadRequestException("Yeni şifre en az 8 karakter olmalı.");
    }

    const user = await this.findById(userId);
    if (!user) throw new ConflictException("Kullanıcı bulunamadı");

    if (user.passwordHash) {
      if (!currentPassword) throw new BadRequestException("Mevcut şifreni gir.");
      if (!(await verifyPassword(currentPassword, user.passwordHash))) {
        throw new BadRequestException("Mevcut şifre hatalı.");
      }
      if (await verifyPassword(newPassword, user.passwordHash)) {
        throw new BadRequestException("Yeni şifre eskisiyle aynı olamaz.");
      }
    }

    await this.updatePasswordHash(userId, await hashPassword(newPassword));
    return { ok: true, hasPassword: true };
  }

  /**
   * Yalnızca hash sütununu günceller.
   *
   * changePassword ile aynı işi yapan tek satır burada duruyor çünkü giriş akışı
   * da buna ihtiyaç duyuyor: bcrypt maliyeti yükseltildiğinde eski hash'ler
   * başarılı girişte sessizce tazeleniyor (bkz. auth.service.ts login).
   */
  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    const { error } = await this.supabase.client
      .from("users")
      .update({ password_hash: passwordHash })
      .eq("id", userId);
    if (error) throw error;
  }

  async uploadAvatar(userId: string, file: Express.Multer.File): Promise<PublicUser> {
    // Tur ve uzanti istemcinin sozune degil, dosyanin ilk baytlarindaki
    // imzaya gore belirlenir (bkz. common/upload-image.util.ts).
    const { contentType, ext } = detectImageUpload(file);
    const path = `${userId}/${randomUUID()}.${ext}`;

    const { error: uploadError } = await this.supabase.client.storage
      .from(AVATAR_BUCKET)
      .upload(path, file.buffer, { contentType, upsert: true });
    if (uploadError) throw uploadError;

    const { data: publicUrlData } = this.supabase.client.storage.from(AVATAR_BUCKET).getPublicUrl(path);

    const { data: row, error } = await this.supabase.client
      .from("users")
      .update({ avatar_url: publicUrlData.publicUrl })
      .eq("id", userId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new ConflictException("Kullanıcı bulunamadı");

    // Kayıt güncellendikten SONRA temizle: güncelleme başarısız olursa eski görsel
    // yerinde kalsın, kayıt silinmiş bir dosyaya işaret etmesin.
    await removeStaleUploadsInFolder(this.supabase.client, AVATAR_BUCKET, path);

    return toPublicUser(mapUser(row));
  }
}
