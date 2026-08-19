-- 062_veritabani_izin_kurallari.sql
--
-- Veritabanı erişim kurallarını AÇIKÇA yazar ve kalıcı hâle getirir.
--
-- ============================================================================
-- MİMARİ: NEDEN auth.uid() TABANLI RLS POLİTİKASI YOK?
-- ============================================================================
-- Projelio, Supabase Auth KULLANMAZ. Kimlik doğrulama tamamen uygulama
-- katmanındadır: kendi `public.users` tablosu, bcrypt parola, kendi imzaladığı
-- JWT (JWT_SECRET). Bir istemci hiçbir zaman Supabase'e doğrudan bağlanmaz —
-- tüm veri erişimi NestJS backend'i üzerinden geçer ve backend Supabase'e
-- SERVICE ROLE anahtarıyla bağlanır.
--
-- Bunun iki sonucu var:
--
--   1) `auth.uid()` bu veritabanında HER ZAMAN NULL döner. Ona dayanan bir
--      politika yazmak işe yaramaz; daha kötüsü, "RLS'imiz var" hissi verip
--      gerçekte hiçbir şey korumaz. Bu yüzden bilerek yazılmamıştır.
--
--   2) Satır bazlı yetkilendirmenin GERÇEK yeri uygulama katmanıdır:
--      backend/src/common/access/access.service.ts. Kimin hangi projeyi
--      görebileceği orada belirlenir ve scripts/test-security-fixes.sh ile
--      test edilir.
--
-- Öyleyse bu dosyanın işi ne? Şu soruyu kapatmak: "Birisi herkese açık
-- publishable (anon) anahtarı alıp Supabase'in REST API'sine doğrudan giderse
-- ne olur?" Cevabın kalıcı olarak "hiçbir şey" olması gerekir. Aşağıdaki iki
-- katman bunu sağlar:
--
--   Katman 1 — RLS: her tabloda açık, HİÇBİR politika yok => varsayılan RED.
--   Katman 2 — GRANT: anon/authenticated rollerinin yetkileri geri alınır.
--
-- Tek katman yeterli değil çünkü ikisi de tek başına geri alınabilir: biri
-- ileride yanlışlıkla bir politika eklerse Katman 2 hâlâ tutar; biri yetkiyi
-- geri verirse Katman 1 hâlâ tutar.
--
-- Bu dosya IDEMPOTENT'tir: tekrar tekrar çalıştırılabilir.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) Her tabloda RLS açık olsun
-- ----------------------------------------------------------------------------
-- Tablolar zaman içinde farklı migration'larda oluşturuldu ve RLS her seferinde
-- elle açıldı; unutulan bir tablo sessiz bir açık demek. Burada tek seferde ve
-- veri tabanının o anki gerçek hâline bakarak hepsi kapsanır.
--
-- FORCE ROW LEVEL SECURITY BİLEREK KULLANILMIYOR: FORCE, RLS'i tablo SAHİBİNE
-- (postgres) de uygular. Şemada postgres'e ait SECURITY DEFINER tetikleyiciler
-- var (trg_operations_status_change, materialize_operation_routine,
-- personal_board_reorder ...). Politika olmayan bir tabloda FORCE açılırsa bu
-- fonksiyonlar kendi tablolarını okuyamaz ve uygulama bozulur. Backend zaten
-- BYPASSRLS yetkisine sahip service_role ile bağlandığı için FORCE bir koruma
-- da eklemezdi.
do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not c.relrowsecurity
  loop
    execute format('alter table public.%I enable row level security', t.relname);
    raise notice 'RLS acildi: %', t.relname;
  end loop;
end $$;


