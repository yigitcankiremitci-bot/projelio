import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import type { DemoMeetDurumu } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import {
  DEMO_TAKVIM_IZNI,
  takvimIzniVerildi,
  etkinligiSil,
  etkinlikSaatiniGuncelle,
  meetEtkinligiAc,
  type DemoMeetEtkinligi,
} from "./google-takvim";
import { GoogleOAuthService, LOGIN_SCOPES } from "../google/google-oauth.service";
import { decryptToken, encryptToken } from "../google/token-crypto.util";

/**
 * Otomatik Google Meet: randevu bir sunucuya atanınca SUNUCUNUN takviminde bir
 * etkinlik açılır ve Google o etkinliğe özel bir Meet odası üretir.
 *
 * NEDEN SUNUCUNUN TAKVİMİ: Meet odasının sahibi etkinliğin sahibi. Katılımcı
 * etkinliğe davetli eklendiği için "katılma isteği" göndermeden içeri girer;
 * ortak bir oda (sabit bağlantı) kullanılsaydı her görüşmede biri kapıda
 * beklerdi ve önceki görüşme uzarsa sonraki katılımcı içeri düşerdi.
 *
 * GOOGLE'IN KENDİ DAVETİ GÖNDERİLMİYOR (sendUpdates=none): katılımcı bizim
 * e-postamızı (Türkçe, takvim düğmeli, yönetim bağlantılı) alıyor; ikinci bir
 * İngilizce Google daveti kafa karıştırırdı. Etkinliğin iCalUID'si bizim .ics
 * dosyamızınkiyle aynı — Gmail kullanıcısının takviminde tek kayıt kalsın.
 *
 * HİÇBİR HATA RANDEVUYU DURDURMAZ: Google'a ulaşılamazsa çağıran (bkz.
 * DemoRandevuService.guncelle) sunucunun kişisel ya da varsayılan bağlantısına
 * düşer. Randevu atanamaz hâle gelmek, bağlantısız kalmaktan kötü.
 */
@Injectable()
export class DemoMeetService {
  private readonly logger = new Logger(DemoMeetService.name);

  constructor(
    private supabase: SupabaseService,
    private oauth: GoogleOAuthService
  ) {}

  yapilandirildi(): boolean {
    return this.oauth.isDriveConfigured();
  }

  async durum(userId: string): Promise<DemoMeetDurumu> {
    const { data } = await this.supabase.client
      .from("demo_sunuculari")
      .select("google_eposta, google_refresh_token")
      .eq("user_id", userId)
      .maybeSingle();
    return {
      yapilandirildi: this.yapilandirildi(),
      bagli: Boolean(data?.google_refresh_token),
      eposta: data?.google_refresh_token ? (data.google_eposta ?? null) : null,
    };
  }

  /** Google onay ekranının adresi. Dönüş google.controller'daki ortak callback'e düşer. */
  baglantiAdresi(userId: string): string {
    if (!this.yapilandirildi()) {
      throw new BadRequestException("Google entegrasyonu sunucuda yapılandırılmamış.");
    }
    const state = this.oauth.signState({ mode: "demo_takvim", userId, next: "/settings" });
    // Hesap seçme ekranı zorunlu: kişi Projelio'ya kişisel Gmail'iyle girmiş
    // olabilir ama demoları şirket hesabından yapmak isteyebilir.
    return this.oauth.buildAuthUrl({ scopes: [...LOGIN_SCOPES, DEMO_TAKVIM_IZNI], state, selectAccount: true });
  }

  /** google.controller callback'i "demo_takvim" akışında buraya devreder. */
  async baglantiyiKaydet(userId: string, eposta: string, refreshToken: string | undefined, izinler: string[]): Promise<void> {
    // Kullanıcı onay ekranında takvim kutusunun işaretini kaldırabiliyor
    // (Google izinleri tek tek seçtiriyor). O hâlde kaydetmek, ilk randevuda
    // sessizce düşecek bir bağlantı bırakırdı.
    if (!takvimIzniVerildi(izinler)) {
      throw new BadRequestException("Takvim izni verilmedi. Bağlarken takvim kutusunu işaretli bırak.");
    }
    if (!refreshToken) throw new BadRequestException("Google kalıcı erişim vermedi. Tekrar bağlanmayı dene.");
    const { error } = await this.supabase.client.from("demo_sunuculari").upsert({
      user_id: userId,
      google_eposta: eposta,
      google_refresh_token: encryptToken(refreshToken),
      google_baglandi_at: new Date().toISOString(),
    });
    if (error) throw new BadRequestException(error.message);
  }

