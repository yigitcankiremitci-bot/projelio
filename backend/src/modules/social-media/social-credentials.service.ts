import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  ModuleAccess,
  SocialCredential,
  SocialCredentialGrant,
  SocialCredentialList,
  SocialCredentialSecret,
  SocialCredentialView,
} from "@projelio/shared";
import { createTokenCrypto } from "../../common/crypto/token-crypto";
import { SupabaseService } from "../../database/supabase.service";
import { ModuleMembersService } from "../module-members/module-members.service";
import { decideCredentialAccess, isGrantActive } from "./social-credential-access";
import { SOCIAL_MODULE_KEY, type SocialScope } from "./social-media.service";

/**
 * Sosyal hesapların giriş bilgileri (kullanıcı adı + şifre).
 *
 * KURAL: `social_account_credentials` tablosunu başka hiçbir servis okumaz.
 * Şifre yalnızca `reveal()` çağrısından çıkar; liste uçları sırrı DÖNMEZ,
 * yalnızca "böyle bir kayıt var" bilgisini döner. Hesabı okuyan diğer kod
 * yolları (panel, takvim, yayın kuyruğu) bu tabloya hiç uğramaz — jetonlarda
 * SocialTokensService ile kurulan aynı sınır.
 *
 * Kimin görebileceği kararı saf fonksiyonda: social-credential-access.ts.
 * Şifreleme common/crypto/token-crypto.ts'te; anahtar SOCIAL_CREDENTIAL_ENC_KEY
 * — jeton anahtarından bilerek ayrı.
 *
 * Bkz. database/migrations/076_sosyal_hesap_kimlik_bilgileri.sql
 */

/** Jeton anahtarından AYRI: biri sızarsa diğeri etkilenmesin, ayrı döndürülebilsin. */
export const socialCredentialCrypto = createTokenCrypto("SOCIAL_CREDENTIAL_ENC_KEY");

export interface SocialCredentialInput {
  label?: string;
  username?: string;
  password?: string;
  note?: string;
}

/** Hesap satırının kimlik bilgisi için gereken alanları. */
interface AccountRow {
  id: string;
  organization_id: string | null;
  job_id: string | null;
  department_id: string | null;
}

interface CredentialRow {
  id: string;
  account_id: string;
  label: string;
  username_enc: string | null;
  password_enc: string;
  note_enc: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
  password_changed_at: string;
  social_accounts: AccountRow;
}

function nullable(value?: string): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

@Injectable()
export class SocialCredentialsService {
  constructor(
    private supabase: SupabaseService,
    private moduleMembers: ModuleMembersService
  ) {}

  // ============================================================ Yardımcılar

  private scopeOf(row: AccountRow): SocialScope {
    return row.job_id
      ? { jobId: row.job_id }
      : { organizationId: row.organization_id as string, departmentId: row.department_id ?? undefined };
  }

  private async access(row: AccountRow, userId: string): Promise<ModuleAccess> {
    const scope = this.scopeOf(row);
    if ("jobId" in scope) return this.moduleMembers.resolveJobAccess(scope.jobId, SOCIAL_MODULE_KEY, userId);
    return this.moduleMembers.resolveOrganizationAccess(
      scope.organizationId,
      SOCIAL_MODULE_KEY,
      userId,
      scope.departmentId
    );
  }

