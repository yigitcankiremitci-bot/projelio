-- 121_cok_dosyali_indirme_linkleri.sql
-- Tek bağlantıda BİRDEN FAZLA dosya (bkz. 114).
--
-- NEDEN: muhasebeciye ayın on faturasını göndermek, on ayrı bağlantı üretip on
-- ayrı e-posta atmak demekti. Karşı taraf on mesajın hangisinin eksik olduğunu
-- bulmaya çalışıyor, gönderen de on bağlantıyı tek tek kapatmak zorunda kalıyordu.
--
-- MODEL: bağlantının kendisi (token, kapı, indirme anahtarı, süre, sayaçlar)
-- 114'teki satır olarak kalıyor — kurallar dosya başına değil BAĞLANTI başına.
-- Bu tablo yalnızca "bu bağlantı hangi dosyaları açıyor" listesini tutuyor.
--
-- GERİYE UYUM: tek dosyalık bağlantıların bu tabloda HİÇ satırı yok; dosyası
-- file_download_links.file_id'de. Çok dosyalı bağlantıda ise TÜM dosyalar
-- (ilki dahil) burada, file_id de listenin ilk dosyası. Eski satırları
-- taşımamak bilinçli: 114'ün kodu hiç değişmeden çalışmaya devam ediyor.
--
-- DOSYA SİLİNİRSE: bu tablodaki satırı gider, bağlantı kalan dosyalarla açık
-- kalır. İLK dosya silinirse file_id'nin cascade'i bağlantıyı da götürür
-- (114'ün kuralı) — "bir dosyası kaybolan paket" ile "bağlantının kendisi
-- kayboldu" arasındaki fark alıcı açısından önemsiz, kural değiştirmeye değmez.

alter table file_download_links
  add column if not exists file_count integer not null default 1;

comment on column public.file_download_links.file_count is
  'Baglantidaki dosya sayisi. 1 ise dosya file_id; 1den buyukse tum dosyalar file_download_link_files tablosunda.';

create table if not exists file_download_link_files (
  link_id uuid not null references file_download_links(id) on delete cascade,
  file_id uuid not null references files(id) on delete cascade,
  -- Alıcının sayfasındaki sıra = gönderenin seçtiği sıra.
  position integer not null default 0,
  primary key (link_id, file_id)
);

comment on table public.file_download_link_files is
  'Cok dosyali indirme baglantilarinin dosya listesi. Tek dosyali baglantilarin burada satiri yok.';

-- Bir dosyanın penceresinde "bu dosyayı içeren paket bağlantıları" listesi.
create index if not exists idx_file_download_link_files_file
  on file_download_link_files(file_id);

alter table file_download_link_files enable row level security;
