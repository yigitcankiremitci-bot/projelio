import { Injectable, Logger } from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";
import { socialTokenCrypto } from "./instagram-oauth.service";

/**
 * Sosyal hesap jetonlarının tek kapısı.
 *
 * KURAL: `social_account_tokens` tablosunu başka hiçbir servis okumaz. Jeton
 * bu sınıftan çözülmüş halde çıkar, hiçbir API yanıtına konmaz, hiçbir log'a
 * yazılmaz. Tabloyu ayrı tutmanın sebebi de bu — hesabı okuyan onlarca kod
 * yolu (panel, rapor, ileride AI bağlamı) aynı zamanda bir sırrı okumasın.
 *
 * Şifreleme common/crypto/token-crypto.ts'te; anahtar SOCIAL_TOKEN_ENC_KEY.
 */

export interface StoredToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  scopes?: string[];
}

@Injectable()
export class SocialTokensService {
  private readonly logger = new Logger(SocialTokensService.name);

  constructor(private supabase: SupabaseService) {}

  /** Jetonu şifreleyip yazar (varsa üzerine). */
  async save(
    accountId: string,
    token: { accessToken: string; refreshToken?: string; expiresAt?: Date | null; scopes?: string[] }
  ): Promise<void> {
    const { error } = await this.supabase.client.from("social_account_tokens").upsert(
      {
        account_id: accountId,
        access_token_enc: socialTokenCrypto.encrypt(token.accessToken),
        refresh_token_enc: token.refreshToken ? socialTokenCrypto.encrypt(token.refreshToken) : null,
        expires_at: token.expiresAt ? token.expiresAt.toISOString() : null,
        last_refreshed_at: new Date().toISOString(),
        scopes: token.scopes ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id" }
    );
    if (error) throw error;
  }

  /**
   * Jetonu çözer.
   *
   * Çözme hatası (anahtar değişmiş, satır kurcalanmış) sessizce yutulmaz ama
   * çağıranı da patlatmaz: null döner, çağıran "yeniden bağlanın" der.
   * Alternatifi, tek bozuk satır yüzünden bütün yayın kuyruğunun durmasıydı.
   */
  async read(accountId: string): Promise<StoredToken | null> {
    const { data, error } = await this.supabase.client
      .from("social_account_tokens")
      .select("*")
      .eq("account_id", accountId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    try {
      return {
        accessToken: socialTokenCrypto.decrypt(data.access_token_enc),
        refreshToken: data.refresh_token_enc ? socialTokenCrypto.decrypt(data.refresh_token_enc) : undefined,
        expiresAt: data.expires_at ?? undefined,
        scopes: data.scopes ?? undefined,
      };
    } catch (err) {
      this.logger.error(`Jeton çözülemedi (hesap ${accountId}): ${(err as Error).message}`);
      return null;
    }
  }

  async remove(accountId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from("social_account_tokens")
      .delete()
      .eq("account_id", accountId);
    if (error) throw error;
  }

  /**
   * Yenilenmesi gereken hesaplar.
   *
   * Instagram uzun ömürlü jetonu süresi DOLMADAN yenilenmek zorunda; dolmuş
   * jeton yenilenemez ve kullanıcı yeniden bağlanmak zorunda kalır. Bu yüzden
   * eşik geniş tutuluyor (varsayılan 10 gün): tatilde olan bir kullanıcı
   * yüzünden bağlantı kopmasın.
   */
  async findExpiring(withinDays = 10): Promise<{ accountId: string; token: StoredToken }[]> {
    const threshold = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await this.supabase.client
      .from("social_account_tokens")
      .select("account_id")
      .lt("expires_at", threshold)
      .not("expires_at", "is", null);
    if (error) throw error;

    const rows: { accountId: string; token: StoredToken }[] = [];
    for (const row of data ?? []) {
      const token = await this.read(row.account_id);
      if (token) rows.push({ accountId: row.account_id, token });
    }
    return rows;
  }
}
