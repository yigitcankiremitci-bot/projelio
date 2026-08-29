-- Üyelik gerektirmeden proje ilerlemesini gösteren paylaşım linkleri.
--
-- NEDEN: proje sahibinin, projeyi takip etmesi gereken ama Projelio'da hesabı
-- OLMAYAN kişilere (müşteri, yatırımcı, danışman, taşeronun patronu) durum
-- göstermesi gerekiyor. Bugüne kadarki tek yol onları projeye üye olarak
-- eklemekti; bu hem hesap açmayı zorunlu kılıyor hem de kişiye projenin
-- tamamına erişim veriyordu.
--
-- LİNK BİR YETKİ DEĞİL, BİR PENCEREDİR. Token'ı bilen herkes SALT OKUNUR bir
-- görünüm alır; hiçbir yazma ucu bu tabloya bakmaz. Ne görüneceği link
-- oluşturulurken satır bazında seçilir (show_* sütunları) — varsayılan olarak
-- yalnızca özet ve görevler açıktır, çünkü bir linkin yanlışlıkla bütçeyi ya da
-- ekibin adlarını sızdırması, göstermemesinden çok daha pahalıya patlar.

create table if not exists project_share_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,

  -- Linkteki gizli dizi. Tahmin edilemez olmak zorunda: tek koruma bu
  -- (bkz. share-token.ts, 32 karakterlik base64url = 192 bit rastgelelik).
  -- Uzunluk sınırı bilerek geniş: token üretimi değişirse şema engel olmasın.
  token varchar(64) not null unique,

  -- "Bu link kimin için?" — sahibin listede ayırt edebilmesi için serbest metin
  -- ("Müşteri: Ahmet Bey"). Linki açan kişiye GÖSTERİLMEZ.
  label varchar(120),

  -- Görünürlük anahtarları. Proje sayfasının sekmeleriyle birebir eşleşiyor
  -- (bkz. apps/web/src/components/ProjectTabs.tsx) ki sahibin "neyi
  -- paylaşıyorum" sorusunun cevabı, uygulamada gördüğü şeyle aynı isimde olsun.
  --
  -- Özet (başlık, durum, tarihler, ilerleme yüzdesi) her linkte var: onsuz
  -- sayfada gösterilecek hiçbir şey kalmıyor, o yüzden anahtarı da yok.
  show_tasks   boolean not null default true,
  show_outputs boolean not null default true,
  show_team    boolean not null default false,
  show_feed    boolean not null default false,
  show_files   boolean not null default false,
  show_budget  boolean not null default false,

  -- Boşsa süresiz. Süresi dolmuş link 404 döner (bkz. resolve()).
  expires_at timestamp,
  -- Sahibi linki iptal ettiğinde dolar. Satır SİLİNMEZ: "bu linki kime
  -- vermiştim, ne zaman kapattım" sorusu iptalden sonra da cevaplanabilsin.
  revoked_at timestamp,

  -- Sahibin "linke bakan oldu mu" sorusuna cevap. Ziyaretçi kimliği TUTULMAZ
  -- (IP, tarayıcı, ad); linki açan kişi Projelio'nun kullanıcısı değil ve
  -- onun hakkında veri biriktirmenin bir gerekçesi yok.
  view_count integer not null default 0,
  last_viewed_at timestamp,

  created_by uuid references users(id) on delete set null,
  created_at timestamp not null default current_timestamp
);

comment on table public.project_share_links is
  'Uyelik gerektirmeyen, salt okunur proje ilerleme linkleri. Token biliniyorsa erisim var.';
comment on column public.project_share_links.token is
  'Linkteki gizli dizi. Tahmin edilemezligi tek guvenlik katmani; loglara yazilmamali.';

-- Linki açan her istek token ile geliyor: aramanın indeksli olması şart.
-- (unique kısıtı zaten indeks yaratıyor, ayrıca eklenmiyor.)

-- Sahibin "bu projenin linkleri" listesi.
create index if not exists idx_project_share_links_project
  on project_share_links(project_id, created_at desc);

alter table project_share_links enable row level security;
