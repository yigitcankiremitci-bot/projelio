# Geri alma (rollback) betikleri

Buradaki dosyalar **ileri migration değildir** — bir migration'ın etkisini geri
almak için, ELLE ve bilinçli olarak çalıştırılır.

## Neden ayrı klasörde

Önceden `database/migrations/` içinde, geri aldıkları migration'la **aynı
numarayı taşıyarak** duruyorlardı:

```
045_planning_calendar.sql          ileri
045_planning_calendar_down.sql     geri   ← aynı numara, aynı klasör
062_veritabani_izin_kurallari.sql  ileri
062_..._geri_al.sql                geri   ← aynı numara, aynı klasör
```

Bu, sıralı toplu uygulamada felakete açık bir düzendi. Yeni bir sunucu kurarken
ya da felaket kurtarmada migration'lar sırayla uygulanır:

```bash
for f in database/migrations/*.sql; do psql -v ON_ERROR_STOP=1 < "$f"; done
```

Alfabetik sırada `045_planning_calendar.sql` hemen ardından
`045_planning_calendar_down.sql` geliyordu: takvim tabloları oluşturulup **aynı
turda düşürülüyordu**. 062'de aynı şey izin kurallarını geri sarıyor, yani
`anon` rolünün yetkileri geri veriliyordu — sessiz bir güvenlik açığı.

Ayrı klasörde durduklarında `migrations/*.sql` kalıbı onlara hiç dokunmaz.

## Nasıl kullanılır

Yalnızca ilgili değişikliği gerçekten geri almak istediğinde, tek tek:

```bash
ssh projelio@100.111.242.24 'docker exec -i projelio-postgres sh -c "psql -v ON_ERROR_STOP=1 -U \$POSTGRES_USER -d \$POSTGRES_DB"' < database/geri-al/045_planning_calendar_down.sql
```

Geri alma **veri kaybettirir** (tablo düşürür, yetki geri verir). Çalıştırmadan
önce güncel bir yedek al: `deploy/yedekle.sh`.

## Yeni geri alma betiği eklerken

Geri aldığı migration'la aynı numarayı kullan (izlemesi kolay olsun) ama dosyayı
**bu klasöre** koy, `migrations/` altına değil.
