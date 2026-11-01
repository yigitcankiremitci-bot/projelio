# Projelio Ajanı (MVP)

Kullanıcının kendi Mac'inde çalışan kişisel ajan. Model (Ollama) ve ajan
programı bu makinede çalışır; Projelio sunucusu modele hiç bağlanmaz, yalnızca
kuyruğu ve belleği tutar (migration 177, `backend/src/modules/ajan/`).

Bu klasör npm workspace'i **değil** ve bağımlılığı yok: Node 22.18+ TypeScript'i
doğrudan çalıştırıyor. Testleri kök `npm test` koşturur, tip denetimi
`npm run typecheck`'e dahil.

## Ne yapar

- **Sohbet:** Ofisteki ajan robotuna tıklayınca açılan panelden yazdığın mesaja yanıt verir.
  "Bunu unutma" dediğini öğretilenlere kaydeder.
- **Araştırma:** "Araştır"a yazdığın konuyu internette arar, 3-5 kaynak okur, Markdown rapor yazar.
- **Sürekli öğrenme:** Elinde iş yokken (en çok 20 dakikada bir) öğrenme listesinden bir konu alır,
  okur ve kısa not çıkarır. Liste boşalınca öğrettiklerine bakıp kendine yeni konular ekler.
- **Öneri:** Bir iş yapmasını istersen (ör. yapılacak eklemek) yalnızca önerir. Projelio'ya
  sen onaylayınca eklenir.

## Kurulum

1. Ollama'yı kur ve modeli indir:
   ```bash
   brew install ollama && brew services start ollama && ollama pull qwen3:8b
   ```
2. Sunucuda `backend/.env` içine `AJAN_EPOSTALARI=<senin e-postan>` ekle (liste boşsa ajan herkese kapalı).
3. Projelio'da ofisteki ajan robotuna tıkla, **Mac bağlantısı** sekmesinden anahtar üret.
4. Bu repoda:
   ```bash
   bash ajan/kur.sh ajan_XXXXXXXX
   ```
   Betik anahtarı `~/.projelio-ajan/ayar.env` dosyasına yazar (yalnızca sana okunur) ve
   oturum açınca başlayan bir launchd görevi kurar. Günlük: `tail -f ~/.projelio-ajan/ajan.log`.

Kaldırmak için: `bash ajan/kur.sh --kaldir`.

## Ayarlar (`~/.projelio-ajan/ayar.env`)

| Değişken | Varsayılan | Not |
|---|---|---|
| `AJAN_ANAHTARI` | — | Paneldeki "Mac bağlantısı"ndan. Yenisini üretmek eskisini geçersiz kılar. |
| `PROJELIO_API` | `https://api.projelio.app` | |
| `AJAN_MODEL` | `qwen3:8b` | M2 / 16 GB için. Daha güçlü Mac'te `qwen3:14b` denenebilir. |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | |
| `SEARXNG_URL` | `http://100.111.242.24:8888` | VPS'teki SearXNG (`deploy/searxng-kur.sh`), yalnızca Tailscale üzerinden açık. Önce bu denenir. |
| `BRAVE_API_KEY` | — | Brave Search API anahtarı (ücretsiz katmanı var). İkisi de yoksa ajan arama yapamaz, yalnızca verilen adresleri okur. |

## Güvenlik

- Mac'e dışarıdan bağlantı açılmaz; program Projelio'ya kendisi bağlanır.
- Anahtar yalnızca `/ajan/isci/*` uçlarını açar, hesabın geri kalanına erişemez. Sunucuda
  yalnızca sha256 özeti saklanır.
- Ajanın okuyacağı adresi model seçtiği için yerel ağ, localhost (Ollama dahil), Tailscale
  ve bağlantı-yerel adresler okunmaz; yönlendirmelerin her durağı denetlenir (`src/web.ts`).
- Web sayfalarından gelen metin modele "veri" olarak işaretlenir. Asıl koruma şu: ajanın
  Projelio'da iz bırakan her işi kullanıcı onayı bekler.

## Sınırlar

- Mac uyuyunca ajan da durur. İşler sırada bekler, yarım kalan iş 30 dakika sonra kuyruğa döner.
- Model Mac'te çalıştığı için bir araştırma raporu birkaç dakika sürer.
