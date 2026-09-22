-- 127: Veritabanı saat dilimi UTC'ye dönüyor + kaymış zaman damgalarının onarımı
--
-- NEDEN: Kodun tamamı "timestamp without time zone sütunlarında UTC durur"
-- varsayımıyla yazıldı (Supabase UTC çalışıyordu; backend konteyneri de UTC).
-- VPS'e geçişte (2026-08-30, deploy/docker-compose.prod.yml) Postgres'e
-- `-c timezone=Europe/Istanbul` verildi. O günden beri veritabanının KENDİ
-- doldurduğu her değer (`default now()`, `current_timestamp`) İstanbul duvar
-- saatiyle yazıldı, uygulamanın yazdıkları ise UTC kaldı. Aynı sütunda iki
-- farklı anlam: oluşturulma zamanları 3 saat ileride görünüyordu, sosyal
-- medyada 18:00'e planlanan gönderi 21:00 okunuyordu.
--
-- NE YAPIYOR:
--   1. Veritabanının saat dilimi UTC (compose'daki bayrak da aynı commit'te
--      değişti; bu satır o bayrağa rağmen geçerli olsun diye veritabanı
--      düzeyinde — ALTER DATABASE ayarı sunucu varsayılanını ezer).
--   2. Serbest çalışan demosu — bkz. aşağıdaki madde (sıra kodda önemli).
--   3. Yalnızca VERİTABANININ yazdığı sütunlar onarılıyor: created_at,
--      assigned_at, viewed_at. Backend bu üçüne hiç elle yazmıyor, yani eşikten
--      sonraki her değeri İstanbul saatidir. updated_at, joined_at gibi
--      sütunlara uygulama da (UTC) yazıyor; hangi satırın hangisi olduğu
--      bilinemediği için bilerek dokunulmadı — 3 haftalık veride 3 saatlik
--      sapma kalabilir.
--   Serbest çalışan demosu (migration 124, `ce11f` aralığı) now() ve
--      "18:00" gibi İstanbul saatiyle kuruldu; o satırların AN sütunları da
--      düzeltiliyor. Yaptım saatleri ve son tarihler duvar saatidir, dokunulmaz.
--   4. Demo anlık görüntüsü (demo_anlik_goruntu) aynı kurallarla onarılıyor —
--      yoksa ilk demo girişindeki sıfırlama eski değerleri geri yazardı.
--
-- EŞİK: Supabase'in son yazdığı değer 2026-08-30 10:22 (UTC), VPS'in ilk
-- yazdığı 16:11 (İstanbul) — geçiş ~10:53 UTC. Aradaki boşlukta, 13:00'te bir
-- eşik iki dönemi kesin ayırıyor: eşikten önceki değerler UTC, sonrakiler
-- İstanbul.
--
-- GERİ ALINABİLİR: değişen her değerin eskisi saat_onarimi_127'de, anlık
-- görüntünün eski hâli saat_onarimi_127_goruntu'da duruyor.
--
-- UYGULADIKTAN SONRA: PostgREST'i yeniden başlat (docker restart
-- projelio-postgrest). Açık bağlantılar eski saat dilimiyle kalır; yeni ayar
-- ancak yeni bağlantıya uygulanır.

create table if not exists saat_onarimi_127 (
  tablo text not null,
  sutun text not null,
  satir_id text,
  eski text,
  alindi_at timestamptz not null default now()
);

create table if not exists saat_onarimi_127_goruntu as
  select tablo, satirlar from demo_anlik_goruntu;

-- Onarım satırları güncelliyor; updated_at tetikleyicileri, bildirim ve
-- gerçek zamanlı yayın tetikleyicileri bu işlemde ÇALIŞMAMALI.
set local session_replication_role = replica;

-- Anlık görüntüdeki bir satırı aynı kurallarla onarır.
create function pg_temp.geri_al(v text) returns text language sql immutable as $f$
  select to_char(v::timestamp - interval '3 hours', 'YYYY-MM-DD"T"HH24:MI:SS.US')
$f$;

do $$
declare
  esik constant timestamp := '2026-08-30 13:00:00';
  demo_alt constant uuid := 'ce11f000-0000-0000-0000-000000000000';
  demo_ust constant uuid := 'ce11ffff-ffff-ffff-ffff-ffffffffffff';
  r record;
  kosul text;
