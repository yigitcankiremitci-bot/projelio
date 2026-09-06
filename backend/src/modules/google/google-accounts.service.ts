import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";
import { DRIVE_SCOPE, GoogleOAuthService } from "./google-oauth.service";
import { decryptToken, encryptToken } from "./token-crypto.util";
import { TekUcus } from "../../common/tek-ucus";

export interface GoogleAccount {
  id: string;
  userId: string;
  googleSub: string;
  email: string;
  pictureUrl?: string;
  scopes: string[];
  rootFolderId?: string;
  hasRefreshToken: boolean;
  driveRevokedAt?: string;
  connectedAt: string;
  /** Kullanıcının verdiği ad ("Şirket Drive'ı"). Birden fazla hesap bağlıyken ayırt etmek için. */
  label?: string;
  /** Bu hesapla Google ile giriş yapılabilir mi (bkz. migration 088). */
  isLoginIdentity: boolean;
}

function mapAccount(row: any): GoogleAccount {
  return {
    id: row.id,
    userId: row.user_id,
    googleSub: row.google_sub,
    email: row.email,
    pictureUrl: row.picture_url ?? undefined,
    scopes: row.scopes ?? [],
    rootFolderId: row.root_folder_id ?? undefined,
    hasRefreshToken: Boolean(row.refresh_token_enc),
    driveRevokedAt: row.drive_revoked_at ?? undefined,
    connectedAt: row.connected_at,
    label: row.label ?? undefined,
    // Migration 088 uygulanmadan önceki satırlarda kolon yok: eski davranış
    // "bağlı olan hesap giriş kimliğidir" olduğu için varsayılan true.
    isLoginIdentity: row.is_login_identity ?? true,
  };
}

/** Erişim token'ı bellekte tutulur; 1 saat ömürlü olduğu için veritabanına yazılmaz. */
interface CachedAccessToken {
  token: string;
  expiresAt: number;
}

export class DriveNotConnectedError extends BadRequestException {
  constructor(message = "Google Drive bağlı değil. Ayarlar'dan Drive hesabınızı bağlayın.") {
    super(message);
  }
}

export class DriveReauthRequiredError extends BadRequestException {
  constructor(message = "Google Drive erişimi sona ermiş. Ayarlar'dan yeniden bağlanın.") {
    super(message);
  }
}

@Injectable()
export class GoogleAccountsService {
  private readonly logger = new Logger(GoogleAccountsService.name);
  private readonly accessTokenCache = new Map<string, CachedAccessToken>();

  constructor(
    private supabase: SupabaseService,
    private oauth: GoogleOAuthService
  ) {}

  async findByGoogleSub(googleSub: string): Promise<GoogleAccount | undefined> {
    const { data, error } = await this.supabase.client
      .from("google_accounts")
      .select()
      .eq("google_sub", googleSub)
      .maybeSingle();
    if (error) throw error;
    return data ? mapAccount(data) : undefined;
  }