-- ----------------------------------------------------------------------------
-- 2) anon ve authenticated rollerinin yetkilerini geri al
-- ----------------------------------------------------------------------------
-- Supabase yeni projelerde bu iki role public şemadaki her şey üzerinde geniş
-- yetki verir (SELECT/INSERT/UPDATE/DELETE/TRUNCATE...). Şu an RLS bu yetkileri
-- etkisiz kılıyor, ama yetkinin durması gereksiz bir risk: RLS bir kez
-- gevşetildiğinde yetki anında canlanır.
--
-- service_role'a DOKUNULMUYOR — backend onunla bağlanır.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- Şema düzeyi yetki. Aşağıdaki iki satır SAVUNMA AMAÇLIDIR ve bugün pratikte
-- bir şey değiştirmez — nedeni bilinsin diye yazıyorum, çünkü uygulandıktan
-- sonra ölçüldüğünde "anon hâlâ şemaya erişebiliyor" görünür ve bu bir hata
-- sanılabilir:
--
--   public şemasının ACL'i `=U/pg_database_owner` içerir; yani USAGE yetkisi
--   doğrudan anon'a değil, herkesi kapsayan PUBLIC sözde-rolüne verilmiştir.
--   Bir rolden, PUBLIC üzerinden gelen yetkiyi tek tek geri alamazsınız.
--
-- Peki neden PUBLIC'ten geri almıyoruz? `revoke usage on schema public from
-- public` çok geniş bir darbe olurdu: postgres ve service_role'un kendi açık
-- USAGE kayıtları var, onlar hayatta kalır, ama uzantılar, pg_cron işleri ve
-- Supabase'in kendi iç rolleri bu yetkiyi PUBLIC üzerinden alıyor olabilir.
-- Kazanç sıfıra yakın: anon şemayı görebilse bile içindeki HİÇBİR tabloya
-- yetkisi kalmadı (yukarıdaki revoke'lar) ve RLS de ayrıca reddediyor.
-- Ölçüldü: anon rolüyle 78 tablo/görünümün tamamı denendi, hiçbiri veri
-- döndürmedi. Asıl kapı tablo düzeyindeki yetki, şema düzeyindeki değil.
revoke usage  on schema public from anon, authenticated;
revoke create on schema public from anon, authenticated;


-- ----------------------------------------------------------------------------
-- 3) BUNDAN SONRA oluşturulacak nesneler de aynı kurala tabi olsun
-- ----------------------------------------------------------------------------
-- Yukarıdaki REVOKE yalnızca ŞU ANKİ nesneleri kapsar. Varsayılan yetkiler
-- değiştirilmezse yarın eklenecek bir tablo yeniden anon'a açık doğar.
--
-- Supabase bu varsayılanları `postgres` ve `supabase_admin` rolleri adına
-- tanımlar; migration'ı kim çalıştırırsa çalıştırsın etkili olması için ikisi
-- de ayrı ayrı ele alınır. Rol yoksa hata vermeden geçilir.
-- DİKKAT: bir rolün varsayılan yetkilerini değiştirmek için o rolün ÜYESİ olmak
-- gerekir. Migration postgres olarak çalışır ve postgres, supabase_admin üyesi
-- DEĞİLDİR — o rol için "permission denied to change default privileges" hatası
-- alınır. Bu beklenen bir durumdur ve migration'ı ÇÖKERTMEMELİDİR: tabloları
-- zaten postgres oluşturuyor, kritik olan onun varsayılanı. supabase_admin
-- denemesi yalnızca "yetki varsa onu da kapat" amacıyla duruyor.
--
-- (Bu satırlar tahminle değil ölçümle yazıldı: değişiklik canlı veritabanında
-- tek işlem içinde denenip geri alındı, hata tam olarak burada çıktı.)
--
-- Yine de bir kaçak kalırsa sessiz kalmasın: scripts/db-izin-denetimi.sql her
-- çalıştırıldığında anon/authenticated yetkisi kalan nesneleri raporlar.
do $$
declare
  r text;
  hedef text;
begin
  foreach r in array array['postgres', 'supabase_admin'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      continue;
    end if;
    begin
      foreach hedef in array array['tables', 'sequences', 'functions'] loop
        execute format(
          'alter default privileges for role %I in schema public revoke all on %s from anon, authenticated',
          r, hedef);
      end loop;
      raise notice 'Varsayilan yetkiler kapatildi: %', r;
    exception when insufficient_privilege then
      raise notice 'Varsayilan yetkiler degistirilemedi (rol uyeligi yok): % — atlandi', r;
    end;
  end loop;
end $$;


-- ----------------------------------------------------------------------------
-- 4) Fonksiyonlarda search_path sabitlensin
-- ----------------------------------------------------------------------------
-- search_path'i sabit olmayan bir fonksiyon, çağıranın search_path'ini miras
-- alır. Çağıran kendi şemasına sahte bir tablo/operatör koyup fonksiyonun
-- hangi nesneyi kullanacağını değiştirebilir. Şemadaki diğer bütün fonksiyonlar
-- zaten sabitlenmiş; bu sonuncusu atlanmış.
alter function public.ai_apply_credit_change(p_user_id uuid, p_credits numeric, p_allow_negative boolean)
  set search_path = public, pg_temp;


-- ----------------------------------------------------------------------------
-- 5) Kuralı belgeye bağla
-- ----------------------------------------------------------------------------
-- Şemayı Supabase panelinden inceleyen biri "RLS var ama politika yok, bu bir
-- hata mı?" diye düşünecektir. Cevap veritabanının içinde dursun.
comment on schema public is
  'Projelio uygulama şeması. Erişim yalnızca service_role ile (NestJS backend) olur. '
  'Tüm tablolarda RLS açık ve BİLEREK hiç politika yok: bu, anon/authenticated '
  'rolleri için varsayılan RED demektir. Satır bazlı yetkilendirme uygulama '
  'katmanındadır (backend/src/common/access/access.service.ts) çünkü proje '
  'Supabase Auth kullanmaz ve auth.uid() burada her zaman NULL döner. '
  'Ayrıntı: database/migrations/062_veritabani_izin_kurallari.sql';


-- ----------------------------------------------------------------------------
-- 6) Uygulandığını doğrula — beklenen durum sağlanmazsa migration BAŞARISIZ olsun
-- ----------------------------------------------------------------------------
-- Sessizce yarım uygulanmış bir güvenlik migration'ı, hiç uygulanmamış olandan
-- daha tehlikelidir: "yaptık" sanılır.
do $$
declare
  rls_yok  text[];
  yetki_var text[];
begin
  select coalesce(array_agg(c.relname order by c.relname), '{}')
  into rls_yok
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

  select coalesce(array_agg(distinct g.table_name order by g.table_name), '{}')
  into yetki_var
  from information_schema.role_table_grants g
  where g.table_schema = 'public' and g.grantee in ('anon', 'authenticated');

  if array_length(rls_yok, 1) is not null then
    raise exception 'RLS acik olmayan tablolar kaldi: %', array_to_string(rls_yok, ', ');
  end if;

  if array_length(yetki_var, 1) is not null then
    raise exception 'anon/authenticated yetkisi kalan nesneler: %', array_to_string(yetki_var, ', ');
  end if;

  raise notice 'Dogrulama gecti: tum tablolarda RLS acik, anon/authenticated yetkisi yok.';
end $$;
