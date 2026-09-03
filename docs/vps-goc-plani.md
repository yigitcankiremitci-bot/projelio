# Tek VPS'e Göç — Önceleme ve Plan

> **✅ GÖÇ TAMAMLANDI (2026-08-30). BU BELGE ARTIK TARİHÎ KAYITTIR.**
>
> Aşağıdaki adımların **tamamı yapıldı**. Gelecek zaman kipini ("kurulacak",
> "taşınır", "geri dönülebilir") plan olarak okuma — hepsi geçmiş.
>
> **Bugünkü gerçek:** her şey tek VPS'te. Web `https://app.projelio.app`,
> API `https://api.projelio.app`, tanıtım `https://projelio.app`. Netlify ve
> Render **kullanılmıyor** (Netlify yalnızca eski adresi yönlendiriyor, Render
> askıda — bkz. `netlify.toml` ve `render.yaml` başlıkları).
>
> **Günlük işletim için buraya bakma.** Yerine:
> - Dağıtım ve yayın: `CLAUDE.md` → "Yayın nasıl oluyor"
> - Yığın tanımı: `deploy/docker-compose.prod.yml`
> - Yedekleme: `docs/yedekleme.md`, `deploy/yedekle.sh`
> - Migration: `deploy/migrate.sh`
>
> **⚠️ Bu belgedeki hâlâ geçerli tek operasyonel uyarı:**
> **Tailscale anahtarı 2027-02-25'te doluyor.** Yenilenmezse tailnet erişimi
> kopar ve 22 numaralı port dışarıya kapalı olduğu için geriye yalnızca
> sağlayıcı konsolu kalır. Tailscale panelinden bu makineye
> *"Disable key expiry"* işaretlemek kalıcı çözümdür (§5'te ayrıntı).
>
> Belgedeki bazı dosya adları hiç üretilmedi (`deploy/Caddyfile.gw`,
> `scripts/vps-goc.sh`, `docs/vps-kurulum.md`) — planlanıp vazgeçilmiş
> adlardır, aramaya kalkma.

Hedef sunucu: `193.111.77.252` (tailnet: `100.111.242.24`)

Göç öncesi dağıtım Netlify (web) + Render (API) + Supabase (veritabanı/storage)
üçlüsüydü; tek bir VPS'e taşındı. Bu belge kararları, adımları ve o gün
tasarlanan geri dönüş yolunu yazar.

## 0. Sunucu önceleme sonucu (doğrulandı)

`193.111.77.252` adresine SSH ile bağlanıldı ve incelendi. Sunucu **taze
kurulmuş, tamamen boş** bir makine.

| Öğe | Değer | Değerlendirme |
|---|---|---|
| İşletim sistemi | Ubuntu 25.10, çekirdek 6.17 | Güncel. Docker resmî deposu destekler |
| CPU | 4 vCPU — Xeon Platinum 8160 @ 2.1 GHz | İhtiyacın iki katı |
| RAM | 7.8 GB (6.8 GB boş) + 3.4 GB swap | Bol; tahminimiz 2 GB idi |
| Disk | 70 GB SSD, 59 GB boş, tek bölüm | Yeterli — ama izlenmeli |
| Sanallaştırma | VMware | Standart VPS |
| Docker | **Kurulu değil** | Adım 1'de kurulacak |
| Çalışan servis | Yalnız temel sistem servisleri | Çakışma yok |
| Açık port | Yalnız 22 | 80/443 açılacak |
| Firewall | `ufw` **kapalı** | Açılacak |
| Ek kullanıcı | Yok — sadece root | Uygulama kullanıcısı açılacak |
| IPv6 | Yok | Yalnız IPv4 |
| SSH | `PermitRootLogin yes`, `PasswordAuthentication yes` | **Kapatılacak** |

**Kaynak sorusu kapandı.** 4 vCPU / 7.8 GB, planlanan yükün rahatça iki katını
kaldırır. Postgres'e cömert `shared_buffers` verilebilir.

**Disk tek darboğaz adayı.** 59 GB; veritabanı + 8 kova + Docker imajları +
yerel yedek aynı bölümü paylaşacak. Yerel yedek tutmayıp doğrudan uzak hedefe
göndermek bu yüzden önemli.

### Acil güvenlik notu

Sunucu şu anda **parola ile root girişine açık** ve internete bakıyor. Taze
Ubuntu'da bu, saatler içinde kaba kuvvet denemesi çeker. Ayrıca çalışan parola
sohbet geçmişinde açığa çıktı. Adım 1 bunu ilk iş olarak kapatır.

## 1. Neden self-hosted Supabase, çıplak Postgres değil

Kodda 785 adet `.from()`, 8 `rpc()` ve 96 gömülü join var. Bunlar Postgres'e
değil PostgREST'e gidiyor. Çıplak Postgres + `pg` kullanmak bu sorguların
tamamını elle SQL'e çevirmek demek — haftalarca sürer ve her biri regresyon
riski taşır.

Supabase açık kaynak ve aynı bileşenler VPS'te çalışır. `SUPABASE_URL`
kendi sunucumuza çevrilir, **uygulama kodunda tek satır değişmez.**

## 2. Envanter — neyin taşınması gerekmiyor

Göçün riskini asıl düşüren şey, Supabase'in çoğu parçasının zaten
kullanılmıyor olması.

| Bileşen | Durum | Sonuç |
|---|---|---|
| Supabase Auth (GoTrue) | Kullanılmıyor — kendi JWT + bcrypt | Konteyner **gereksiz** |
| Supabase Realtime | Kullanılmıyor — kendi Socket.io | Konteyner **gereksiz** |
| Supabase Studio | Yalnız yönetim arayüzü | **Opsiyonel** |
| PostgREST | 785 sorgu buna bağlı | **Zorunlu** |
| Storage API | 14 çağrı, 8 kova | **Zorunlu** |
| Postgres 17 | Canlı veritabanı PostgreSQL 17.6 | **Zorunlu** |
| Redis | BullMQ kuyrukları | **Zorunlu** |

Böylece stack üç Supabase konteynerine iner. RAM ihtiyacı buna göre düşer.

### RLS taşınacak bir mantık değil

`062_veritabani_izin_kurallari.sql` bunu açıkça yazıyor: Projelio Supabase
Auth kullanmadığı için `auth.uid()` bu veritabanında her zaman NULL döner.
RLS her tabloda **açık ama politikasız** — yani varsayılan RED. Amaç, anon
anahtarla doğrudan REST'e ulaşan birinin hiçbir şey görememesi.

Asıl yetki mantığı `backend/src/common/access/access.service.ts` içinde,
uygulama katmanında. Göçte bu kurulum aynen korunur; üstelik PostgREST'i dış
ağa hiç açmayacağımız için bir kat daha eklenir.

## 3. Hedef mimari

```
İnternet
  │
  └─ Caddy :443  (TLS, otomatik Let's Encrypt)
       ├─ projelio.com      → /srv/web/dist  (statik)
       └─ api.projelio.com  → nestjs:3000    (WebSocket dahil)

İç Docker ağı — dışa KAPALI, port yayını yok:
  supabase-gw:8000  ─┬─ /rest/v1/*    → postgrest:3000
                     └─ /storage/v1/* → storage-api:5000
  postgres:5432
  redis:6379
```

`supabase-gw` ince bir Caddy yönlendiricisidir. supabase-js istemcisi
`/rest/v1` ve `/storage/v1` öneklerini beklediği için Kong yerine bunu
koyuyoruz; `SUPABASE_URL=http://supabase-gw:8000` ile kod değişmeden çalışır.

## 4. Üretilecek dosyalar

| Dosya | İçerik |
|---|---|
| `deploy/docker-compose.prod.yml` | postgres, postgrest, storage-api, supabase-gw, redis, api, caddy |
| `deploy/Caddyfile` | Dış TLS + statik + ters vekil |
| `deploy/Caddyfile.gw` | İç `/rest/v1` ve `/storage/v1` yönlendirmesi |
| `deploy/.env.prod.example` | 42 backend anahtarı, değersiz |
| `deploy/postgres.conf` | `shared_buffers` vb. — VPS RAM'ine göre |
| `scripts/vps-goc.sh` | Veri + kova taşıma |
| `scripts/yedek-al.sh` | Güncelleme: uzak hedef + kovalar |
| `docs/vps-kurulum.md` | Adım adım kurulum |

Backend ve web için ayrı `Dockerfile` gerekir; ikisi de çok aşamalı olacak
(build + slim runtime).

## 5. Güvenlik başlıkları — sessizce kaybolabilecek şey

`netlify.toml` dört başlık veriyor, ayrıca `vite.config.ts` build sırasında
CSP'yi `dist/_headers` dosyasına yazıyor. Netlify gidince bu dosyayı okuyan
kimse kalmaz.

Bu yüzden başlıklar Caddyfile'a **elle** taşınacak ve göç sonrası
doğrulanacak. CSP şu an `CSP_ZORLAYICI = false` ile rapor modunda; göç
sırasında bu davranış **aynen korunur**. Zorlayıcıya çevirmek ayrı bir iş —
iki değişikliği karıştırmak, çıkan hatanın hangisinden geldiğini
bulunamaz hâle getirir.

## 6. Adımlar

### Adım 1 — Sunucuyu güvenliğe al — TAMAMLANDI (2026-08-29)

Veri taşımadan önce yapılması gereken sertleştirme uygulandı ve doğrulandı.

| İş | Durum |
|---|---|
| SSH anahtarı (root + `projelio`) | Yüklendi, giriş test edildi |
| Parola girişi | **Kapatıldı** — `PasswordAuthentication no` |
| Root girişi | `prohibit-password` — yalnız anahtarla |
| Uygulama kullanıcısı `projelio` | Açıldı, `docker` grubunda |
| Firewall (`ufw`) | Aktif — yalnız 22, 80, 443 |
| `fail2ban` | Aktif, `sshd` jail çalışıyor (5 deneme / 1 saat ban) |
| Docker 29.7.2 + Compose v5.4.0 | Kuruldu |
| Tailscale 1.102.3 | Kuruldu, **giriş bekliyor** |

**Sızan parola artık işlevsiz.** Dışarıdan test edildi: sunucu yalnız
`publickey` kabul ediyor, parola denemesi reddediliyor.

SSH sertleştirmesi `/etc/ssh/sshd_config.d/99-projelio-hardening.conf`
dosyasında; ana `sshd_config`'e dokunulmadı ki paket güncellemesi ayarları
ezmesin.

#### Tailscale — tamamlandı

Sunucu tailnet'e katıldı: **`100.111.242.24`** (`projelio-vps`).

SSH artık internetten erişilemiyor. `ufw` kuralları:

| Port | Kaynak | Amaç |
|---|---|---|
| 22 | **yalnız `tailscale0`** | Yönetim erişimi |
| 80 | herkes | Caddy — ACME sertifika doğrulaması |
| 443 | herkes | Caddy — HTTPS |

Doğrulandı: tailnet üzerinden SSH çalışıyor, genel IP'den 22 kapalı.

Bağlanma artık şöyle:

```bash
ssh root@100.111.242.24        # veya: ssh root@projelio-vps
```

**Tailscale anahtarı 2027-02-25'te doluyor.** O tarihte yenilenmezse tailnet
erişimi kopar ve 22 dışarıya kapalı olduğu için geriye yalnız sağlayıcı
konsolu kalır. Tailscale yönetim panelinden bu makineye "Disable key expiry"
işaretlenirse sorun tamamen ortadan kalkar — altyapı düğümleri için önerilen
budur.

#### Kurtarma yolu

Tailscale'e bağımlı bir erişim modelinde geri dönüş yolu şart. Sunucuda seri
konsol (`/dev/ttyS0`) mevcut; sağlayıcı panelinden VNC/konsol ile girilip
`ufw allow 22/tcp` çalıştırılarak erişim geri alınabilir.

Reboot dayanıklılığı doğrulandı: `ssh`, `ssh.socket`, `tailscaled`, `ufw`,
`docker` — hepsi `enabled`.

### Adım 2 — Altyapıyı boş kur

Stack PostgreSQL 17 ile ayağa kaldırılır. Canlı şema ile migration geçmişi
önce karşılaştırılır; migration dosyaları tek başına kaynak kabul edilmez.
Sağlık kontrolleri geçilir. Üretim verisi henüz yok.

### Adım 3 — Prova göçü (kesintisiz)

Canlı Supabase'den PostgreSQL 17 istemcisiyle `pg_dump` alınır, VPS'e yüklenir.
2026-08-29 canlı Storage API envanteri **8 kova ve 44 nesne** döndürdü; PDF'deki
9 kova sayısı güncel API ile uyuşmadı. 44 nesnenin tamamı SHA-256 ile doğrulandı.
Uygulama VPS'te ayağa kaldırılıp test edilir. Netlify/Render hâlâ canlıdır —
bu adım kullanıcıyı etkilemez ve gerçek kesinti süresini ölçmemizi sağlar.

### Adım 4 — Gerçek geçiş (kesinti penceresi)

1. Bakım moduna al
2. Son `pg_dump` + kova senkronu (fark kopyası, tam kopya değil)
3. DNS'i VPS'e çevir
4. TLS sertifikası doğrula, duman testi
5. Bakım modundan çık

DNS TTL'i geçişten **24 saat önce** 300 saniyeye düşürülmeli.

### Adım 5 — Göç sonrası

- Yedek cron'u kur ve **geri yüklemeyi bir kez dene** (denenmemiş yedek
  yedek değildir)
