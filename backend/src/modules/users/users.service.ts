import { ConflictException, Injectable } from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";

// Kimlik doğrulama akışında (login/register) kullanılan, hash'i de içeren dahili tip.
// Bu tip HİÇBİR ZAMAN doğrudan bir controller yanıtı olarak dönmemeli.
export interface UserRecord {
  id: string;
  fullName: string;
  email: string;
  username: string;
  passwordHash: string;
  role: "admin" | "freelancer";
}

// Dışarıya (frontend'e) dönülen güvenli kullanıcı görünümü - şifre hash'i içermez.
export interface PublicUser {
  id: string;
  fullName: string;
  email: string;
  username: string;
  role: "admin" | "freelancer";
}

const USERNAME_PATTERN = /^[a-z0-9_.]{3,30}$/;

function mapUser(row: any): UserRecord {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    username: row.username,
    passwordHash: row.password_hash,
    role: row.role,
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
}
