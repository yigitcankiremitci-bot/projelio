# Tur ses kayıtları (Türkçe)

Bu klasör, sesli kullanım turunun **kaydedilmiş** anlatımlarını tutar.

## Kural

```
public/tour-audio/tr/<turId>/<adimId>.mp3
```

Örnek: `public/tour-audio/tr/ilk-adimlar/sidebar.mp3`

Uygulama her adımda önce bu dosyayı çalmayı dener. Dosya yoksa metni cihazın
kendi konuşma sentezi (Web Speech API) ile okur — yani **hiç dosya olmadan da
çalışır**, kayıtlar geldikçe adım adım gerçek seslendirmeye geçer. Kod tarafında
hiçbir değişiklik gerekmez, dosyayı doğru adla koymak yeterli.

## İş akışı

```bash
# 1) Seslendirmene / AI seslendirme aracına verilecek metinleri üret
npm run tour:metin --workspace=@projelio/web

# 2) Kayıtları bu klasöre, doğru adlarla koy

# 3) Hangileri hâlâ eksik?
npm run tour:eksik --workspace=@projelio/web
```

## Kayıt önerileri

- Format: MP3, 128 kbps mono yeterli (dosyalar 5–20 sn arası, boyut önemli).
- Ses seviyesi: kayıtlar arası tutarlı olsun (-16 LUFS civarı).
- Başta/sonda 200 ms'ten uzun sessizlik bırakma; adımlar arka arkaya akıyor.
- Metni değiştirirsen kaydı da yenile: uygulama ikisini karşılaştırmaz.
- Adım `id`'sini değiştirirsen dosyayı da yeniden adlandır.