- Güvenlik başlıklarını dış istemciden doğrula
- İzleme: disk doluluk, konteyner sağlığı
- Netlify/Render'ı en az bir hafta **silme** — geri dönüş yolu

## 7. Geri dönüş planı

Adım 4'te bir şey ters giderse: DNS eski hedeflere çevrilir. Supabase verisi
salt-okunur olarak korunduğu için kayıp olmaz. Kritik kural: **geçiş
penceresinde iki tarafa birden yazılmamalı** — bakım modu bunun içindir.

## 8. Kazanç ve kayıp

**Kazanç:** aylık maliyet düşer, veri egemenliği, Render soğuk başlangıcı
yok, servisler aynı makinede olduğu için ağ gecikmesi düşer.

**Kayıp — bilerek kabul edilir:**

- Yedekleme, güncelleme, TLS yenileme, izleme artık **bizim sorumluluğumuzda**.
  Supabase'in otomatik yedeği (PITR) gider.
- **Tek arıza noktası.** VPS düşerse her şey düşer. Netlify CDN'i ve Render'ın
  sağlık kontrollü yeniden başlatması gider.
- Web tek sunucudan servis edilir; coğrafi olarak uzak kullanıcılarda yavaşlar.
- Postgres ayarı, disk dolması, OOM gibi sorunlar artık bizim problemimiz.

## 9. Açık sorular

Sunucu özellikleri artık biliniyor (Bölüm 0). Geriye üç soru kaldı ve üçü de
üretilecek dosyaların içeriğini doğrudan belirliyor:

1. **Alan adları.** `projelio.com` + `api.projelio.com` mı, başka mı?
   `Caddyfile`, `CORS_ORIGINS` ve TLS sertifikası buna bağlı. Alan adı yoksa
   IP üzerinden HTTP ile de çalışır, ama TLS olmaz — kalıcı çözüm değildir.
   DNS'in A kaydı `193.111.77.252` adresine yönlendirilmeli.

2. **Yedek hedefi.** VPS'in kendi diski yedek sayılmaz; makine giderse yedek de
   gider. Uzak bir S3/B2/Storage Box hedefi gerekir. Ayrıca 59 GB boş disk,
   yerel yedek biriktirmeye uygun değil.

3. **Kesinti penceresi.** Veri boyutuna göre 15–60 dk. Adım 3 (prova) bunu
   kesin ölçer, o yüzden tarih bağlamadan önce prova yapılmalı.
