import { Injectable } from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";

export interface UserRecord {
  id: string;
  fullName: string;
  email: string;
  passwordHash: string;
  role: "admin" | "freelancer";
}

function mapUser(row: any): UserRecord {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
  };
}

@Injectable()
export class UsersService {
  constructor(private supabase: SupabaseService) {}

  async create(data: { fullName: string; email: string; passwordHash: string }): Promise<UserRecord> {
    const { data: row, error } = await this.supabase.client
      .from("users")
      .insert({
        full_name: data.fullName,
        email: data.email,
        password_hash: data.passwordHash,
      })
      .select()
      .single();
    if (error) throw error;
    return mapUser(row);
  }

  async findByEmail(email: string): Promise<UserRecord | undefined> {
    const { data: row, error } = await this.supabase.client
      .from("users")
      .select()
      .eq("email", email)
      .maybeSingle();
    if (error) throw error;
    return row ? mapUser(row) : undefined;
  }

  async findById(id: string): Promise<UserRecord | undefined> {
    const { data: row, error } = await this.supabase.client
      .from("users")
      .select()
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return row ? mapUser(row) : undefined;
  }

  async findAll(): Promise<UserRecord[]> {
    const { data, error } = await this.supabase.client.from("users").select();
    if (error) throw error;
    return (data ?? []).map(mapUser);
  }
}
