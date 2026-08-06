-- 024_departments_and_org_structure.sql
-- Grup/organizasyon yapısını, büyük ölçekli şirket/işletme senaryolarını
-- desteklemek üzere derinleştirir.
--
-- Kaynak dokümanlar: "Projelio'daki yenilikler", "Projelio Kullanıcı Yapısı",
-- "Departmanlar ISO 9001" (Ağustos 2026).
--
-- Ne ekleniyor:
--   1. department_catalog  — ISO 9001 uyumlu 10 standart departman (referans)
--   2. module_catalog      — departman bazlı modül/araç kataloğu (referans)
--   3. departments         — bir organizasyonun fiilen kurduğu departmanlar
--   4. department_members  — "kadro": departmana bağlı kişi + rolü
--   5. organizations.org_type — şirket (büyük ölçek) / işletme (küçük ölçek)
--   6. users.account_type  — employee, subcontractor eklenir
--   7. organization_modules — organizasyonun kurulum sihirbazında seçtiği modüller
--   8. job_modules          — serbest çalışanın bir işe atadığı modüller
--   9. partners + partner_module_grants — hisse ortaklığı ve modül görünürlüğü
--
-- Yetkilendirme mimarisiyle tutarlılık: bu projede RLS her tabloda açık ama
-- policy yazılmıyor (yetki tamamen NestJS backend'de, service_role ile).
-- Yeni tablolar da aynı deseni izliyor — policy eklenmiyor.

-- ============================================== 1. Departman kataloğu
-- Sihirbazda kullanıcıya sorulacak sabit departman listesi. Organizasyonlar
-- burada olmayan özel departmanlar da açabilir (departments.catalog_key null).

create table public.department_catalog (
  key             varchar primary key,
  name            varchar not null,
  description     text,
  main_task_areas text,
  sort_order      integer not null default 0,
  created_at      timestamp not null default current_timestamp
);

comment on table public.department_catalog is
  'ISO 9001 uyumlu standart departman tanımları (referans/sabit veri). departments tablosu buradan seed edilir.';

alter table public.department_catalog enable row level security;

insert into public.department_catalog (key, name, description, main_task_areas, sort_order) values
('yonetim', 'YÖNETİM',
 'Şirketin vizyonunu, stratejik hedeflerini belirler ve tüm departmanlar arasındaki koordinasyonu sağlar.',
 'Şirketin uzun vadeli stratejilerini ve büyüme planlarını hazırlamak. Yatırım kararlarını onaylamak ve şirket performansını denetlemek. Kurumsal kültürü ve liderlik vizyonunu belirlemek.',
 10),
('insan_kaynaklari', 'İNSAN KAYNAKLARI',
 'Şirketin en değerli kaynağı olan insan gücünün planlanması, kuruma kazandırılması ve yönetilmesiyle ilgilenir.',
 'İşe Alım ve Oryantasyon: Doğru yetenekleri şirkete kazandırma ve adaptasyon süreçleri. Eğitim ve Gelişim: Çalışan yetkinliklerini artıracak programlar düzenleme. Performans Yönetimi: Hedef bazlı değerlendirme sistemleri yürütme. Bordro ve Özlük İşleri: Yasal süreçlerin, maaşların ve yan hakların takibi. İç İletişim ve Şirket Kültürü: Çalışan memnuniyetini ve bağlılığını artırıcı faaliyetler.',
 20),
('finans_muhasebe', 'FİNANS MUHASEBE',
 'Şirketin finansal sağlığını korumak, nakit akışını yönetmek ve yasal mali yükümlülükleri yerine getirmekle sorumludur.',
 'Genel Muhasebe: Gelir-gider kayıtları, faturalandırma ve vergi beyannameleri. Finansal Planlama ve Analiz (FP&A): Bütçeleme, nakit akışı yönetimi ve finansal raporlama. Maliyet Akışı ve Risk Yönetimi: Şirket sermayesinin optimize edilmesi ve yatırımların geri dönüş (ROI) analizleri.',
 30),
('pazarlama_buyume', 'PAZARLAMA ve BÜYÜME',
 'Şirketin ürün ve hizmetlerini hedef kitleye tanıtmak, marka değerini artırmak ve talep yaratmakla görevlidir.',
 'Pazar Araştırması: Hedef kitle, rakip ve sektör analizleri. Dijital Pazarlama: SEO/SEM, sosyal medya yönetimi, e-posta pazarlaması ve dijital reklam kampanyaları. Ürün Pazarlaması ve İletişim: Konumlandırma, fiyatlandırma stratejileri ve kurumsal iletişim. Performans Pazarlaması: Müşteri kazanım maliyetlerini (CAC) optimize etme ve büyüme kurguları.',
 40),
('satis_is_gelistirme', 'SATIŞ ve İŞ GELİŞTİRME',
 'Pazarlamanın yarattığı potansiyeli gelire dönüştürmekten ve yeni iş fırsatları oluşturmaktan sorumludur.',
 'Doğrudan Satış: B2B veya B2C kanallarında satış süreçlerini yürütmek ve kapatmak. Müşteri İlişkileri Yönetimi (CRM): Müşteri veritabanını güncel tutmak ve satış hunisini yönetmek. İş Geliştirme: Yeni pazarlar, stratejik ortaklıklar ve distribütörlük ağları keşfetmek.',
 50),
('operasyon_uretim', 'OPERASYON/ÜRETİM',
 'Şirketin sunduğu ana ürün veya hizmetin somut/soyut olarak ortaya çıkarılmasını ve teslimatını sağlar.',
 'Tedarik Zinciri ve Lojistik: Hammadde/hizmet tedariki, stok yönetimi ve sevkiyat. Üretim/Hizmet Sunumu: Ürünlerin imalatı veya dijital/fiziksel hizmetlerin yürütülmesi. Kalite Kontrol (QA): Çıktıların belirlenen standartlara uygunluğunu denetleme.',
 60),
('bilgi_teknolojileri_yazilim', 'BİLGİ TEKNOLOJİLERİ/YAZILIM',
 'Şirketin dijital altyapısını, siber güvenliğini ve geliştirdiği teknolojik ürünleri yönetir.',
 'Sistem ve Ağ Yönetimi: Sunucuların, donanımların ve iç ağların kesintisiz çalışması. Ürün ve Yazılım Geliştirme: Şirket içi yazılımların veya dışarıya sunulan dijital ürünlerin kodlanması, bakımı ve ölçeklenmesi. Veri Güvenliği ve Siber Savunma: Veri sızıntılarına karşı önlemler alma ve KVKK/GDPR uyumluluğu.',
 70),
('urun_yonetimi', 'ÜRÜN YÖNETİMİ',
 'Özellikle teknoloji ve dijital odaklı şirketlerde, ürünün fikir aşamasından kullanıcıya ulaşana kadarki tüm yaşam döngüsünü yönetir.',
 'Ürün Yol Haritası (Roadmap): Kullanıcı ihtiyaçları ve iş hedeflerine göre önceliklendirme yapılması. UX/UI ve Tasarım: Müşteri deneyimini ve arayüz standartlarını belirleme. Çapraz Departman Koordinasyonu: Yazılım, pazarlama ve satış ekipleri arasında köprü kurulması.',
 80),
('musteri_iliskileri', 'MÜŞTERİ İLİŞKİLERİ',
 'Müşteri memnuniyetini sağlamak, sorunları çözmek ve mevcut müşterilerin elde tutulmasını (Retention) sağlamakla yükümlüdür.',
 'Müşteri Destek: Talep, şikayet ve teknik sorunlara hızlı dönüş sağlama. Müşteri Başarısı (Customer Success): Kullanıcının üründen maksimum verim almasını sağlama, elde tutma oranlarını artırma.',
 90),
('hukuk_uyum', 'HUKUK ve UYUM',
 'Şirketin tüm faaliyetlerinin yasalara, yönetmeliklere ve sözleşmelere uygun olarak yürütülmesini güvence altına alır.',
 'Sözleşme Yönetimi: Müşteri, tedarikçi ve ortaklık sözleşmelerini hazırlama/inceleme. Fikri Mülkiyet (IP): Marka, patent, telif hakları ve tescil süreçlerinin takibi. Mevzuat Uyum: Sektörel düzenlemelere ve yasalara tam uyum sağlama.',
 100)
on conflict (key) do nothing;

-- ============================================== 2. Modül kataloğu
-- "Projelio Kullanıcı Yapısı" dokümanındaki Assets satırından derlendi.
-- scope='holding' -> department_key boş, Holding sahibinin çoklu şirket geneli
-- gördüğü meta modüller. scope='organization' -> departman bazlı modüller.
-- Not: bazı YÖNETİM modülleri (proje/görev/bütçe/dosya yönetimi) Projelio'nun
-- zaten var olan çekirdek özellikleriyle örtüşüyor; katalogda dokümana sadık
-- kalmak için ayrı satır olarak tutuluyor, ileride çekirdek özelliklere
-- eşlenebilir.

create table public.module_catalog (
  key                    varchar primary key,
  department_key         varchar references public.department_catalog(key) on delete set null,
  name                   varchar not null,
  description            text,
  scope                  varchar not null default 'organization' check (scope in ('organization', 'holding')),
  applies_to_freelancer  boolean not null default false,
  sort_order             integer not null default 0,
  created_at             timestamp not null default current_timestamp
);

comment on table public.module_catalog is
  'Departman/holding bazlı modül-araç kataloğu (referans/sabit veri). Kurulum sihirbazında organization_modules''a, serbest çalışanda job_modules''a seçilir.';
comment on column public.module_catalog.applies_to_freelancer is
  'true ise serbest çalışan panelindeki "Modüller" sekmesinde de listelenir.';

alter table public.module_catalog enable row level security;

insert into public.module_catalog (key, department_key, name, scope, sort_order) values
-- YÖNETİM
('yonetim_vizyon_sablonu',        'yonetim', 'Vizyon belirleme şablonu', 'organization', 10),
('yonetim_misyon_sablonu',        'yonetim', 'Misyon belirleme şablonu', 'organization', 20),
('yonetim_hedef_belirleme',       'yonetim', 'Hedef belirleme modülü', 'organization', 30),
('yonetim_analiz',                'yonetim', 'Analiz modülü', 'organization', 40),
('yonetim_raporlama',             'yonetim', 'Raporlama modülü', 'organization', 50),
('yonetim_denetim',               'yonetim', 'Denetim modülü', 'organization', 60),
('yonetim_proje_yonetimi',        'yonetim', 'Proje yönetimi modülü', 'organization', 70),
('yonetim_program_yonetimi',      'yonetim', 'Program yönetimi modülü', 'organization', 80),
('yonetim_cikti_yonetimi',        'yonetim', 'Çıktı yönetimi modülü', 'organization', 90),
('yonetim_gorev_yonetimi',        'yonetim', 'Görev yönetimi modülü', 'organization', 100),
('yonetim_butce_yonetimi',        'yonetim', 'Bütçe yönetimi modülü', 'organization', 110),
('yonetim_dosya_yonetimi',        'yonetim', 'Dosya yönetimi modülü', 'organization', 120),
-- İNSAN KAYNAKLARI
('ik_ise_alim_oryantasyon',       'insan_kaynaklari', 'İşe alım ve oryantasyon modülü', 'organization', 10),
('ik_egitim_gelisim',             'insan_kaynaklari', 'Eğitim ve gelişim planlama modülü', 'organization', 20),
('ik_performans_izleme',          'insan_kaynaklari', 'Performans izleme', 'organization', 30),
('ik_bordro_ozluk',               'insan_kaynaklari', 'Bordro ve özlük modülü', 'organization', 40),
('ik_ic_iletisim_kultur',         'insan_kaynaklari', 'İç iletişim ve şirket kültürü', 'organization', 50),
-- FİNANS MUHASEBE
('fm_gelir_gider',                'finans_muhasebe', 'Gelir-Gider Modülü', 'organization', 10),
('fm_fatura',                     'finans_muhasebe', 'Fatura Modülü', 'organization', 20),
('fm_finansal_planlama',          'finans_muhasebe', 'Finansal Planlama Modülü', 'organization', 30),
('fm_analiz_rapor',               'finans_muhasebe', 'Analiz ve Rapor oluşturma', 'organization', 40),
('fm_vergi_takip',                'finans_muhasebe', 'Vergi takip modülü', 'organization', 50),
('fm_butce_hazirlama',            'finans_muhasebe', 'Bütçe hazırlama modülü', 'organization', 60),
('fm_nakit_akis',                 'finans_muhasebe', 'Nakit akış modülü', 'organization', 70),
('fm_sermaye_yatirim_takip',      'finans_muhasebe', 'Sermaye ve Yatırım takip modülü', 'organization', 80),
('fm_risk_yonetimi',              'finans_muhasebe', 'Risk yönetimi modülü', 'organization', 90),
-- PAZARLAMA ve BÜYÜME
('pd_rakip_sektor_analizi',       'pazarlama_buyume', 'Rakip ve sektör analizi modülü', 'organization', 10),
('pd_hedef_kitle',                'pazarlama_buyume', 'Hedef kitle modülü', 'organization', 20),
('pd_dijital_pazarlama_seo_sem',  'pazarlama_buyume', 'Dijital Pazarlama ve SEO/SEM Yönetim modülü', 'organization', 30),
('pd_sosyal_medya',               'pazarlama_buyume', 'Sosyal medya modülü', 'organization', 40),
('pd_email',                      'pazarlama_buyume', 'E-mail modülü', 'organization', 50),
('pd_reklam',                     'pazarlama_buyume', 'Reklam modülü', 'organization', 60),
('pd_urun_stratejileri',          'pazarlama_buyume', 'Ürün stratejileri bölümü', 'organization', 70),
('pd_musteri_kazanim_optimizasyonu', 'pazarlama_buyume', 'Müşteri kazanım optimizasyonu', 'organization', 80),
('pd_buyume_hedefleri',           'pazarlama_buyume', 'Büyüme hedefleri', 'organization', 90),
-- SATIŞ ve İŞ GELİŞTİRME
('spd_satis_planlama_b2b_b2c',    'satis_is_gelistirme', 'Satış planlama BtoB, BtoC', 'organization', 10),
('spd_musteri_modulu',            'satis_is_gelistirme', 'Müşteri modülü', 'organization', 20),
('spd_ortaklik_dagitim',          'satis_is_gelistirme', 'Ortaklık ve Dağıtım Modülü', 'organization', 30),
('spd_pazar_arastirma',           'satis_is_gelistirme', 'Pazar ve araştırma modülü', 'organization', 40),
-- OPERASYON/ÜRETİM
('oud_tedarik',                   'operasyon_uretim', 'Tedarik modülü', 'organization', 10),
('oud_depo',                      'operasyon_uretim', 'Depo modülü', 'organization', 20),
('oud_sevkiyat_yonetimi',         'operasyon_uretim', 'Sevkiyat yönetimi', 'organization', 30),
('oud_kalite_kontrol',            'operasyon_uretim', 'Kalite kontrol modülü', 'organization', 40),
-- BİLGİ TEKNOLOJİLERİ/YAZILIM
('bt_yazilim',                    'bilgi_teknolojileri_yazilim', 'Yazılım modülü', 'organization', 10),
('bt_donanim',                    'bilgi_teknolojileri_yazilim', 'Donanım modülü', 'organization', 20),
('bt_ag_guvenlik',                'bilgi_teknolojileri_yazilim', 'Ağ ve güvenlik', 'organization', 30),
-- ÜRÜN YÖNETİMİ
('uyd_urunler',                   'urun_yonetimi', 'Ürünler modülü', 'organization', 10),
-- MÜŞTERİ İLİŞKİLERİ
('mid_musteri_modulu',            'musteri_iliskileri', 'Müşteri Modülü', 'organization', 10),
('mid_sikayet_oneri',             'musteri_iliskileri', 'Şikayet ve Öneri', 'organization', 20),
('mid_teknik_destek',             'musteri_iliskileri', 'Teknik Destek', 'organization', 30),
-- HUKUK ve UYUM
('hud_sozlesme',                  'hukuk_uyum', 'Sözleşme Modülü', 'organization', 10),
('hud_marka_patent_telif',        'hukuk_uyum', 'Marka/Patent/Telif/Tescil Bölümü', 'organization', 20),
('hud_mevzuatlar',                'hukuk_uyum', 'Mevzuatlar', 'organization', 30),
-- HOLDİNG geneli (çoklu şirket/işletme özet modülleri)
('holding_analiz',                null, 'Analiz modülü (Holding geneli)', 'holding', 10),
('holding_raporlama',             null, 'Raporlama modülü (Holding geneli)', 'holding', 20),
('holding_denetim',               null, 'Denetim modülü (Holding geneli)', 'holding', 30)
on conflict (key) do nothing;

-- ============================================== 3. Organizasyon tipi
-- Şirket = büyük ölçekli, İşletme = küçük ölçekli yapı. Aynı şema, ölçek farkı.

alter table public.organizations
  add column if not exists org_type varchar not null default 'sirket'
    check (org_type in ('sirket', 'isletme'));

comment on column public.organizations.org_type is
  'sirket = buyuk olcekli, isletme = kucuk olcekli. Kurulum sihirbazinda kullanici secer.';

-- ============================================== 4. Kullanıcı tipleri genişletmesi
-- Doküman 1: serbest çalışan, holding sahibi, şirket sahibi, işletme sahibi,
-- çalışan, taşeron. group_owner=holding sahibi, organization_owner=şirket/
-- işletme sahibi (org_type ile ayrışır). employee ve subcontractor eklendi.
-- Not: "Departman Yöneticisi" ayrı bir account_type DEĞİL — department_members
-- tablosunda role='manager' olarak tutulan bir alt-rol (bkz. bölüm 6).

alter table public.users drop constraint if exists users_account_type_check;
alter table public.users
  add constraint users_account_type_check
    check (account_type in ('freelancer', 'organization_owner', 'group_owner', 'employee', 'subcontractor'));

-- ============================================== 5. Departmanlar
-- Bir organizasyonun fiilen kurduğu departmanlar. catalog_key doluysa
-- department_catalog'daki standart tanımdan başlar (isim/açıklama override
-- edilebilir); null ise organizasyona özel bir departmandır.

