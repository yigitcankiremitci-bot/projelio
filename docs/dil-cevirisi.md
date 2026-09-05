# Çeviri rehberi (Türkçe → İngilizce)

Projelio iki dilli: Türkçe kaynak dil, İngilizce çeviri. Bu belge çeviriyi
ilerletirken uyulacak kuralları anlatır. Mimarinin *neden*i
`packages/shared/src/i18n.ts` başındaki yorumda.

## Kısaca

Anahtar, arayüzdeki **Türkçe metnin kendisi**:

```tsx
const t = useT();
<button>{t("Görev ekle")}</button>
```

Türkçede `t()` kimlik fonksiyonudur — sözlüğe hiç bakmaz. İngilizcede sözlüğe
bakar, **karşılığı yoksa Türkçesini döndürür**. Yani yarım kalmış çeviri boş
ekran değil, Türkçe metin üretir; her ara durum canlıya çıkabilir.

## Nerede ne var

| Ne | Nerede |
|---|---|
| Çekirdek (çevirmen, dil çözümleme) | `packages/shared/src/i18n.ts` |
| Web kancaları (`useT`, `useLocale`) | `apps/web/src/lib/i18n/index.tsx` |
| Web sözlüğü (alan başına dosya) | `apps/web/src/lib/i18n/en/` |
| Sunucu çevirisi | `backend/src/common/i18n/index.ts` |
| Sunucu sözlüğü | `backend/src/common/i18n/en/` |
| Kullanıcının dilini bulan servis | `backend/src/common/i18n/kullanici-dili.service.ts` |
| Lio'nun dile göre değişen kuralları | `backend/src/modules/ai-assistant/lio-dil-kurallari.ts` |
| Dil kolonu | `database/migrations/087_kullanici_dili.sql` |

## Komutlar

```bash
npm run dil                        # özet: ne kadarı sarıldı, ne eksik
node scripts/dil-denetimi.mjs --eksik        # sarılı ama çevirisi yok
node scripts/dil-denetimi.mjs --sarilmamis <dosya>   # o dosyada kalan iş
node scripts/dil-sar.mjs <dosya...>          # güvenli yerleri otomatik sar
```

`--eksik` boş değilse CI kırmızıya döner: `t()` ile sarılıp sözlüğe girmemiş
metin, İngilizce arayüzde sessizce Türkçe görünür ve başka hiçbir yerde belli
olmaz.

## Bir dosyayı çevirme adımları

1. `node scripts/dil-sar.mjs <dosya>` — JSX metin düğümlerini ve görünen
   öznitelikleri (`title`, `placeholder`, `aria-label`…) sarar.
2. Bileşene `const t = useT();` ekle. `npm run typecheck` eksikleri söyler.
3. `node scripts/dil-denetimi.mjs --sarilmamis <dosya>` ile kalanları elle sar.
4. Karşılıkları ilgili sözlük dosyasına yaz (`apps/web/src/lib/i18n/en/`).
5. `npm run typecheck && npm run dil`.

## SARMA — neyi sarma

Türkçe içeren her dize ekrana çıkmıyor. Şunlar **sarılmaz**:

- **Karşılaştırma değerleri**: `if (durum === "Tamamlandı")`. Sarmak İngilizce
  arayüzde karşılaştırmayı bozar ve hata sessizdir — kod çalışır, yanlış çalışır.
- **Veritabanına yazılan sabitler**, nesne anahtarları, olay adları.
- **Log ve hata ayıklama metinleri** (`logger.warn(...)`). Onları kullanıcı değil
  geliştirici okuyor.
- **Lio'ya verilen araç açıklamaları ve sistem promptu**. Onları model okuyor;
  dile göre değişen tek bölüm `lio-dil-kurallari.ts` (gerekçesi o dosyada).
- **Dil adları**: "Türkçe" İngilizce arayüzde de "Türkçe" kalır, yoksa o dili
  arayan kullanıcı listede kendi dilini tanıyamaz.

## İki işaret, iki farklı anlam

`// dil:atla` — bu metin **hiç çevrilmeyecek**. Marka adı ("Projelio"), dil adı
("Türkçe"), teknik sabit. Denetim onu bir daha hiç sormaz.

