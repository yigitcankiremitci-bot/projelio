import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import type Anthropic from "@anthropic-ai/sdk";

// SDK bu tipi dışa açmıyor; MessageParam içeriğinden türetiliyor
// (ai-assistant.service.ts'teki aynı satırın eşi).
type ContentBlockParam = Extract<Anthropic.MessageParam["content"], any[]>[number];
import { SupabaseService } from "../../database/supabase.service";
import { AiCreditsService } from "../ai-assistant/ai-credits.service";
import { MIN_BALANCE_TO_START } from "../ai-assistant/ai-credits.config";
import { LlmProviderRegistry } from "../ai-assistant/providers/provider-registry";
import { ModuleMembersService } from "../module-members/module-members.service";
import type { FaturaKapsami } from "./faturalar.service";
import { FaturaOkunamadi, faturaCevabiniCoz, FATURA_OKUMA_SISTEMI, OKUNABILIR_MIME, type OkunanFatura } from "./fatura-okuma";

/**
 * "Lio yardımı" anahtarı ve belgeden fatura okuma.
 *
 * FaturalarService'ten ayrı: oradaki her şey elle girilen bir kaydın etrafında
 * dönüyor ve AI'dan hiç haberi yok. Okuma ise kredi harcayan, sağlayıcıya çıkan
 * ve YANLIŞ CEVAP VEREBİLEN bir iş — iki sorumluluğu aynı dosyada tutmak,
 * "fatura eklemek" ile "fatura okutmak"ı birbirine karıştırmak olurdu.
 */

/**
 * Bir okuma için ayrılan kredi tavanı.
 *
 * Gerçek bedel kullanımdan sonra kesiliyor; bu sayı yalnızca İŞE BAŞLAMADAN
 * önceki kontrol için. Bir fatura sayfası (görsel + kısa JSON yanıt) en pahalı
 * modelde bile bunun çok altında kalıyor; tavanı geniş tutmak, yeterli bakiyesi
 * olan kullanıcıyı boşuna durdurmamak için.
 */
const OKUMA_KREDI_TAHMINI = 60;

/** Yanıt kısa: tek bir JSON nesnesi. Geniş tavan yalnızca para harcatır. */
const MAX_YANIT_TOKEN = 1024;

@Injectable()
export class LioYardimiService {
  private readonly logger = new Logger(LioYardimiService.name);

  constructor(
    private supabase: SupabaseService,
    private credits: AiCreditsService,
    private providers: LlmProviderRegistry,
    private moduleMembers: ModuleMembersService
  ) {}

  // ------------------------------------------------------------------ anahtar

  private tablo(kapsam: FaturaKapsami) {
    return kapsam.kind === "job"
      ? { ad: "job_modules", sutun: "job_id" }
      : { ad: "organization_modules", sutun: "organization_id" };
  }

  /** Anahtarın durumu. Modül o kapsama atanmamışsa kapalı sayılır. */
  async durum(kapsam: FaturaKapsami, moduleKey: string, userId: string) {
    const { ad, sutun } = this.tablo(kapsam);
    const { data } = await this.supabase.client
      .from(ad)
      .select("ai_assist")
      .eq(sutun, kapsam.id)
      .eq("module_key", moduleKey)
      .maybeSingle();

    // Bakiye BURADAN dönüyor: arayüzün anahtarı çizmek için zaten bu uca
    // gitmesi gerekiyor, krediyi ayrı bir istekte sormak iki gidiş dönüş ve
    // ikisinin arasında değişebilen bir durum demekti.
    const balance = await this.credits.getBalance(userId);
    return {
      enabled: Boolean(data?.ai_assist),
      krediVar: balance.balance >= MIN_BALANCE_TO_START,
      bakiye: balance.balance,
      minBakiye: MIN_BALANCE_TO_START,
      /** Sunucuda belge okuyabilen bir model yoksa anahtar hiç açılmamalı. */
      okuyabilir: this.providers.visionChoice("smart") !== null,
    };
  }

  /** Anahtarı değiştirir. Yetki KAYIT YAZMA yetkisiyle aynı: modüle yazan, nasıl yazılacağına da karar verir. */
  async ayarla(kapsam: FaturaKapsami, moduleKey: string, acik: boolean, userId: string) {
    await this.yazmaYetkisi(kapsam, moduleKey, userId);

    if (acik) {
      // Kredisi olmayan biri anahtarı açabilseydi, açık bir anahtarın hiçbir
      // şey yapmadığı bir durum doğardı: bıraktığı belge sessizce elle giriş
      // akışına düşer ve kullanıcı Lio'nun çalıştığını sanırdı.
      const balance = await this.credits.getBalance(userId);
      if (balance.balance < MIN_BALANCE_TO_START) {
        throw new BadRequestException(
          "Lio yardımını açmak için Lio Bakiyen olmalı. Ayarlar > Lio Bakiyesi sayfasından bakiye yükleyebilirsin."
        );
      }
      if (!this.providers.visionChoice("smart")) {
        throw new BadRequestException("Sunucuda belge okuyabilen bir AI sağlayıcısı tanımlı değil.");
      }
    }

    const { ad, sutun } = this.tablo(kapsam);
    const { data, error } = await this.supabase.client
      .from(ad)
      .update({ ai_assist: acik })
      .eq(sutun, kapsam.id)
      .eq("module_key", moduleKey)
      .select("ai_assist")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new BadRequestException("Bu modül bu alana atanmamış.");
    return { enabled: Boolean(data.ai_assist) };
  }

