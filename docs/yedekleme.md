# Yedekleme

Bu belge yedeğin **ne olduğunu ve nasıl geri yükleneceğini** anlatır. Betiğin
kendi içindeki yorumlar daha ayrıntılıdır: `deploy/yedekle.sh`.

> 2026-08-30'daki VPS göçünden önce yedekleme Supabase panelinde yönetiliyordu.
> Artık öyle değil: her şey kendi sunucumuzda ve yedeği biz alıyoruz.

## Veri nerede duruyor

| Ne | Nerede | Yedekleniyor mu |
|---|---|---|
| Veritabanı | Kendi VPS'imizde Postgres 17 (`projelio-postgres` konteyneri) | ✅ `pg_dump -Fc` |
| WhatsApp oturumları | Aynı Postgres, `waha%` önekli ayrı veritabanları | ✅ ayrı dump |
| Yüklenen dosyalar | `/srv/projelio/data/storage` (kapak, avatar, ekler) | ✅ `tar.gz` |
| Sırlar (`.env`, `/etc/projelio`) | Sunucuda | ❌ **bilerek hariç** (aşağıya bak) |

## Nasıl çalışıyor

`deploy/yedekle.sh` her gece **03:30**'da kullanıcı crontab'ıyla koşuyor
(sunucuda root olmadığı için systemd birimi değil — bkz. CLAUDE.md).

Betiğin yaptıkları, sırayla:

1. **Disk kontrolü** — 2 GB'ın altında boş alan varsa yedek almaz. Diski
   doldurup canlıyı durdurmak, o günün yedeğini atlamaktan beterdir.
2. **Veritabanı** — `pg_dump -Fc` (custom format). Önce geçici ada yazılır,
   `pg_restore --list` ile **okunabilirliği sınanır**, ancak geçerse gerçek
   adına taşınır. Sessizce bozuk bir yedek, yedeksizlikten tehlikelidir.
3. **WhatsApp oturumları** — WAHA oturum anahtarlarını ana veritabanında değil
   `waha%` önekli ayrı veritabanlarında tutuyor; ana dump onları kapsamaz.
   Kaybı ölümcül değil (QR ile yeniden bağlanılır) ama her felakette QR
   okutmamak için alınıyor.
4. **Yüklenen dosyalar** — `tar.gz`. Veritabanı bunlara yalnızca yol tutuyor;
   dosyalar giderse kayıtlar kırık bağlantıya döner, o yüzden ikisi birlikte.
5. **Dış kopya** — `PROJELIO_UZAK_HEDEF` tanımlıysa `rclone` ile uzak hedefe.
6. **Yaşam sinyali** — `PROJELIO_YEDEK_PING` tanımlıysa başarıda ping atılır.

Saklama: **14 günlük** + **8 haftalık** (pazar kopyası). `flock` ile üst üste
binme koruması var.

## ⚠️ Kurulması gereken iki şey

Kod hazır ama **ortam değişkeni tanımlanana kadar sessizce kapalı**:

### 1. Dış kopya — en yüksek öncelikli eksik

Şu an yedekler `/srv/projelio/yedek` altında, yani **korumaya çalıştıkları
diskin üzerinde**. Disk ölürse veri de yedek de gider; sunucu ele geçirilirse
yedekler saldırganla aynı makinededir.

```bash
curl https://rclone.org/install.sh | sudo bash   # root gerekiyorsa ikiliyi ~/bin'e koy
rclone config      # hedefi tanımla (B2/S3/Drive)
rclone config      # üzerine type=crypt katmanı ekle — yedek şifreli çıksın
```

Sonra `~/uyari.env` ya da crontab'a:

```bash
PROJELIO_UZAK_HEDEF=yedek-sifreli:projelio
```