begin
  -- 1 ─────────────────────────────────────────────── Saat dilimi
  execute format('alter database %I set timezone to %L', current_database(), 'UTC');

  -- 2 ──────────────────────────────── Serbest çalışan demosu (migration 124)
  -- 3. adımdan ÖNCE koşmak zorunda. created_at'in burada yalnızca eşik ÖNCESİ
  -- (ör. "now() - 110 days") ele alınıyor, eşik sonrası 3. adımda. Sıra ters
  -- olsaydı 3. adımın geri çektiği değerler eşiğin altına düşüp burada İKİNCİ
  -- kez kayabilirdi.
  for r in
    select c.table_name::text as tablo, c.column_name::text as sutun
      from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
       and c.data_type = 'timestamp without time zone'
       and ((c.table_name::text, c.column_name::text) in (values
              ('tasks', 'completed_at'),
              ('social_posts', 'scheduled_at'),
              ('social_posts', 'published_at'),
              ('social_post_targets', 'publish_at'),
              ('social_post_targets', 'published_at'),
              ('personal_todos', 'completed_at'),
              ('plan_time_blocks', 'completed_at'),
              ('work_log_entries', 'linked_at'))
            or c.column_name = 'created_at')
       and exists (select 1 from information_schema.columns i
                    where i.table_schema = 'public' and i.table_name = c.table_name
                      and i.column_name = 'id' and i.data_type = 'uuid')
  loop
    kosul := format('id between %L and %L and %I is not null', demo_alt, demo_ust, r.sutun);
    if r.sutun = 'created_at' then kosul := kosul || format(' and created_at < %L', esik); end if;
    execute format(
      'insert into saat_onarimi_127 (tablo, sutun, satir_id, eski) select %L, %L, id::text, %I::text from public.%I where %s',
      r.tablo, r.sutun, r.sutun, r.tablo, kosul);
    execute format('update public.%I set %I = %I - interval ''3 hours'' where %s',
      r.tablo, r.sutun, r.sutun, kosul);
  end loop;

  -- 3 ─────────────────────────────────────── Veritabanının yazdığı sütunlar
  for r in
    select c.table_name::text as tablo, c.column_name::text as sutun,
           exists (select 1 from information_schema.columns i
                    where i.table_schema = 'public' and i.table_name = c.table_name and i.column_name = 'id') as id_var
      from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
       and c.data_type = 'timestamp without time zone'
       and c.column_name in ('created_at', 'assigned_at', 'viewed_at')
       and c.table_name not like 'saat_onarimi_127%'
  loop
    execute format(
      'insert into saat_onarimi_127 (tablo, sutun, satir_id, eski) select %L, %L, %s, %I::text from public.%I where %I >= %L',
      r.tablo, r.sutun, case when r.id_var then 'id::text' else 'null' end, r.sutun, r.tablo, r.sutun, esik);
    execute format('update public.%I set %I = %I - interval ''3 hours'' where %I >= %L',
      r.tablo, r.sutun, r.sutun, r.sutun, esik);
  end loop;
end $$;

-- 4 ───────────────────────────────────────────────── Demo anlık görüntüsü
-- Yalnızca o tabloda GERÇEKTEN saat dilimsiz olan sütunlara dokunulur: aynı
-- adlı sütun başka tabloda timestamptz olabilir, onun metni ofset taşır.
create function pg_temp.satiri_onar(p_tablo text, p_satir jsonb) returns jsonb language plpgsql as $f$
declare
  esik constant timestamp := '2026-08-30 13:00:00';
  sonuc jsonb := p_satir;
  anahtar text;
  v text;
  demo boolean;
begin
  if jsonb_typeof(p_satir) <> 'object' then return p_satir; end if;
  demo := coalesce(p_satir->>'id' between 'ce11f000-0000-0000-0000-000000000000'
                                     and 'ce11ffff-ffff-ffff-ffff-ffffffffffff', false);
  for anahtar in
    select column_name::text from information_schema.columns
     where table_schema = 'public' and table_name = p_tablo
       and data_type = 'timestamp without time zone'
  loop
    v := sonuc->>anahtar;
    continue when v is null or v ~ '(Z|[+-]\d\d:?\d\d)$';
    if anahtar in ('created_at', 'assigned_at', 'viewed_at') and v::timestamp >= esik then
      sonuc := jsonb_set(sonuc, array[anahtar], to_jsonb(pg_temp.geri_al(v)));
    elsif demo and (anahtar = 'created_at'
                    or (p_tablo, anahtar) in (values
                          ('tasks', 'completed_at'),
                          ('social_posts', 'scheduled_at'),
                          ('social_posts', 'published_at'),
                          ('social_post_targets', 'publish_at'),
                          ('social_post_targets', 'published_at'),
                          ('personal_todos', 'completed_at'),
                          ('plan_time_blocks', 'completed_at'),
                          ('work_log_entries', 'linked_at'))) then
      sonuc := jsonb_set(sonuc, array[anahtar], to_jsonb(pg_temp.geri_al(v)));
    end if;
  end loop;
  return sonuc;
end $f$;

update demo_anlik_goruntu g
   set satirlar = (select coalesce(jsonb_agg(pg_temp.satiri_onar(g.tablo, x.e) order by x.i), '[]'::jsonb)
                     from jsonb_array_elements(g.satirlar) with ordinality as x(e, i))
 where jsonb_typeof(g.satirlar) = 'array';
