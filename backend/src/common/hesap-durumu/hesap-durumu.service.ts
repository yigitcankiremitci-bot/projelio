import { Global, Injectable, Logger, Module } from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";
import { oturumKarari, utcMs, type HesapEngelKaydi, type OturumKarari } from "./oturum-engeli";

/**
 * Askıya alınmış ya da oturumu iptal edilmiş hesapların bellek içi listesi.
 *
 * NEDEN ÖNBELLEK: jwt.strategy her istekte çalışıyor ve bilerek veritabanına
 * gitmiyordu (bkz. session-payload.ts, MUTLAK ÖMÜR) — her API çağrısına bir
 * gidiş-dönüş eklemek tüm uygulamayı yavaşlatırdı. Oysa engelli hesap sayısı
 * çok küçük: 30 saniyede bir yalnızca o satırlar okunuyor (kısmi indeks,
 * migration 108) ve karar bellekten veriliyor.
 *
 * GECİKME: yönetici bu süreçte işlem yaptığında önbellek ANINDA güncellenir.
 * Birden fazla backend süreci varsa diğerleri en geç TAZELEME_MS içinde
 * yakalar.
 *
 * VERİTABANI OKUNAMAZSA eldeki liste korunur (fail-open değil, "son bilineni
 * koru"). Listeyi boşaltmak askıdaki hesapları açardı; herkesi reddetmek ise
 * tek bir veritabanı hıçkırığında bütün kullanıcıları çıkışa düşürürdü.
 */
const TAZELEME_MS = 30_000;

@Injectable()
export class HesapDurumuService {
  private readonly logger = new Logger(HesapDurumuService.name);
  private kayitlar = new Map<string, HesapEngelKaydi>();
  private sonTazeleme = 0;
  private tazeleniyor: Promise<void> | null = null;

  constructor(private supabase: SupabaseService) {}

  async karar(userId: string, loginAt: number | undefined): Promise<OturumKarari> {
    if (Date.now() - this.sonTazeleme > TAZELEME_MS) {
      // İlk yüklemede beklenir (liste henüz boş, beklemeden karar vermek askıdaki
      // hesabı açardı); sonrakilerde istek bekletilmez, arka planda tazelenir.
      const tazele = this.tazele();
      if (this.sonTazeleme === 0) await tazele;
    }
    return oturumKarari(this.kayitlar.get(userId), loginAt);
  }

  /** Yönetici işleminden hemen sonra: bu süreçte beklemeden etkili olsun. */
  guncelle(userId: string, kayit: HesapEngelKaydi): void {
    if (kayit.bannedAt === null && kayit.sessionsRevokedAt === null) this.kayitlar.delete(userId);
    else this.kayitlar.set(userId, kayit);
  }

  private tazele(): Promise<void> {
    if (this.tazeleniyor) return this.tazeleniyor;
    this.tazeleniyor = (async () => {
      try {
        const { data, error } = await this.supabase.client
          .from("users")
          .select("id, banned_at, sessions_revoked_at")
          .or("banned_at.not.is.null,sessions_revoked_at.not.is.null");
        if (error) throw error;
        const yeni = new Map<string, HesapEngelKaydi>();
        for (const row of data ?? []) {
          const r = row as any;
          yeni.set(r.id, {
            bannedAt: utcMs(r.banned_at),
            sessionsRevokedAt: utcMs(r.sessions_revoked_at),
          });
        }
        this.kayitlar = yeni;
        this.sonTazeleme = Date.now();
      } catch (e) {
        // Migration 108 uygulanmadan sütunlar yok: sürekli log yağdırmasın diye
        // zaman damgası yine ilerletiliyor, bir sonraki deneme TAZELEME_MS sonra.
        this.sonTazeleme = Date.now();
        this.logger.warn(`Hesap durumu okunamadı, son bilinen liste kullanılıyor: ${(e as Error).message}`);
      } finally {
        this.tazeleniyor = null;
      }
    })();
    return this.tazeleniyor;
  }
}

@Global()
@Module({
  providers: [HesapDurumuService],
  exports: [HesapDurumuService],
})
export class HesapDurumuModule {}