  /** Anahtar açık mı — okuma akışının kapıda sorduğu soru. */
  async acikMi(kapsam: FaturaKapsami, moduleKey: string): Promise<boolean> {
    const { ad, sutun } = this.tablo(kapsam);
    const { data } = await this.supabase.client
      .from(ad)
      .select("ai_assist")
      .eq(sutun, kapsam.id)
      .eq("module_key", moduleKey)
      .maybeSingle();
    return Boolean(data?.ai_assist);
  }

  private async yazmaYetkisi(kapsam: FaturaKapsami, moduleKey: string, userId: string): Promise<void> {
    const access =
      kapsam.kind === "job"
        ? await this.moduleMembers.resolveJobAccess(kapsam.id, moduleKey, userId)
        : await this.moduleMembers.resolveOrganizationAccess(kapsam.id, moduleKey, userId);
    if (!access.canWrite) {
      throw new BadRequestException("Bu modülün ayarlarını değiştirme yetkin yok.");
    }
  }

  // -------------------------------------------------------------------- okuma

  /**
   * Belgeyi modele okutur.
   *
   * Kredi İKİ AŞAMALI: başlamadan önce bakiye en pahalı hâli karşılıyor mu diye
   * bakılıyor (yoksa iş hiç başlamıyor, kullanıcı eksi bakiye görmüyor), sonra
   * GERÇEK kullanım kadar kesiliyor. Sohbetteki akışın aynısı.
   *
   * Okuma başarısız olsa bile kredi kesilir: sağlayıcı isteği işledi ve bedeli
   * bize yazdı. Kullanıcıya bunu söylemek, sessizce yutmaktan dürüst.
   */
  async faturayiOku(
    file: Express.Multer.File,
    userId: string
  ): Promise<{ fatura: OkunanFatura; kredi: number; model: string }> {
    if (!file) throw new BadRequestException("Dosya gönderilmedi");
    if (!OKUNABILIR_MIME.has(file.mimetype)) {
      throw new BadRequestException(
        "Lio yalnızca PDF ve fotoğraf okuyabiliyor. Bu dosyayı elle girmen gerekiyor."
      );
    }

    const choice = this.providers.visionChoice("smart");
    if (!choice) throw new BadRequestException("Sunucuda belge okuyabilen bir AI sağlayıcısı tanımlı değil.");

    const bakiye = await this.credits.assertCanStart(userId);
    this.credits.assertBalanceCovers(bakiye, OKUMA_KREDI_TAHMINI);

    const response = await choice.provider.send({
      model: choice.model,
      max_tokens: MAX_YANIT_TOKEN,
      system: FATURA_OKUMA_SISTEMI,
      messages: [{ role: "user", content: [this.belgeBlogu(file), { type: "text", text: "Bu belgeyi oku." }] }],
    });

    const { credits } = await this.credits.chargeUsage({
      userId,
      model: choice.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheWriteTokens: response.usage.cache_creation_input_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens,
    });

    const metin = response.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");

    try {
      return { fatura: faturaCevabiniCoz(metin), kredi: credits, model: choice.model };
    } catch (err) {
      if (err instanceof FaturaOkunamadi) {
        this.logger.warn(
          `Fatura okunamadı (model=${choice.model}, kredi=${credits}): ${err.message}`
        );
        // Mesaj OLDUĞU GİBİ geçiyor: sözlükte anahtar olarak duruyor ve
        // istisna filtresi kullanıcının diline çeviriyor. Araya kredi tutarı
        // gibi bir değişken eklenseydi ortaya çıkan cümle sözlükte bulunamaz,
        // İngilizce kullanıcıya Türkçe dönerdi (bkz. common/i18n > hataMetni).
        // Harcanan kredi log'da; kullanıcı tarafında bakiye rozeti hatadan
        // sonra da tazeleniyor (bkz. LioYardimiKutusu).
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  /** PDF "document", görseller "image" bloğu olarak gider (bkz. ai-assistant.service.ts). */
  private belgeBlogu(file: Express.Multer.File): ContentBlockParam {
    const base64 = file.buffer.toString("base64");
    if (file.mimetype === "application/pdf") {
      // SDK 0.32 "document" bloğunu yalnızca beta ad alanında tipliyor; API
      // tarafında PDF desteği genel kullanımda (aynı not: ai-assistant.service.ts).
      return {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: base64 },
      } as unknown as ContentBlockParam;
    }
    return {
      type: "image",
      source: { type: "base64", media_type: file.mimetype as any, data: base64 },
    } as ContentBlockParam;
  }
}
