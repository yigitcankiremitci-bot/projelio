import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createRetryingFetch } from "./retrying-fetch";

@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseService.name);
  public client!: SupabaseClient;

  onModuleInit() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error(
        "SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY .env dosyasında tanımlı olmalı. " +
          "Service role anahtarını Supabase Dashboard > Project Settings > API > service_role secret'tan alabilirsiniz."
      );
    }

    this.client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        // Supabase istemcisi kendiliğinden yeniden denemez; kısa bir ağ
        // kesintisi anında kullanıcıya hata olarak yansıyordu. Yalnızca okuma
        // istekleri yeniden denenir (bkz. retrying-fetch.ts).
        fetch: createRetryingFetch(fetch, {
          onRetry: (attempt, error) =>
            this.logger.warn(
              `Supabase isteği yeniden deneniyor (${attempt}. deneme): ${
                error instanceof Error ? error.message : String(error)
              }`
            ),
        }),
      },
    });

    // Adres bilerek yazılıyor: "Supabase bağlantısı kuruldu" cümlesi göçten
    // sonra yanıltıcı hâle geldi — istemci hâlâ supabase-js ama karşı taraf
    // Supabase değil, kendi sunucumuz. Asıl merak edilen zaten HANGİ
    // veritabanına bağlanıldığı: canlı mı, eski Supabase kopyası mı?
    this.logger.log(`Veritabanı bağlantısı kuruldu · ${new URL(url).host}`);
  }

  /**
   * Tarayıcıya verilecek GENEL storage adresi.
   *
   * NEDEN getPublicUrl'in çıktısı doğrudan kullanılamıyor: supabase-js adresi
   * SUPABASE_URL'den türetir. Kendi sunucumuzda o değer bir İÇ AĞ adı
   * (http://caddy) — konteynerler arası konuşma için doğru, ama tarayıcıda
   * çözülmez. Doğrudan kullanılsaydı yeni yüklenen her kapak ve avatar
   * veritabanına açılamayan bir adresle yazılırdı; üstelik hata anında değil,
   * ancak biri görseli görmeye çalıştığında ortaya çıkardı.
   *
   * PUBLIC_STORAGE_URL tanımlıysa adresin kökü onunla değiştirilir. Supabase
   * barındırmalı kurulumda SUPABASE_URL zaten genel bir adres olduğu için
   * değişken tanımsız bırakılır ve davranış hiç değişmez.
   */
  publicStorageUrl(bucket: string, path: string): string {
    const { data } = this.client.storage.from(bucket).getPublicUrl(path);
    return this.toPublicUrl(data.publicUrl);
  }

  private toPublicUrl(url: string): string {
    const genel = process.env.PUBLIC_STORAGE_URL?.trim().replace(/\/+$/, "");
    const ic = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
    if (!genel || !ic || genel === ic) return url;
    return url.startsWith(ic) ? genel + url.slice(ic.length) : url;
  }
}