  /**
   * Kullanıcının VARSAYILAN Google hesabı.
   *
   * Artık kullanıcı başına birden fazla hesap olabildiği için (migration 088)
   * bu metot "tek satır" varsaymaz; giriş kimliğini, o da yoksa ilk bağlananı
   * döndürür. Sıralama sabit tutulmak zorunda: kullanıcı bir gün bir hesabı,
   * ertesi gün diğerini "varsayılan" görürse dosyaları farklı Drive'lara
   * dağılırdı.
   *
   * Belirli bir şirketin deposu için bu metot DEĞİL, organization_storage
   * üzerinden çözümleme kullanılır (bkz. CloudStorageService.resolveAccount).
   */
  async findByUserId(userId: string): Promise<GoogleAccount | undefined> {
    const { data, error } = await this.supabase.client
      .from("google_accounts")
      .select()
      .eq("user_id", userId)
      .order("is_login_identity", { ascending: false })
      .order("connected_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? mapAccount(data) : undefined;
  }

  /** Kullanıcının bağlı BÜTÜN Google hesapları (Ayarlar > Bağlı hesaplar listesi). */
  async listByUserId(userId: string): Promise<GoogleAccount[]> {
    const { data, error } = await this.supabase.client
      .from("google_accounts")
      .select()
      .eq("user_id", userId)
      .order("connected_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapAccount);
  }

  /**
   * Kullanıcının GİRİŞ kimliği olan Google hesabı.
   *
   * "Google ile giriş" yalnızca bunun üzerinden çalışır: depo olarak eklenen
   * ikinci bir hesap giriş yolu AÇMAMALI, yoksa şirketine Drive bağlayan
   * herkes farkında olmadan hesabına ikinci bir anahtar takmış olur.
   */
  async findLoginIdentity(userId: string): Promise<GoogleAccount | undefined> {
    const { data, error } = await this.supabase.client
      .from("google_accounts")
      .select()
      .eq("user_id", userId)
      .eq("is_login_identity", true)
      .maybeSingle();
    if (error) throw error;
    return data ? mapAccount(data) : undefined;
  }

  async findById(id: string): Promise<GoogleAccount | undefined> {
    const { data, error } = await this.supabase.client
      .from("google_accounts")
      .select()
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapAccount(data) : undefined;
  }

  /**
   * Google'dan dönen kimliği ve token'ları kaydeder.
   *
   * Aynı google_sub ile ikinci kez gelindiğinde kayıt güncellenir. refresh_token
   * yalnızca Google gönderdiğinde yazılır — göndermediği durumda eldeki token
   * hâlâ geçerlidir ve üzerine null yazmak erişimi koparırdı.
   */
  async upsert(params: {
    userId: string;
    googleSub: string;
    email: string;
    pictureUrl?: string;
    refreshToken?: string;
    scopes: string[];
    /**
     * Bu hesapla giriş yapılabilsin mi. Verilmezse: kullanıcının başka giriş
     * kimliği YOKSA true (eski davranış — ilk bağlanan hesap giriş kimliğidir),
     * varsa false (depo olarak eklenen ikinci hesap giriş yolu açmaz).
     */
    isLoginIdentity?: boolean;
    label?: string;
  }): Promise<GoogleAccount> {
    const existing = await this.findByGoogleSub(params.googleSub);

    const patch: Record<string, unknown> = {
      user_id: params.userId,
      google_sub: params.googleSub,
      email: params.email,
      picture_url: params.pictureUrl ?? null,
      scopes: params.scopes,
    };

    if (params.refreshToken) {
      patch.refresh_token_enc = encryptToken(params.refreshToken);
      patch.drive_revoked_at = null;
      patch.last_refreshed_at = new Date().toISOString();
    }

    if (params.label !== undefined) patch.label = params.label || null;

    if (existing) {
      // Scope'lar birikimlidir: kullanıcı önce girişle gelir, sonra Drive'ı
      // bağlar. Yeni istek eski izinleri kapsamıyorsa da kaybetmemeliyiz.
      patch.scopes = Array.from(new Set([...existing.scopes, ...params.scopes]));

      const { data, error } = await this.supabase.client
        .from("google_accounts")
        .update(patch)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      this.accessTokenCache.delete(existing.id);
      return mapAccount(data);
    }

    // Giriş kimliği kullanıcı başına tek: ilk hesap onu üstlenir, sonrakiler
    // yalnızca depo olur. Veritabanında da kısmi unique index var (mig. 088),
    // yani bu karar atlansa bile ikinci giriş kimliği yazılamaz.
    patch.is_login_identity = params.isLoginIdentity ?? !(await this.findLoginIdentity(params.userId));

    const { data, error } = await this.supabase.client
      .from("google_accounts")
      .insert(patch)
      .select()
      .single();
    if (error) throw error;
    return mapAccount(data);
  }

  async setLabel(accountId: string, label: string): Promise<void> {
    const { error } = await this.supabase.client
      .from("google_accounts")
      .update({ label: label.trim() || null })
      .eq("id", accountId);
    if (error) throw error;
  }

  async setRootFolderId(accountId: string, folderId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from("google_accounts")
      .update({ root_folder_id: folderId })
      .eq("id", accountId);
    if (error) throw error;
  }

  async markRevoked(accountId: string): Promise<void> {
    this.accessTokenCache.delete(accountId);
    const { error } = await this.supabase.client
      .from("google_accounts")
      .update({ drive_revoked_at: new Date().toISOString() })
      .eq("id", accountId);
    if (error) throw error;
  }

  /**
   * Drive bağlantısını keser.
   *
   * İki farklı sonuç var ve fark önemli:
   *   * Giriş kimliği olan hesapta SATIR KALIR, yalnızca token ve Drive izni
   *     silinir — aksi hâlde kullanıcı "Google ile giriş" yolunu da kaybederdi.
   *   * Yalnızca depo için eklenen ikinci hesapta satır tamamen SİLİNİR; giriş
   *     kimliği olmadığı için boş kabuk tutmanın anlamı yok.
   *
   * `accountId` verilmezse kullanıcının varsayılan hesabı kesilir (eski
   * davranış, tek hesabı olan kullanıcılar için aynı sonuç).
   */
  async disconnectDrive(userId: string, accountId?: string): Promise<void> {
    const account = accountId ? await this.findById(accountId) : await this.findByUserId(userId);
    if (!account) return;
    // Başkasının hesabını kesmek: kimlik doğrulanmış bir istekte bile id
    // istemciden geliyor, sahiplik burada teyit edilmek zorunda.
    if (account.userId !== userId) throw new BadRequestException("Bu hesap size ait değil.");

    const refreshToken = await this.readRefreshToken(account.id);
    if (refreshToken) await this.oauth.revokeToken(refreshToken);

    this.accessTokenCache.delete(account.id);

    if (!account.isLoginIdentity) {
      const { error } = await this.supabase.client.from("google_accounts").delete().eq("id", account.id);
      // 23503: hesap hâlâ bir işin/departmanın/şirketin deposu olarak kullanılıyor
      // (on delete restrict). Sessizce yutmak, dosyaları erişilemez bırakırdı.
      if (error && (error as any).code === "23503") {
        throw new BadRequestException(
          "Bu hesapta saklanan dosyalar var. Önce ilgili şirket/departman için başka bir depo hesabı seçin."
        );
      }
      if (error) throw error;
      return;
    }

    const { error } = await this.supabase.client
      .from("google_accounts")
      .update({
        refresh_token_enc: null,
        root_folder_id: null,
        drive_revoked_at: new Date().toISOString(),
        scopes: account.scopes.filter((s) => s !== DRIVE_SCOPE),
      })
      .eq("id", account.id);
    if (error) throw error;
  }

  private async readRefreshToken(accountId: string): Promise<string | undefined> {
    const { data, error } = await this.supabase.client
      .from("google_accounts")
      .select("refresh_token_enc")
      .eq("id", accountId)
      .maybeSingle();
    if (error) throw error;
    if (!data?.refresh_token_enc) return undefined;

    try {
      return decryptToken(data.refresh_token_enc);
    } catch (err) {
      // Anahtar değişmiş ya da kayıt bozulmuş olabilir. Sessizce yanlış davranmak
      // yerine hesabı iptal işaretleyip kullanıcıdan yeniden bağlanmasını isteriz.
      this.logger.error(`Refresh token çözülemedi (account=${accountId}): ${String(err)}`);
      await this.markRevoked(accountId);
      return undefined;
    }
  }

  /**
   * Kullanılabilir bir access token döndürür. Önce bellekteki önbelleğe bakar,
   * yoksa refresh token ile yenisini alır.
   */
  async getAccessToken(accountId: string): Promise<string> {
    const cached = this.accessTokenCache.get(accountId);
    // 60 saniyelik pay: token isteğin ortasında sona ermesin.
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

    // Aynı hesap için EŞZAMANLI yenileme yapılmaz.
    //
    // NEDEN: ön yüz bir Drive klasörünü açarken paralel birkaç istek atıyor
    // (liste + küçük resimler). Token o anda süresi dolmuşsa hepsi birden
    // önbellekte bulamayıp AYRI AYRI yenileme başlatıyordu. Google bunu tolere
    // ediyor ama refresh token rotasyonu olan sağlayıcılarda SON YAZAN KAZANIR
    // ve diğerlerinin aldığı token geçersizleşir — kullanıcı sebepsiz yere
    // "yeniden bağlanın" ekranı görür.
    //
    // Çözüm: ilk çağıran yenilemeyi başlatır, aynı anda gelenler AYNI promise'i
    // bekler. finally'de haritadan silinir ki sonraki yenileme yeniden başlasın.
    return this.tekUcus.calistir(accountId, () => this.refreshAccessTokenNow(accountId));
  }

  /** Hesap başına tek yenileme (bkz. common/tek-ucus.ts — orada sınanıyor). */
  private readonly tekUcus = new TekUcus<string>();

  private async refreshAccessTokenNow(accountId: string): Promise<string> {
    const account = await this.findById(accountId);
    if (!account) throw new DriveNotConnectedError();
    if (account.driveRevokedAt) throw new DriveReauthRequiredError();

    const refreshToken = await this.readRefreshToken(accountId);
    if (!refreshToken) throw new DriveNotConnectedError();

    const result = await this.oauth.refreshAccessToken(refreshToken);
    if ("invalidGrant" in result) {
      await this.markRevoked(accountId);
      throw new DriveReauthRequiredError();
    }

    this.accessTokenCache.set(accountId, {
      token: result.accessToken,
      expiresAt: Date.now() + result.expiresIn * 1000,
    });

    void this.supabase.client
      .from("google_accounts")
      .update({ last_refreshed_at: new Date().toISOString() })
      .eq("id", accountId)
      .then(undefined, () => undefined);

    return result.accessToken;
  }

  /** Kullanıcının Drive'ı gerçekten kullanılabilir durumda mı? */
  isDriveReady(account: GoogleAccount | undefined): account is GoogleAccount {
    return Boolean(
      account && account.hasRefreshToken && !account.driveRevokedAt && account.scopes.includes(DRIVE_SCOPE)
    );
  }
}
