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

    this.logger.log("Supabase bağlantısı kuruldu");
  }
}