  private async accountRow(accountId: string): Promise<AccountRow> {
    const { data, error } = await this.supabase.client
      .from("social_accounts")
      .select("id, organization_id, job_id, department_id")
      .eq("id", accountId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Hesap bulunamadı");
    return data as AccountRow;
  }

  private async credentialRow(id: string): Promise<CredentialRow> {
    const { data, error } = await this.supabase.client
      .from("social_account_credentials")
      .select("*, social_accounts(id, organization_id, job_id, department_id)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Kayıt bulunamadı");
    return data as unknown as CredentialRow;
  }

  /** Kullanıcının o kayıt için geçerli izni var mı (geri alınmamış, süresi geçmemiş). */
  private async hasActiveGrant(credentialId: string, userId: string): Promise<boolean> {
    const { data, error } = await this.supabase.client
      .from("social_credential_grants")
      .select("revoked_at, expires_at")
      .eq("credential_id", credentialId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return Boolean(data) && isGrantActive(data as any);
  }

  private async userNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
    const unique = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
    if (unique.length === 0) return new Map();
    const { data } = await this.supabase.client.from("users").select("id, full_name").in("id", unique);
    return new Map((data ?? []).map((u: any) => [u.id, u.full_name as string]));
  }

  /**
   * Sırsız görünüm.
   *
   * Şifrenin uzunluğu bile burada dönmüyor: şifreli metnin uzunluğu düz metne
   * dair ipucu verir, "böyle bir kayıt var" bilgisi ise vermez.
   */
  private mapCredential(
    row: CredentialRow,
    decision: { canReveal: boolean; reason?: SocialCredential["revealReason"]; canEdit: boolean },
    createdByName?: string,
    grantCount?: number
  ): SocialCredential {
    return {
      id: row.id,
      accountId: row.account_id,
      label: row.label,
      hasNote: Boolean(row.note_enc),
      createdBy: row.created_by ?? undefined,
      createdByName,
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? undefined,
      passwordChangedAt: row.password_changed_at,
      canReveal: decision.canReveal,
      revealReason: decision.reason,
      canEdit: decision.canEdit,
      grantCount,
    };
  }

  // ============================================================ Okuma

  /** Bir hesabın giriş kayıtları — sırsız. */
  async list(accountId: string, userId: string): Promise<SocialCredentialList> {
    const account = await this.accountRow(accountId);
    const access = await this.access(account, userId);
    if (!access.canRead) throw new ForbiddenException("Bu modülü görme yetkiniz yok");

    const { data, error } = await this.supabase.client
      .from("social_account_credentials")
      .select("*, social_accounts(id, organization_id, job_id, department_id)")
      .eq("account_id", accountId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    const rows = (data ?? []) as unknown as CredentialRow[];

    // Yöneticiye kaç kişinin izinli olduğu gösteriliyor: "şifreyi kim görüyor"
    // sorusunun cevabı izin panelini açmadan da görünsün.
    const grantCounts = new Map<string, number>();
    if (access.canManageTeam && rows.length > 0) {
      const { data: grantRows } = await this.supabase.client
        .from("social_credential_grants")
        .select("credential_id, revoked_at, expires_at")
        .in(
          "credential_id",
          rows.map((r) => r.id)
        );
      for (const g of grantRows ?? []) {
        if (!isGrantActive(g as any)) continue;
        grantCounts.set(g.credential_id, (grantCounts.get(g.credential_id) ?? 0) + 1);
      }
    }

    const names = await this.userNames(rows.map((r) => r.created_by));
    const credentials: SocialCredential[] = [];
    for (const row of rows) {
      const decision = decideCredentialAccess({
        canReadModule: access.canRead,
        isAdmin: access.canManageTeam,
        isCreator: row.created_by === userId,
        // İzin sorgusu yalnızca gerektiğinde: yönetici ve kaydı giren için
        // sonucu değiştirmez, satır başına bir sorgudan kurtuluyoruz.
        hasActiveGrant:
          access.canManageTeam || row.created_by === userId ? false : await this.hasActiveGrant(row.id, userId),
      });
      credentials.push(
        this.mapCredential(
          row,
          decision,
          row.created_by ? names.get(row.created_by) : undefined,
          access.canManageTeam ? (grantCounts.get(row.id) ?? 0) : undefined
        )
      );
    }

    return { accountId, canManage: access.canManageTeam, canCreate: access.canWrite, credentials };
  }

  /**
   * Şifreyi çözüp döner — ve gösterildiğini kaydeder.
   *
   * Denetim kaydı yazılamıyorsa şifre de dönmez: "kimin gördüğü" bilinmeyen
   * bir gösterim, izin sisteminin sağladığı güvenceyi boşa çıkarır.
   */
  async reveal(id: string, userId: string): Promise<SocialCredentialSecret> {
    const row = await this.credentialRow(id);
    const access = await this.access(row.social_accounts, userId);
    const decision = decideCredentialAccess({
      canReadModule: access.canRead,
      isAdmin: access.canManageTeam,
      isCreator: row.created_by === userId,
      hasActiveGrant: await this.hasActiveGrant(row.id, userId),
    });
    if (!decision.canReveal || !decision.reason) {
      throw new ForbiddenException(
        "Bu şifreyi görme izniniz yok. Modül yöneticisinden izin isteyebilirsiniz."
      );
    }

    const { error: logError } = await this.supabase.client.from("social_credential_views").insert({
      credential_id: row.id,
      user_id: userId,
      reason: decision.reason,
    });
    if (logError) throw logError;

    try {
      return {
        id: row.id,
        username: row.username_enc ? socialCredentialCrypto.decrypt(row.username_enc) : undefined,
        password: socialCredentialCrypto.decrypt(row.password_enc),
        note: row.note_enc ? socialCredentialCrypto.decrypt(row.note_enc) : undefined,
        reason: decision.reason,
      };
    } catch {
      // Anahtar değişmiş ya da satır kurcalanmış. Hata metnine şifreli değer
      // KOYULMUYOR; kullanıcıya yapılabilecek tek şey söyleniyor.
      throw new BadRequestException(
        "Şifre çözülemedi. Sunucudaki şifreleme anahtarı değişmiş olabilir; kaydı yeniden girin."
      );
    }
  }

  // ============================================================ Yazma

  async create(accountId: string, input: SocialCredentialInput, userId: string): Promise<SocialCredential> {
    const account = await this.accountRow(accountId);
    const access = await this.access(account, userId);
    if (!access.canWrite) throw new ForbiddenException("Bu modüle şifre ekleme yetkiniz yok");
    if (!input.password?.trim()) throw new BadRequestException("Şifre gerekli");
    this.assertConfigured();

    const { data, error } = await this.supabase.client
      .from("social_account_credentials")
      .insert({
        account_id: accountId,
        label: nullable(input.label) ?? "Ana giriş",
        username_enc: this.encryptOptional(input.username),
        password_enc: socialCredentialCrypto.encrypt(input.password.trim()),
        note_enc: this.encryptOptional(input.note),
        created_by: userId,
        updated_by: userId,
      })
      .select("*, social_accounts(id, organization_id, job_id, department_id)")
      .single();
    if (error) throw error;

    const row = data as unknown as CredentialRow;
    // Ekleyen kişi kaydın sahibidir: yeniden sorgulamadan tam yetkiyle dönüyoruz.
    return this.mapCredential(
      row,
      { canReveal: true, reason: access.canManageTeam ? "admin" : "creator", canEdit: true },
      undefined,
      access.canManageTeam ? 0 : undefined
    );
  }

  async update(id: string, input: SocialCredentialInput, userId: string): Promise<SocialCredential> {
    const row = await this.credentialRow(id);
    const access = await this.access(row.social_accounts, userId);
    const decision = decideCredentialAccess({
      canReadModule: access.canRead,
      isAdmin: access.canManageTeam,
      isCreator: row.created_by === userId,
      hasActiveGrant: false, // izin görmeye yeter, değiştirmeye yetmez
    });
    if (!decision.canEdit) {
      throw new ForbiddenException("Bu kaydı yalnızca yöneticiler ve şifreyi giren kişi düzenleyebilir");
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: userId };
    if (input.label !== undefined) patch.label = nullable(input.label) ?? "Ana giriş";
    if (input.username !== undefined) {
      this.assertConfigured();
      patch.username_enc = this.encryptOptional(input.username);
    }
    if (input.note !== undefined) {
      this.assertConfigured();
      patch.note_enc = this.encryptOptional(input.note);
    }
    // Boş şifre "değiştirme" demek değil "dokunma" demek: form şifreyi hiçbir
    // zaman dolu getirmiyor (sır listede dönmüyor), boş gönderim olağan.
    if (input.password?.trim()) {
      this.assertConfigured();
      patch.password_enc = socialCredentialCrypto.encrypt(input.password.trim());
      patch.password_changed_at = new Date().toISOString();
    }

    const { data, error } = await this.supabase.client
      .from("social_account_credentials")
      .update(patch)
      .eq("id", id)
      .select("*, social_accounts(id, organization_id, job_id, department_id)")
      .single();
    if (error) throw error;

    const updated = data as unknown as CredentialRow;
    const names = await this.userNames([updated.created_by]);
    return this.mapCredential(
      updated,
      decision,
      updated.created_by ? names.get(updated.created_by) : undefined
    );
  }

  async remove(id: string, userId: string): Promise<{ ok: true }> {
    const row = await this.credentialRow(id);
    const access = await this.access(row.social_accounts, userId);
    const decision = decideCredentialAccess({
      canReadModule: access.canRead,
      isAdmin: access.canManageTeam,
      isCreator: row.created_by === userId,
      hasActiveGrant: false,
    });
    if (!decision.canEdit) {
      throw new ForbiddenException("Bu kaydı yalnızca yöneticiler ve şifreyi giren kişi silebilir");
    }

    // Arşivleme değil silme: sırrın "eski hali" diye bir işi yok, veritabanında
    // durması yalnızca risktir. İzinler ve denetim izi cascade ile gider.
    const { error } = await this.supabase.client.from("social_account_credentials").delete().eq("id", id);
    if (error) throw error;
    return { ok: true };
  }

  private encryptOptional(value?: string): string | null {
    const trimmed = nullable(value);
    return trimmed ? socialCredentialCrypto.encrypt(trimmed) : null;
  }

  /**
   * Anahtar yoksa kaydı düz metin yazmaktansa hiç yazmıyoruz.
   *
   * Hata çalışma anında değil kurulum anında görülsün diye mesaj yapılacak işi
   * söylüyor; ortam değişkeninin DEĞERİ mesaja girmiyor.
   */
  private assertConfigured(): void {
    if (!socialCredentialCrypto.isConfigured()) {
      throw new BadRequestException(
        "Şifre saklama kapalı: sunucuda SOCIAL_CREDENTIAL_ENC_KEY tanımlı değil. Sistem yöneticinize bildirin."
      );
    }
  }

  // ============================================================ İzinler

  private async assertAdmin(row: CredentialRow, userId: string): Promise<void> {
    const access = await this.access(row.social_accounts, userId);
    if (!access.canManageTeam) {
      throw new ForbiddenException("Şifre izinlerini yalnızca modül yöneticileri yönetebilir");
    }
  }

  async grants(credentialId: string, userId: string): Promise<SocialCredentialGrant[]> {
    const row = await this.credentialRow(credentialId);
    await this.assertAdmin(row, userId);

    const { data, error } = await this.supabase.client
      .from("social_credential_grants")
      .select("*")
      .eq("credential_id", credentialId)
      .order("granted_at", { ascending: true });
    if (error) throw error;

    const rows = data ?? [];
    const names = await this.userNames(rows.flatMap((g: any) => [g.user_id, g.granted_by]));
    return rows.map((g: any) => ({
      id: g.id,
      credentialId: g.credential_id,
      userId: g.user_id,
      userName: names.get(g.user_id),
      grantedBy: g.granted_by ?? undefined,
      grantedByName: g.granted_by ? names.get(g.granted_by) : undefined,
      grantedAt: g.granted_at,
      expiresAt: g.expires_at ?? undefined,
      revokedAt: g.revoked_at ?? undefined,
      active: isGrantActive(g),
    }));
  }

  /**
   * Bir kişiye görme izni verir.
   *
   * İzin yalnızca MODÜL EKİBİNE verilebiliyor: departmanı görebildiği için
   * modülü okuyabilen ama sosyal medyada çalışmayan birine şifre açılmasın.
   * "Önce ekibe ekleyin" demek, izin listesini ekip listesinden ayrı bir
   * yetki kaynağı olmaktan çıkarıyor.
   */
  async grant(
    credentialId: string,
    targetUserId: string,
    expiresAt: string | null,
    userId: string
  ): Promise<SocialCredentialGrant> {
    const row = await this.credentialRow(credentialId);
    await this.assertAdmin(row, userId);
    if (!targetUserId) throw new BadRequestException("Kişi seçin");

    const scope = this.scopeOf(row.social_accounts);
    const members =
      "jobId" in scope
        ? await this.moduleMembers.findByJobModule(scope.jobId, SOCIAL_MODULE_KEY)
        : await this.moduleMembers.findByOrganizationModule(
            scope.organizationId,
            SOCIAL_MODULE_KEY,
            scope.departmentId
          );
    const member = members.find((m) => m.userId === targetUserId && m.status === "approved");
    if (!member) {
      throw new BadRequestException(
        "Bu kişi sosyal medya modülü ekibinde değil. Önce modüle ekleyin, sonra şifre izni verin."
      );
    }

    // Aynı kişiye ikinci satır açılmıyor: izin geri alınıp yeniden verildiğinde
    // aynı satır tazeleniyor (bkz. social_credential_grants_unique).
    const { data, error } = await this.supabase.client
      .from("social_credential_grants")
      .upsert(
        {
          credential_id: credentialId,
          user_id: targetUserId,
          granted_by: userId,
          granted_at: new Date().toISOString(),
          expires_at: expiresAt,
          revoked_at: null,
          revoked_by: null,
        },
        { onConflict: "credential_id,user_id" }
      )
      .select("*")
      .single();
    if (error) throw error;

    const names = await this.userNames([data.user_id, data.granted_by]);
    return {
      id: data.id,
      credentialId: data.credential_id,
      userId: data.user_id,
      userName: names.get(data.user_id),
      grantedBy: data.granted_by ?? undefined,
      grantedByName: data.granted_by ? names.get(data.granted_by) : undefined,
      grantedAt: data.granted_at,
      expiresAt: data.expires_at ?? undefined,
      active: isGrantActive(data),
    };
  }

  /** İzni geri alır. Satır silinmez: kimin ne zaman erişebildiği geçmişi kalır. */
  async revokeGrant(grantId: string, userId: string): Promise<{ ok: true }> {
    const { data: grant, error: grantError } = await this.supabase.client
      .from("social_credential_grants")
      .select("credential_id")
      .eq("id", grantId)
      .maybeSingle();
    if (grantError) throw grantError;
    if (!grant) throw new NotFoundException("İzin bulunamadı");

    const row = await this.credentialRow(grant.credential_id);
    await this.assertAdmin(row, userId);

    const { error } = await this.supabase.client
      .from("social_credential_grants")
      .update({ revoked_at: new Date().toISOString(), revoked_by: userId })
      .eq("id", grantId);
    if (error) throw error;
    return { ok: true };
  }

  /** Şifrenin gösterildiği anlar — "en son kim gördü" sorusunun cevabı. */
  async views(credentialId: string, userId: string, limit = 50): Promise<SocialCredentialView[]> {
    const row = await this.credentialRow(credentialId);
    await this.assertAdmin(row, userId);

    const { data, error } = await this.supabase.client
      .from("social_credential_views")
      .select("*")
      .eq("credential_id", credentialId)
      .order("viewed_at", { ascending: false })
      .limit(limit);
    if (error) throw error;

    const rows = data ?? [];
    const names = await this.userNames(rows.map((v: any) => v.user_id));
    return rows.map((v: any) => ({
      id: v.id,
      credentialId: v.credential_id,
      userId: v.user_id ?? undefined,
      userName: v.user_id ? names.get(v.user_id) : undefined,
      reason: v.reason,
      viewedAt: v.viewed_at,
    }));
  }
}
