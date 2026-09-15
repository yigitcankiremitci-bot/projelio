-- 114_dosya_indirme_linkleri.sql
-- Tek bir dosya için üyelik gerektirmeyen indirme linki.
--
-- NEDEN: bir dosyayı Projelio'da hesabı OLMAYAN birine (müşteri, muhasebeci,
-- tedarikçi) göndermenin tek yolu dosyayı e-postaya eklemekti. Bu hem boyut
-- sınırına takılıyor hem de gönderildikten sonra geri alınamıyor: yanlış kişiye
-- giden ek sonsuza kadar onda kalıyor. Link ise kapatılabilir, indirmesi
-- kısılabilir ve kim indirdiğinde haber verir.
--
-- 073'teki proje paylaşım linkleriyle AYNI MODEL, ayrı tablo: orada paylaşılan
-- şey bir projenin görünümü, burada tek bir dosyanın İÇERİĞİ. Sütunların bir
-- kısmı benzese de kurallar farklı (indirme anahtarı, indirme sayacı,
-- bildirim tercihi) ve tek tabloda birleştirmek ikisini de bulanıklaştırırdı.
--
-- LİNK BİR YETKİ DEĞİL, BİR PENCEREDİR (073'ün kuralı burada da geçerli):
-- token'ı bilen kişi YALNIZCA bu dosyayı görür; dosyanın klasörü, işi, diğer
-- dosyalar ve Projelio'nun hiçbir ucu ona açılmaz.

create table if not exists file_download_links (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references files(id) on delete cascade,

  -- Linkteki gizli dizi: 32 karakterlik base64url (192 bit rastgelelik).
  -- Tek koruma katmanı bu; loglara ve hata mesajlarına yazılmamalı.
  token varchar(64) not null unique,

  -- "Bu linki kime verdim?" — yalnızca sahibinin listesinde görünür.
  label varchar(120),

  -- E-posta kapısı (bkz. 077). Doluysa sayfa açılmadan önce adres sorulur.
  -- KİMLİK DOĞRULAMASI DEĞİL: adresi bilen geçer. Kazayla iletilmeye karşı.
  recipient_email varchar(160),

  -- İndirme anahtarı. Kapalıyken sayfa açılır ve ÖNİZLEME çalışır ama içerik
  -- indirilemez. Ayrı bir anahtar olmasının sebebi: "linki gönderdim, baksın
  -- ama kopyasını almasın" ile "linki tamamen kapat" farklı kararlar; ikincisi
  -- için zaten revoked_at var.
  download_enabled boolean not null default true,

  -- İndirildiğinde linki oluşturana e-posta + uygulama içi bildirim gider.
  -- Varsayılan AÇIK: paylaşımın karşılığını görmek, özelliğin asıl değeri.
  notify_on_download boolean not null default true,

  -- Boşsa süresiz. Süresi dolmuş link kapalı sayılır.
  expires_at timestamp,
  -- Sahibi linki kaldırdığında dolar. Satır SİLİNMEZ: "bu dosyayı kime
  -- vermiştim, kaç kez indirildi, ne zaman kapattım" sorusu sonradan da
  -- cevaplanabilsin.
  revoked_at timestamp,

  -- Sayaçlar. Ziyaretçi kimliği (IP, tarayıcı, ad) TUTULMAZ: linki açan kişi
  -- Projelio kullanıcısı değil ve onun hakkında veri biriktirmenin gerekçesi yok.
  view_count integer not null default 0,
  last_viewed_at timestamp,
  download_count integer not null default 0,
  last_downloaded_at timestamp,

  -- Linkin içeriğe erişimi, onu OLUŞTURANIN erişimidir: dosya buluttan bu
  -- kullanıcının jetonuyla çekilir. Bu yüzden kullanıcı silinince satır da
  -- gider (set null DEĞİL, cascade): sahipsiz bir link, kimin adına açılacağı
  -- belli olmayan bir indirme kapısı olurdu.
  created_by uuid not null references users(id) on delete cascade,
  created_at timestamp not null default current_timestamp
);

comment on table public.file_download_links is
  'Uyelik gerektirmeyen tek dosyalik indirme linkleri. Token biliniyorsa erisim var; icerik linki olusturanin bulut erisimiyle cekilir.';
comment on column public.file_download_links.token is
  'Linkteki gizli dizi. Tahmin edilemezligi tek guvenlik katmani; loglara yazilmamali.';
comment on column public.file_download_links.download_enabled is
  'Kapaliyken onizleme calisir, indirme reddedilir. Linki tamamen kapatmak icin revoked_at kullanilir.';

-- Sahibin "bu dosyanın linkleri" listesi.
create index if not exists idx_file_download_links_file
  on file_download_links(file_id, created_at desc);

-- "Benim oluşturduğum linkler" — yönetim uçları yalnızca kendi satırlarını okur.
create index if not exists idx_file_download_links_creator
  on file_download_links(created_by, created_at desc);

alter table file_download_links enable row level security;
