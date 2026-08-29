-- Demo hesabının "ilk hâli" artık depodaki dosyada değil, veritabanında.
--
-- NEDEN: `ceo@celikhan.test` herkese açık bir demo ve her girişte verisi ilk
-- hâline döndürülüyor (bkz. backend/src/modules/demo/demo-sifirlama.service.ts).
-- O "ilk hâl" bugüne kadar depodaki database/demo/celikhan-demo.json'du; bu da
-- demoyu her güzelleştirmenin ardından commit + yeniden dağıtım gerektiriyordu.
-- Sahibi demoyu panelden düzenleyip "kaydet" diyebilsin diye ilk hâl buraya,
-- çalışma zamanında yazılabilen bir yere taşındı. Depodaki dosya FABRİKA
-- AYARI olarak duruyor: bu tablo boşsa ondan yükleniyor.

create table if not exists demo_anlik_goruntu (
  -- Tablo adı (ör. "tasks"). Her satır o tablonun demo kapsamındaki TÜM
  -- satırlarını taşır; 25 tablo = 25 satır, yani tablo küçük kalır.
  tablo text primary key,

  -- Geri yükleme sırası. Yabancı anahtarlar yüzünden şart: önce kullanıcılar
  -- ve şirket, sonra onlara bağlı kayıtlar.
  sira integer not null,

  satirlar jsonb not null,
  alindi_at timestamp with time zone not null default now()
);

comment on table demo_anlik_goruntu is
  'Demo hesabinin geri yuklenecek ilk hali. Admin panelindeki "demo duzenleme kipi" kapatilinca yenilenir.';

-- Sahibin demoyu elle düzenlediği aralığı ve benzeri kısa ömürlü durumları
-- tutar. Ayrı bir tablo: anlık görüntü satırlarıyla karışmasın, oradaki
-- "her satır bir tablo" sözleşmesi bozulmasın.
create table if not exists demo_durum (
  anahtar text primary key,
  deger jsonb not null,
  guncellendi_at timestamp with time zone not null default now()
);

comment on table demo_durum is
  'Demo icin kisa omurlu durum bayraklari. Su an tek anahtar: duzenleme_kipi.';

-- Bu tablolara yalnızca backend (service role) dokunuyor; anon anahtarla
-- gelen hiçbir isteğin görmemesi için varsayılan RED (bkz. 062).
alter table demo_anlik_goruntu enable row level security;
alter table demo_durum enable row level security;
