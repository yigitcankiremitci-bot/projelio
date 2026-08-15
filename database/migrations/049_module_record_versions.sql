-- 049_module_record_versions.sql
-- A1 (Form / Doküman) motoru: tek kayıt + taslak + sürüm geçmişi.
--
-- SORUN:
--   Vizyon ve Misyon modülleri bugün liste motoruyla çalışıyor: her güncelleme
--   module_records'a YENİ BİR SATIR ekliyor ve satır sayısı "Sürüm" diye
--   gösteriliyor. Bu üç şeyi yapamıyor:
--     1. Hangi metnin yürürlükte olduğunu söyleyemiyor (en yenisi mi? onaylı
--        olan mı? ikisi farklıysa?).
--     2. Taslak ile onaylıyı ayıramıyor — biri metni düzeltmeye başladığında
--        yarım cümle herkese görünüyor.
--     3. İki sürüm arasında ne değiştiğini gösteremiyor.
--
-- ÇÖZÜM:
--   Yürürlükteki metin her zaman module_records.data'dadır (okuma yolu tek
--   sorgu kalsın diye). Yürürlükten DÜŞEN metinler module_record_versions'a
--   taşınır. Onaylanmamış değişiklikler ayrı bir kolonda (draft_data) bekler.
--
--   Yani: data = yayında olan, draft_data = üzerinde çalışılan,
--   module_record_versions = geçmişte kalan.
--
-- KAPSAM (scope_ref):
--   A1'in kuralı "kapsam başına tek kayıt". Kapsam çoğu modülde organizasyonun
--   kendisidir (kimlik_ve_yon: bir şirketin bir vizyonu olur), ama bazı
--   modüllerde bir varlıktır (pd_urun_stratejileri: her ürün için bir strateji
--   dokümanı). scope_ref bu ikinci durumu adresler; null = organizasyon kapsamı.
--
-- Yetkilendirme deseni: RLS açık, policy yok (yetki NestJS'te, service_role ile) —
-- module_records ile aynı.
--
-- Bkz. docs/moduller/20-motor-a1-form.md ve 12-modul-kimlik_ve_yon.md

-- ============================================== 1. module_records ek kolonlar

alter table public.module_records
  add column if not exists draft_data jsonb,
  add column if not exists scope_ref  uuid,
  add column if not exists updated_at timestamp;

comment on column public.module_records.draft_data is
  'A1: onaylanmamis degisiklikler. Bos ise taslak yok. Okuma gorunumu daima data alanini gosterir.';
comment on column public.module_records.scope_ref is
  'A1: tek kayit kisitinin kapsami (orn. products.id). Null = organizasyon/is kapsami.';

-- Mevcut satırlarda updated_at boş kalmasın; created_at ile başlatılır.
update public.module_records
   set updated_at = created_at
 where updated_at is null;

-- ============================================== 2. Sürüm tablosu

create table if not exists public.module_record_versions (
  id           uuid primary key default gen_random_uuid(),
  record_id    uuid not null references public.module_records(id) on delete cascade,

  -- Yürürlükten düşen metnin tamamı. Alan bazlı diff okuma anında hesaplanır;
  -- burada tam kopya durur ki şema değişse bile eski sürüm okunabilsin.
  data         jsonb not null,

  approved_by  uuid references public.users(id) on delete set null,
  approved_at  timestamp not null default current_timestamp,

  -- "Neyi neden değiştirdik" — opsiyonel, kullanıcı yazarsa sürüm listesinde görünür.
  note         varchar
);

comment on table public.module_record_versions is
  'A1 (form) modullerinde yururlukten dusen metinlerin arsivi. Yururlukteki metin module_records.data icindedir.';

create index if not exists module_record_versions_record_idx
  on public.module_record_versions(record_id, approved_at desc);

alter table public.module_record_versions enable row level security;

-- ============================================== 3. Tek kayıt kısıtı
--
-- ÖNEMLİ: bu indeks veri temizlendikten SONRA eklenmelidir. Bugün vizyon ve
-- misyon modüllerinde aynı organizasyonda birden çok satır var (her güncelleme
-- yeni satır açtığı için). Bu yüzden kısıt burada yalnızca A1 modülleri için
-- ve yalnızca birleştirme migration'ı (050) çalıştıktan sonra kurulur.
--
-- Burada tanımı bırakıyoruz, 050'de devreye alınacak:
--
--   create unique index module_records_single_row_idx
--     on public.module_records (
--       coalesce(organization_id, job_id),
--       module_key,
--       coalesce(scope_ref, '00000000-0000-0000-0000-000000000000'::uuid)
--     )
--     where archived_at is null and module_key in ('kimlik_ve_yon', 'pd_urun_stratejileri');

-- ============================================== 4. Katalog: yeni A1 modülü
--
-- kimlik_ve_yon, vizyon + misyon birleşimidir. Eski iki kayıt 050'de
-- pasifleştirilecek; burada yalnızca yeni kayıt açılıyor ki 050 veriyi
-- taşıyacak hedefi hazır bulsun.

insert into public.module_catalog
  (key, department_key, name, description, scope, applies_to_freelancer, sort_order)
values
  ('kimlik_ve_yon', 'yonetim', 'Kimlik ve Yön',
   'Şirketin ne için var olduğunu ve nereye gittiğini tek sayfada tutar; hedefler, işe alım ve müşteri iletişimi aynı cümleye dayanır.',
   'organization', true, 5)
on conflict (key) do nothing;

insert into public.module_catalog_departments (module_key, department_key, is_primary, sort_order)
values ('kimlik_ve_yon', 'yonetim', true, 5)
on conflict (module_key, department_key) do nothing;
