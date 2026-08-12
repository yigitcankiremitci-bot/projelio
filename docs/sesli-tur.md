# Sesli + yazılı kullanım turu

Kullanıcı istediği an, istediği alanda başlatabildiği; metni ekranda gösterirken
aynı anda seslendiren bir ürün turu. Klasik "küçük pencerede yazı" eğitiminden
farkı: anlatım sesli akar, kullanıcı duraklatabilir, geri alabilir, hızını
değiştirebilir ve sesi tamamen kapatıp yalnızca okuyabilir.

## Nasıl çalışır?

1. Kullanıcı sağ üstteki **?** düğmesine basar → bulunduğu sayfayla ilgili
   anlatımlar listelenir (altında uygulamadaki diğer bütün anlatımlar).
2. Bir tur seçilince ekran kararır, anlatılan öğe **spot ışığına** alınır,
   yanında metni ve ses kontrollerini taşıyan baloncuk açılır.
3. Her adımda ses şu sırayla aranır:
   - `public/tour-audio/tr/<turId>/<adimId>.mp3` (kaydedilmiş anlatım)
   - dosya yoksa → tarayıcının konuşma sentezi (Web Speech API)
4. Anlatım bitince (kullanıcı isterse) bir sonraki adıma kendiliğinden geçilir.

Yani **bugün hiçbir ses dosyası olmadan çalışır**. Seslendirmenden ya da AI
seslendirmeden gelen MP3'ler doğru adla klasöre konduğunda, kod değişmeden
otomatik olarak gerçek sese geçer — hepsi bir anda olmak zorunda da değil,
adım adım geçilebilir.

## Dosyalar

| Dosya | İş |
| --- | --- |
| `src/lib/tour/types.ts` | Tip tanımları + `tourAnchor()` yardımcı fonksiyonu |
| `src/lib/tour/tours.ts` | **Turların içeriği (metinler).** Yeni tur eklemek için tek dokunulacak yer |
| `src/lib/tour/narrator.ts` | Ses motoru: MP3 → yoksa TTS; duraklat/devam/hız, uzun metin parçalama |
| `src/lib/tour/TourContext.tsx` | Durum: hangi tur, hangi adım, tercihler, klavye kısayolları |
| `src/components/tour/TourOverlay.tsx` | Karartma + spot ışığı + baloncuk |
| `src/components/tour/TourLauncher.tsx` | Sağ üstteki **?** düğmesi ve tur listesi |
| `src/components/tour/TourHelpDot.tsx` | Herhangi bir alanın yanına konabilen küçük **?** rozeti |
| `public/tour-audio/tr/` | Ses kayıtları (bkz. oradaki README) |
| `scripts/tour-audio.mjs` | Seslendirme metinlerini üretir / eksik kayıtları listeler |

## Yeni tur eklemek

`src/lib/tour/tours.ts` içine bir nesne eklemek yeterli:

```ts
{
  id: "gorev-atama",                 // ses klasörünün adı
  title: "Görev atamak",
  description: "Bir görevi ekipteki birine nasıl verirsin?",
  area: "isler",
  match: /^\/projects\//,            // bu turun önerileceği rotalar
  steps: [
    {
      id: "kisi-sec",                // ses dosyasının adı
      title: "Kişi seçimi",
      text: "Ekranda görünen kısa metin.",
      speech: "Sesli okunacak, biraz daha akıcı metin.",  // boşsa text okunur
      anchor: "task-assignee",       // hedefteki data-tour değeri
      placement: "right",
      optional: true,                // hedef yoksa adımı atla
    },
  ],
}
```

Hedef öğeyi işaretlemek:

```tsx
import { tourAnchor } from "../lib/tour/types";

<button {...tourAnchor("task-assignee")}>Ata</button>
```

`data-tour` kullanılmasının nedeni: CSS sınıfı ya da DOM yapısına bağlanan
turlar, arayüz her değiştiğinde sessizce bozulur. İşaret açıkça konduğu için
kaldırılmadıkça tur çalışmaya devam eder — kaldırılırsa da adım `optional` ise
sessizce atlanır, kullanıcı bozuk bir tur görmez.

## Belirli bir alanı tek başına anlatmak

Bir alanın yanına küçük soru işareti koyup turu **o adımdan** başlatabilirsin:

```tsx
<label>
  Tutar
  <TourHelpDot tour="butce-nasil-calisir" step="kayit-ekle" />
</label>
```

## Seslendirme akışı

```bash
# Seslendirmene / AI aracına verilecek metinleri üret
npm run tour:metin --workspace=@projelio/web     # -> tour-seslendirme-metinleri.md

# Toplu AI üretimi için makine okunur çıktı
npm run tour:manifest --workspace=@projelio/web  # -> JSON (dosya yolu + metin)

# Hangi kayıtlar hâlâ eksik?
npm run tour:eksik --workspace=@projelio/web
```

Kayıtlar `apps/web/public/tour-audio/tr/<turId>/<adimId>.mp3` yoluna konur.
MP3 dosyaları statik varlık olduğu için ayrıca bir kurulum gerekmez.

İleride başka bir dil eklenirse: `public/tour-audio/<dil>/...` klasörü açılır ve
`narrator.ts` içindeki `NARRATION_LANG` sabiti kullanıcının diline bağlanır.

## Kullanıcı tercihleri

`localStorage` içinde tutulur (sunucu tarafında bir alan gerekmez):

| Anahtar | Anlamı |
| --- | --- |
| `projelio_tour_seen_v1` | Görülmüş turlar — kendiliğinden başlayan tur bir kez gösterilir |
| `projelio_tour_voice_v1` | Ses açık mı |
| `projelio_tour_rate_v1` | Anlatım hızı |
| `projelio_tour_autoadvance_v1` | Anlatım bitince kendiliğinden ilerle |

`ilk-adimlar` turu `autoStart: true` olduğu için, kurulum sihirbazını bitirmiş
bir kullanıcı ana sayfaya ilk geldiğinde kendiliğinden bir kez başlar.

## Bilinen sınırlar

- **Tarayıcı sesleri (TTS) cihaza göre değişir.** Windows/Chrome ve macOS'ta
  Türkçe ses genelde var; bazı Linux kurulumlarında hiç yoktur — o durumda
  anlatım sessiz kalır, metin yine okunur. Kalıcı çözüm MP3 kayıtları.
- **Otomatik oynatma** yalnızca kullanıcı etkileşiminden sonra serbesttir.
  Tur bir tıklamayla başladığı için sorun çıkmaz; kendiliğinden başlayan turda
  ses engellenirse metin görünmeye devam eder.
- Spot ışığı hedefi **karartmanın içinde gösterir ama tıklanabilir kılmaz**;
  tur şu an "anlat ve ilerle" mantığında, "kullanıcıya yaptır" adımları yok.
  Gerekirse `TourStep`'e `interactive` alanı eklenip spotun içi tıklanabilir
  bırakılabilir.