create table public.departments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  catalog_key     varchar references public.department_catalog(key) on delete set null,
  name            varchar not null,
  description     text,
  sort_order      integer not null default 0,
  archived_at     timestamp,
  created_at      timestamp not null default current_timestamp
);

comment on table public.departments is
  'Bir organizasyonun kurulum sihirbazinda sectigi/olusturdugu departmanlar. Departman yoneticisi department_members.role=manager ile tutulur.';

-- Aynı organizasyonda aynı standart departman iki kez açılamaz (özel
-- departmanlarda catalog_key null olduğu için bu kısıt onları etkilemez).
create unique index departments_org_catalog_uniq
  on public.departments(organization_id, catalog_key) where catalog_key is not null;

create index departments_org_idx on public.departments(organization_id) where archived_at is null;
alter table public.departments enable row level security;

-- ============================================== 6. Kadro (departman üyeleri)
-- Doküman 1 akışı: önce yönetici kadrosu/pozisyonlar tanımlanır (user_id boş,
-- invite_email dolu olabilir), sonra ilgili kişiye davet gönderilir ve kişi
-- sisteme "çalışan" statüsüyle bağlanınca user_id doldurulur.
--
-- role: manager (yönetici çalışan) / employee (üretici çalışan) / subcontractor
--       (taşeron — yalnızca bağlı olduğu departmanın ilgili modülünü yönetir).
-- access_until: işten çıkarılan çalışanın, yöneticinin izin verdiği süre
--       boyunca sınırlı görünürlüğü için (Doküman 1, işten çıkarma bölümü).