`// dil:anahtar` — metin **modül düzeyindeki bir sabitte** duruyor
(`const TABS = [{ label: "Görünüm" }]`), orada kanca çağrılamaz. Türkçe metin
**anahtar olarak** kalır ve çeviri kullanıldığı yerde yapılır: `{t(sekme.label)}`.

İkisini karıştırma. `dil:anahtar` bir susturucu **değil**, yükümlülüktür: metin
sarılmış sayılır, yani sözlükte karşılığı yoksa "eksik çeviri" olarak raporlanır
ve CI kırılır. Bir kez ters anlaşıldı ve 111 çevrilmemiş metin "tamam"
görünüyordu; işaretin anlamı bu yüzden sıkılaştırıldı.

## Şablon dizeleri

Şablon dizesi anahtar **olamaz** — her çağrıda farklı bir dize üretir ve sözlükte
hiçbir zaman bulunmaz:

```tsx
// yanlış
t(`${ad} görevi tamamladı`)

// doğru
t("{ad} görevi tamamladı", { ad: user.fullName })
```

### Değişken içeren hata mesajları

İstisna mesajları HTTP sınırında çevriliyor (`all-exceptions.filter.ts`), yani
koddaki Türkçe metin anahtardır. Ama şablon dizesi yazarsan değişken **çoktan
gömülmüş** olur ve sözlükte hiçbir zaman bulunmaz — mesaj sessizce Türkçe kalır.
Bunun için `hataMetni()` var:

```ts
// yanlış — anahtar her çağrıda değişir, asla bulunamaz
throw new BadRequestException(`Şifre çok uzun (${bytes} bayt).`);

// doğru
throw new BadRequestException(
  hataMetni("Şifre çok uzun ({bayt} bayt).", { bayt: bytes })
);
```

`hataMetni` Türkçe mesajı `message` alanında hazır bırakır (filtre hiç çalışmasa
bile okunabilir bir metin kalsın diye) ve anahtarı ayrıca taşır. Denetim betiği
dönüştürülmemiş olanları "⚠ Şablon dizesi" başlığı altında listeler.

Sunucuda aynı kural, bildirimler için `Metin` tipiyle:

```ts
notifyUserSafe(userId, "task_assigned", "Yeni Görev Atandı", {
  metin: '{atayan}, seni "{gorev}" görevine atadı.',
  params: { atayan, gorev: task.title },
});
```

## Sayılar

Türkçede sayıdan sonra çoğul eki yok, İngilizcede var. Kaynak metin tek biçimde
yazılır, karşılığı iki biçimli olur:

```ts
t("{n} görev", { n: count })
// sözlükte:
"{n} görev": { one: "{n} task", other: "{n} tasks" },
```

## Eşsesli metinler

"Kapat" düğmesi ile "Kapat" anahtarı aynı Türkçe metni paylaşır ama İngilizcede
"Close" ve "Off" olur:

```tsx
t("Kapat")                      // Close
t("Kapat", { ctx: "anahtar" })  // Off
```

Sözlükte: `"Kapat ##anahtar": "Off"`.

## Çeviri üslubu

- **Kısa tut.** Türkçe metinden uzun bir çeviri düğmeyi taşırır.
- Ürünün kendi sözlüğünü kullan: job, project, output, task, subtask, budget,
  organization, department, routine, module. Eşanlamlı uydurma.
- Kullanıcıya "you" diye hitap et; yetkin bir meslektaş tonu, müşteri hizmetleri
  değil. Ünlem ve emoji yok.
- Kullanıcının kendi verdiği adlar (proje adı, görev başlığı) **çevrilmez**.

## Kullanıcının dili nereden geliyor

Sırayla: hesap tercihi (`users.locale`) > bu tarayıcıdaki seçim > tarayıcı dili
> Türkçe. Hesapta `NULL` "Türkçe" değil, **"kullanıcı seçim yapmadı"** demektir;
o hâlde tarayıcıya (web) ya da `Accept-Language` başlığına (e-posta, bildirim)
bakılır. Kullanıcı Ayarlar > Dil'den seçtiği an kolon dolar ve tahmin devre
dışı kalır.