Betik `--immutable` ile gönderir: uzakta var olan dosya bir daha yazılmaz
(yerelde bozulan bir dosya uzaktakini ezemesin). **Saklama uzakta ayrıca
ayarlanmalı** (B2 lifecycle / S3 object lock); betik uzaktan hiçbir şey silmez.

### 2. Yaşam sinyali

"Yedek başarısız oldu"yu log'a yazmak yetmiyor, kimse log'a bakmıyor. Daha
kötüsü: betik **hiç çalışmadıysa** (cron silinmiş, sunucu kapalı) log'da da
hiçbir şey olmuyor — sessizlik hem "her şey yolunda" hem "haftalardır yedek
yok" anlamına geliyor.

[healthchecks.io](https://healthchecks.io) üzerinde bir kontrol oluşturup:

```bash
PROJELIO_YEDEK_PING=https://hc-ping.com/<kontrol-kimligi>
```

Beklenen sürede sinyal gelmezse karşı taraf uyarır. Hata durumunda betik
`/fail` uçuna ping atar. Arıza bildirimi için ayrıca `deploy/uyar.sh`
(ntfy/Telegram) devrede — bkz. CLAUDE.md.

## Sırlar neden yedeklenmiyor

`.env` ve `/etc/projelio` altındaki anahtarlar **bilerek** dışarıda: yedek
dosyası sızarsa anahtarlar da sızmasın. Bunların ayrı bir kopyası olmalı
(parola yöneticisi). Kaybı geri dönüşü olmayan tek şey bunlar — veritabanı
yedekten döner, ama `SOCIAL_CREDENTIAL_ENC_KEY` giderse şifreli sosyal medya
jetonları **hiçbir şekilde** çözülemez.

Yedeklenmesi gereken kritik değişkenler: `APP_JWT_SECRET`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `POSTGRES_PASSWORD`,
`SOCIAL_CREDENTIAL_ENC_KEY`, `GOOGLE_TOKEN_ENC_KEY`, `WAHA_API_KEY`,
`ANTHROPIC_API_KEY`, VAPID anahtar çifti.

## Geri yükleme

Yedekler `pg_dump -Fc` (custom format) — **düz SQL değil**, yani `psql <
dosya` ile geri yüklenmez, `pg_restore` gerekir.

```bash
# Veritabanı (DİKKAT: hedefteki veriyi ezer)
docker exec -i projelio-postgres pg_restore -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" --clean --if-exists < yedek.dump

# Yüklenen dosyalar
tar -xzf depo-YYYYMMDD-HHMM.tar.gz -C /srv/projelio/data/
```

Şema değiştiyse PostgREST önbelleğini tazele:

```bash
docker exec projelio-postgres sh -c "psql -U \$POSTGRES_USER -d \$POSTGRES_DB -c \"notify pgrst, 'reload schema'\""
```

Yedeği yerel makineye çekmek için: `deploy/yedek-getir.sh`.

## Denenmemiş olan

`pg_restore --list` yedeğin **okunabilir** olduğunu kanıtlıyor, **geri
yüklenebilir ve tutarlı** olduğunu değil. Tam bir geri dönüş provası henüz
yapılmadı. Ayda bir, tek kullanımlık bir Postgres konteynerine son dump'ı
yükleyip birkaç sağlık sorgusu (tablo sayısı, `users` satır sayısı, en yeni
`created_at`) koşan bir kontrol, "yedeğim var" varsayımını gerçek kanıta
çevirir.

## Kontrol listesi

- [x] Günlük yedek cron'u kurulu (03:30)
- [x] Veritabanı + dosyalar + WhatsApp oturumları kapsamda
- [x] Dump bütünlüğü her yedekte sınanıyor
- [ ] **Dış kopya (`PROJELIO_UZAK_HEDEF`) — kurulmadı**
- [ ] **Yaşam sinyali (`PROJELIO_YEDEK_PING`) — kurulmadı**
- [ ] Sırların parola yöneticisinde kopyası var mı
- [ ] Geri yükleme provası yapıldı mı