create table public.department_members (
  id             uuid primary key default gen_random_uuid(),
  department_id  uuid not null references public.departments(id) on delete cascade,
  user_id        uuid references public.users(id) on delete cascade,
  invite_email   varchar,
  role           varchar not null default 'employee' check (role in ('manager', 'employee', 'subcontractor')),
  title          varchar,
  reports_to     uuid references public.department_members(id) on delete set null,
  status         varchar not null default 'pending'
                   check (status in ('invited', 'pending', 'approved', 'rejected', 'removed')),
  access_until   timestamp,
  invited_by     uuid references public.users(id) on delete set null,
  joined_at      timestamp not null default current_timestamp,

  constraint department_members_person_identifier check (num_nonnulls(user_id, invite_email) >= 1)
);

comment on table public.department_members is
  '"Kadro": bir departmana bagli kisi + rolu + pozisyon adi. user_id bos ise henuz hesap acmamis, davet bekleyen bir pozisyondur.';
comment on column public.department_members.access_until is
  'Isten cikarilan/departmandan ayrilan calisanin, yoneticinin izin verdigi belgeleri gorebilecegi son tarih. Bos ise sinirsiz/gecerli erisim.';

create unique index department_members_dept_user_uniq
  on public.department_members(department_id, user_id) where user_id is not null;