  async baglantiyiKes(userId: string): Promise<void> {
    const { data } = await this.supabase.client
      .from("demo_sunuculari")
      .select("google_refresh_token")
      .eq("user_id", userId)
      .maybeSingle();
    if (data?.google_refresh_token) {
      try {
        await this.oauth.revokeToken(decryptToken(data.google_refresh_token));
      } catch {
        /* çözülemeyen token: yerel kayıt yine silinir */
      }
    }
    await this.supabase.client
      .from("demo_sunuculari")
      .update({ google_eposta: null, google_refresh_token: null, google_baglandi_at: null })
      .eq("user_id", userId);
  }

  /**
   * Sunucunun takviminde etkinlik + Meet odası açar.
   * @returns null → sunucu bağlı değil ya da Google'a ulaşılamadı (çağıran yedeğe düşer)
   */
  async olustur(sahipId: string, e: DemoMeetEtkinligi): Promise<{ etkinlikId: string; link: string } | null> {
    const token = await this.erisimJetonu(sahipId);
    if (!token) return null;
    try {
      const sonuc = await meetEtkinligiAc(token, e);
      if ("hata" in sonuc) {
        this.logger.error(`Meet etkinliği açılamadı: ${sonuc.hata}`);
        return null;
      }
      return sonuc;
    } catch (err) {
      this.logger.error(`Meet etkinliği açılırken hata: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }

  async saatiGuncelle(sahipId: string, etkinlikId: string, baslangic: string, bitis: string): Promise<boolean> {
    const token = await this.erisimJetonu(sahipId);
    if (!token) return false;
    const ok = await etkinlikSaatiniGuncelle(token, etkinlikId, baslangic, bitis).catch(() => false);
    if (!ok) this.logger.warn(`Meet etkinliği taşınamadı (${etkinlikId})`);
    return ok;
  }

  /** İptal ya da görev değişikliği: etkinliği sahibinin takviminden kaldır. */
  async sil(sahipId: string, etkinlikId: string): Promise<void> {
    const token = await this.erisimJetonu(sahipId);
    if (!token) return;
    const ok = await etkinligiSil(token, etkinlikId).catch(() => false);
    if (!ok) this.logger.warn(`Meet etkinliği silinemedi (${etkinlikId}); sunucu takviminden elle silebilir.`);
  }

  /**
   * Kısa ömürlü erişim jetonu. Önbellek yok: günde birkaç randevu için her
   * seferinde yenilemek ucuz, önbellek ise ikinci bir süre dolumu hatası kaynağı.
   *
   * invalid_grant → sunucu erişimi Google tarafında kaldırmış; bağlantı silinir
   * ki panelde "bağlı" görünmeye devam etmesin.
   */
  private async erisimJetonu(userId: string): Promise<string | null> {
    if (!this.yapilandirildi()) return null;
    const { data } = await this.supabase.client
      .from("demo_sunuculari")
      .select("google_refresh_token")
      .eq("user_id", userId)
      .maybeSingle();
    if (!data?.google_refresh_token) return null;
    try {
      const sonuc = await this.oauth.refreshAccessToken(decryptToken(data.google_refresh_token));
      if ("invalidGrant" in sonuc) {
        this.logger.warn(`Demo takvim bağlantısı Google tarafında kaldırılmış (kullanıcı ${userId}); bağlantı silindi.`);
        await this.supabase.client
          .from("demo_sunuculari")
          .update({ google_eposta: null, google_refresh_token: null, google_baglandi_at: null })
          .eq("user_id", userId);
        return null;
      }
      return sonuc.accessToken;
    } catch (err) {
      this.logger.error(`Demo takvim jetonu alınamadı: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }
}
