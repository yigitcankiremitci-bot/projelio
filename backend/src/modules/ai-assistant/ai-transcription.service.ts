import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";

/** OpenAI transkripsiyon uç noktasının kabul ettiği azami dosya boyutu. */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export interface TranscriptionResult {
  text: string;
  /** Saniye cinsinden ses uzunluğu — ücretlendirme buradan yapılır. */
  durationSeconds: number;
}

/**
 * Ses dosyalarını yazıya çevirir.
 *
 * NEDEN AYRI BİR SAĞLAYICI: Anthropic modelleri ses girdisi kabul etmiyor. Ses
 * önce burada metne çevrilir, Lio'ya METİN olarak verilir; sohbetin geri kalanı
 * yine Anthropic'te işlenir. Kullanıcı bu ayrımı görmez, faturada da görmez —
 * bedeli aynı "Projelio Kredisi" olarak düşülür (bkz. calculateTranscriptionCost).
 *
 * SDK eklenmedi: tek bir multipart POST için bağımlılık taşımaya değmiyor.
 */
@Injectable()
export class AiTranscriptionService implements OnModuleInit {
  private readonly logger = new Logger(AiTranscriptionService.name);

  /**
   * Açılışta durumu loga yazar.
   *
   * Anahtarın çalışan süreçte olup olmadığı dışarıdan görünmüyordu: .env'e satır
   * eklenip backend yeniden başlatılmadığında dosyada anahtar var ama süreçte
   * yok, hata mesajı ise "dosyaya ekleyin" diyordu. Bu satır o belirsizliği
   * kaldırıyor — açılış logunda hangi durumda olduğu yazılı.
   */
  onModuleInit(): void {
    this.logger.log(
      this.configured
        ? "Ses çözümleme hazır (OPENAI_API_KEY tanımlı)."
        : "Ses çözümleme KAPALI: OPENAI_API_KEY tanımlı değil. Sesli komut ve ses ekleri çalışmayacak."
    );
  }

  /** Anahtar tanımlı mı? Tanımlı değilse ses ekleri baştan reddedilir. */
  get configured(): boolean {
    return !!process.env.OPENAI_API_KEY?.trim();
  }

  async transcribe(buffer: Buffer, fileName: string, mimeType: string): Promise<TranscriptionResult> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      // "Anahtarı ekledim ama hâlâ bu hatayı alıyorum" en sık yaşanan durum:
      // dotenv .env'i yalnızca AÇILIŞTA okuyor, çalışan sürece sonradan eklenen
      // satır ulaşmıyor. Mesaj bunu açıkça söylüyor, yoksa dosyaya bakıp
      // "ama orada duruyor" demekle vakit kaybediliyor.
      throw new BadRequestException(
        "Ses çözümleme yapılandırılmamış: backend/.env dosyasında OPENAI_API_KEY yok. " +
          "Anahtarı az önce eklediysen backend'i YENİDEN BAŞLAT — .env yalnızca açılışta okunuyor."
      );
    }
    if (buffer.length > MAX_AUDIO_BYTES) {
      throw new BadRequestException("Ses dosyası çok büyük (en fazla 25 MB). Kaydı bölerek gönderin.");
    }

    const form = new FormData();
    // Buffer doğrudan BlobPart olarak kabul edilmiyor (SharedArrayBuffer ihtimali);
    // Uint8Array'e sarmak tipi netleştirir, kopya oluşturmaz.
    form.append(
      "file",
      new Blob([new Uint8Array(buffer)], { type: mimeType || "audio/mpeg" }),
      fileName || "ses.mp3"
    );
    form.append("model", process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || "whisper-1");
    // Süre bilgisi yalnızca verbose_json'da dönüyor; ücretlendirme ona dayanıyor.
    form.append("response_format", "verbose_json");
    // Dil ipucu Türkçe doğruluğunu belirgin biçimde artırıyor; kullanıcı kitlesi Türkçe.
    form.append("language", process.env.OPENAI_TRANSCRIBE_LANGUAGE?.trim() || "tr");

    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
    } catch (err: any) {
      throw new ServiceUnavailableException(
        `Ses çözümleme servisine ulaşılamadı: ${err?.message ?? "bağlantı hatası"}`
      );
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      // Sağlayıcının ham hatası kullanıcıya gösterilmez (anahtar/kota bilgisi sızabilir),
      // ama loga tam olarak düşer.
      this.logger.error(`Transkripsiyon başarısız (${response.status}): ${detail.slice(0, 300)}`);
      throw new ServiceUnavailableException("Ses yazıya çevrilemedi. Lütfen tekrar deneyin.");
    }

    const data: any = await response.json();
    const text = String(data?.text ?? "").trim();
    if (!text) {
      throw new BadRequestException("Ses dosyasından metin çıkarılamadı; kayıt sessiz ya da çok kısa olabilir.");
    }

    // Süre gelmezse ücretsiz saymak yerine ihtiyatlı bir alt sınır kullanılır:
    // aksi halde süresi okunamayan her kayıt Projelio'ya zarar yazardı.
    const durationSeconds = Number(data?.duration) > 0 ? Number(data.duration) : 60;
    return { text, durationSeconds };
  }
}