create unique index department_members_dept_email_uniq
  on public.department_members(department_id, invite_email) where user_id is null and invite_email is not null;

create index department_members_dept_idx on public.department_members(department_id);
create index department_members_user_idx on public.department_members(user_id) where user_id is not null;
alter table public.department_members enable row level security;

-- ============================================== 7. Organizasyon modülleri
-- Kurulum sihirbazında bir organizasyonun departmanlarına uygun olarak
-- işaretlediği modüller.

create table public.organization_modules (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  module_key      varchar not null references public.module_catalog(key) on delete cascade,
  enabled_by      uuid references public.users(id) on delete set null,
  created_at      timestamp not null default current_timestamp,

  unique (organization_id, module_key)
);

comment on table public.organization_modules is
  'Kurulum sihirbazinda organizasyonun etkinlestirdigi moduller (module_catalog referansiyla).';

create index organization_modules_org_idx on public.organization_modules(organization_id);
alter table public.organization_modules enable row level security;

-- ============================================== 8. Serbest çalışan modülleri
-- Serbest çalışan panelindeki "Modüller" sekmesinden bir işe atanan modüller.
-- Doküman 1 netleştirmesi: serbest çalışanın departmanı yoktur, modülü
-- doğrudan bir işe (job) atar.

create table public.job_modules (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs(id) on delete cascade,
  module_key  varchar not null references public.module_catalog(key) on delete cascade,
  created_at  timestamp not null default current_timestamp,

  unique (job_id, module_key)
);

