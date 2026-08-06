import { randomUUID } from "crypto";
import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";

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
  role: "admin" | "freelancer";
  accountType: AccountType;
  activeTaskId?: string;
  onboardingCompletedAt?: string;
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
    role: row.role,
    accountType: row.account_type,
    activeTaskId: row.active_task_id ?? undefined,
    onboardingCompletedAt: row.onboarding_completed_at ?? undefined,
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

  async create(data: { fullName: string; email: string; passwordHash: string; username: string }): Promise<UserRecord> {
    const username = normalizeUsername(data.username);
    assertValidUsername(username);

    const { data: row, error } = await this.supabase.client
      .from("users")
      .insert({
        full_name: data.fullName,
        email: data.email,
        password_hash: data.passwordHash,
        username,
      })
      .select()
      .single();
    if (error) {
      if ((error as any).code === "23505") throw new ConflictException("Bu kullanıcı adı veya e-posta zaten kullanılıyor.");
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

    const { data: row, error } = await this.supabase.client
      .from("users")
      .insert({
        full_name: data.fullName,
        email: data.email,
        password_hash: null,
        username,
        avatar_url: data.avatarUrl ?? null,
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
      .eq("email", email)
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

  async findAll(): Promise<PublicUser[]> {
    const { data, error } = await this.supabase.client.from("users").select();
    if (error) throw error;
    return (data ?? []).map((row: any) => toPublicUser(mapUser(row)));
  }

  async findByIdPublic(id: string): Promise<PublicUser | undefined> {
    const user = await this.findById(id);
    return user ? toPublicUser(user) : undefined;
  }

  // Ekip üyesi ekleme modalindeki arama kutusu için: kullanıcı adı (@handle'sız da
  // yazılabilir), e-posta veya ad soyada göre kısıtlı sayıda sonuç döner.
  async search(query: string, limit = 8): Promise<PublicUser[]> {
    const term = normalizeUsername(query || "");
    if (!term) return [];
    const escaped = term.replace(/[%_]/g, (m) => `\\${m}`);

    const { data, error } = await this.supabase.client
      .from("users")
      .select()
      .or(`username.ilike.%${escaped}%,email.ilike.%${escaped}%,full_name.ilike.%${escaped}%`)
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((row: any) => toPublicUser(mapUser(row)));
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

  async uploadAvatar(userId: string, file: Express.Multer.File): Promise<PublicUser> {
    const ext = (file.originalname.split(".").pop() || "jpg").toLowerCase();
    const path = `${userId}/${randomUUID()}.${ext}`;

    const { error: uploadError } = await this.supabase.client.storage
      .from(AVATAR_BUCKET)
      .upload(path, file.buffer, { contentType: file.mimetype, upsert: true });
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
    return toPublicUser(mapUser(row));
  }
}
