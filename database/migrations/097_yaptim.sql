-- 097 — Yaptım: kişisel iş günlüğü
--
-- NE İŞE YARAR:
--   Gün içinde yapılan iş çoğu zaman bir görev kartının karşılığı DEĞİL. Telefon
--   çalıyor, bir toplantı uzuyor, plan dışı bir düzeltme yapılıyor. Bunları
--   sisteme girmenin tek yolu "önce doğru görevi bulmak"tı: kullanıcı yüzlerce
--   kart arasında hangisiydi diye ararken vazgeçiyor ve yapılan iş hiçbir yere
--   yazılmıyordu.
--
--   Yaptım bu sırayı TERSİNE çevirir: önce yapılan iş yazılır (başlık + süre),
--   nereye ait olduğu SONRA — hiç seçilmese bile kayıt durur.
--
-- KİŞİSELDİR:
--   personal_todos ile aynı gizlilik sınıfı. Kayıt yalnızca sahibinindir; bu
--   tabloyu okuyan her yeni kod yolu (rapor, bildirim, dışa aktarma, AI bağlamı)
--   ayrıca gözden geçirilmelidir. RLS açık, policy yok — erişim yalnızca
--   backend'in service_role bağlantısından, izolasyon WorklogService'in
--   sorumluluğunda (bkz. o dosyanın başındaki güvenlik notu).
--
-- HEDEF NEDEN POLİMORFİK (target_kind + target_id):
--   file_links'teki (migration 095) gerekçenin aynısı. Sekiz hedef türünün tek
--   bir davranışı var: "bağla, göster, kopar". Sekiz nullable FK kolonu yerine
--   iki kolon. Bedeli referans bütünlüğünü FK ile kuramamak: hedef silinince
--   bağlantı ARTIKTA KALIR. Bu yüzden `target_label` var — hedefin adı bağlama
--   ANINDA kopyalanıyor, silinmiş bir projenin kaydı "Yaz kampanyası (silinmiş)"
--   diye okunabiliyor. Etiketsiz saklasaydık geriye anlamsız bir uuid kalırdı.
--
-- SÜRE NEDEN NULLABLE:
--   "Ne yaptım" ile "ne kadar sürdü" aynı anda bilinmiyor. Süreyi zorunlu yapmak,
--   kaydı hiç girmemeye yol açardı — kaydın kendisi süreden değerli.

create table if not exists public.work_log_entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  title         varchar(255) not null,
  note          text,
  -- İşin YAPILDIĞI an; created_at ise KAYDEDİLDİĞİ an. İkisi bilerek ayrı:
  -- kullanıcı akşam oturup sabahki işi giriyor ve gün dökümü done_at'e göre.
  done_at       timestamp not null default current_timestamp,
  duration_minutes integer,
  -- Kronometre çalışıyorsa dolu. Durdurulduğunda geçen süre duration_minutes'a
  -- eklenip bu alan boşaltılır — yani "çalışan kayıt" ayrı bir tablo değil,
  -- yalnızca bu alanı dolu olan satır.
  timer_started_at timestamp,
  source        varchar(20) not null default 'manual',
  target_kind   varchar(20),
  target_id     uuid,
  target_label  text,
  linked_at     timestamp,
  archived_at   timestamp,
  created_at    timestamp not null default current_timestamp,
  updated_at    timestamp not null default current_timestamp,

  constraint work_log_entries_title_not_blank
    check (length(btrim(title)) > 0),
  constraint work_log_entries_source_check
    check (source in ('manual','lio','whatsapp')),
  constraint work_log_entries_target_kind_check
    check (target_kind is null or target_kind in
      ('task','project','job','department','operation','output','module_record','budget','personal_todo')),
  -- Tür ve id ayrılamaz: türü olup id'si olmayan bir bağlantı hiçbir şeye
  -- işaret etmez, id'si olup türü olmayanı ise hangi tabloda arayacağımızı
  -- bilemeyiz. İkisi birlikte dolu ya da birlikte boş.
  constraint work_log_entries_hedef_cifti
    check (num_nonnulls(target_kind, target_id) <> 1),
  -- Üst sınır 24 saat: tek bir kaydın bir günden uzun sürmesi neredeyse her
  -- zaman bir giriş hatası (dakika yerine saniye yazmak gibi).
  constraint work_log_entries_duration_range
    check (duration_minutes is null or (duration_minutes > 0 and duration_minutes <= 1440))
);

comment on table public.work_log_entries is
  'Yaptim: kullanicinin kisisel is gunlugu. Yalnizca sahibi gorur; personal_todos ile ayni gizlilik sinifi.';
comment on column public.work_log_entries.done_at is
  'Isin YAPILDIGI an. Kaydin girildigi an created_at.';
comment on column public.work_log_entries.timer_started_at is
  'Dolu ise kronometre calisiyor. Durunca gecen sure duration_minutes''a eklenir ve bu alan bosalir.';
comment on column public.work_log_entries.target_kind is
  'task | project | job | department | operation | output | module_record | budget | personal_todo. Polimorfik: hedef tablolara FK YOK.';
comment on column public.work_log_entries.target_label is
  'Hedefin baglama anindaki adi. Hedef silinirse geriye okunabilir bir sey kalsin diye kopyalanir.';

-- Sayfanın tek sorgusu: "benim kayıtlarım, yeniden eskiye".
create index if not exists idx_work_log_entries_gun
  on public.work_log_entries (user_id, done_at desc)
  where archived_at is null;

-- "Henüz bir yere bağlamadıklarım" — sayfanın en önemli ikinci görünümü,
-- kullanıcının gün sonunda üzerinden geçtiği liste.
create index if not exists idx_work_log_entries_bagsiz
  on public.work_log_entries (user_id, done_at desc)
  where archived_at is null and target_kind is null;

-- Kronometre aynı anda yalnızca BİR kayıtta çalışabilir. İki kronometre,
-- kullanıcının hangi işi ölçtüğünü bilmemesi ve iki kaydın da yanlış süre
-- alması demekti. Kural veritabanında: uygulama katmanındaki bir kontrol,
-- iki sekmeden aynı anda başlatınca yarışa açık kalırdı.
create unique index if not exists work_log_entries_tek_kronometre
  on public.work_log_entries (user_id)
  where timer_started_at is not null and archived_at is null;

drop trigger if exists trg_work_log_entries_updated_at on public.work_log_entries;
create trigger trg_work_log_entries_updated_at
  before update on public.work_log_entries
  for each row execute function public.set_updated_at();

-- RLS: proje genelindeki desen — açık ama policy yok. Erişim yalnızca
-- service_role ile, yani yalnızca WorklogService üzerinden.
alter table public.work_log_entries enable row level security;
revoke all on public.work_log_entries from anon, authenticated;