comment on table public.job_modules is
  'Serbest calisanin "Moduller" sekmesinden bir ise atadigi modul (module_catalog.applies_to_freelancer=true olanlar arasindan).';

create index job_modules_job_idx on public.job_modules(job_id);
alter table public.job_modules enable row level security;

-- ============================================== 9. Ortaklar (hisse)
-- Holding, şirket veya işletmeye belirli bir yüzdeyle ortak olan kişiler.
-- jobs tablosundaki group/organization ayrık kısıt desenini izler.

create table public.partners (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid references public.groups(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id         uuid references public.users(id) on delete cascade,
  invite_email    varchar,
  equity_percent  numeric(5,2) not null check (equity_percent > 0 and equity_percent <= 100),
  granted_by      uuid references public.users(id) on delete set null,
  status          varchar not null default 'pending'
                    check (status in ('invited', 'pending', 'approved', 'rejected', 'removed')),
  created_at      timestamp not null default current_timestamp,

  constraint partners_target_exclusive check (num_nonnulls(group_id, organization_id) = 1),
  constraint partners_person_identifier check (num_nonnulls(user_id, invite_email) >= 1)
);

comment on table public.partners is
  'Holding/sirket/isletmeye hisse yuzdesiyle ortak olan kisi. Gorebilecegi moduller partner_module_grants ile ayrica tanimlanir.';

create unique index partners_org_user_uniq  on public.partners(organization_id, user_id)      where organization_id is not null and user_id is not null;
create unique index partners_group_user_uniq on public.partners(group_id, user_id)             where group_id is not null and user_id is not null;
create unique index partners_org_email_uniq  on public.partners(organization_id, invite_email) where organization_id is not null and user_id is null and invite_email is not null;
create unique index partners_group_email_uniq on public.partners(group_id, invite_email)        where group_id is not null and user_id is null and invite_email is not null;

create index partners_org_idx on public.partners(organization_id) where organization_id is not null;
create index partners_group_idx on public.partners(group_id) where group_id is not null;
create index partners_user_idx on public.partners(user_id) where user_id is not null;
alter table public.partners enable row level security;

create table public.partner_module_grants (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references public.partners(id) on delete cascade,
  module_key  varchar not null references public.module_catalog(key) on delete cascade,
  granted_by  uuid references public.users(id) on delete set null,
  created_at  timestamp not null default current_timestamp,

  unique (partner_id, module_key)
);

comment on table public.partner_module_grants is
  'Ortagi eden kisinin, ortaga gorunur kildigi modul/bolum listesi.';

create index partner_module_grants_partner_idx on public.partner_module_grants(partner_id);
alter table public.partner_module_grants enable row level security;
