-- 064_mail_accounts.sql
-- E-posta modülü: modüle bağlı gelen kutusu
--
-- NE YAPIYOR
-- ----------
-- Bir Microsoft (Outlook) kutusunu bir MODÜL KAPSAMINA bağlar: organizasyon +
-- departman ya da iş. Kutuyu bağlayan kişinin Microsoft hesabı üzerinden
-- okunur; modüle yazma yetkisi olan herkes okuyabilir ve yanıtlayabilir.
--
-- NEDEN "ORTAK KUTU"
-- ------------------
-- Departmanın e-postası kurumsaldır: info@, satis@, destek@ kutusuna bakan kişi
-- izinli bir çalışandır, kutunun "sahibi" değildir. Herkesin yalnızca kendi
-- kutusunu gördüğü bir model, "departman gelen kutusu" fikrini ortadan
-- kaldırırdı.
--
-- BEDELİ AÇIK OLMALI: bu tabloya bir satır yazmak, "kutumu ekibe açıyorum"
-- demektir. Arayüz bunu bağlama anında yazıyla söyler; `connected_by` kimin
-- açtığını kalıcı olarak kaydeder.
--
-- NE SAKLAMIYOR
-- -------------
-- İletiler, ekler, adresler — hiçbiri. Kutu Graph üzerinden CANLI okunur.
-- Sebep: e-posta içeriğini kopyalamak, veriyi Projelio'nun sorumluluğuna
-- taşımak demek (KVKK kapsamı, saklama süresi, silme talebi, sızıntı yüzeyi).
-- Kopyalamadığımızda kullanıcı Outlook'tan bir postayı sildiğinde Projelio'da
-- da yok olur — beklenen davranış budur.
--
-- Jeton da burada değil: mevcut `microsoft_accounts.refresh_token_enc`
-- kullanılır (AES-256-GCM, MICROSOFT_TOKEN_ENC_KEY). Posta izinleri o hesaba
-- artımlı onayla eklenir (bkz. MAIL_SCOPES).
--
-- GÜVENLİK NOTU: diğer modül tablolarıyla aynı model — RLS açık, politika yok;
-- erişim yalnızca service_role üzerinden, yetki MailboxService'in
-- sorumluluğunda.

create table if not exists public.mail_accounts (
  id                    uuid primary key default gen_random_uuid(),

  -- Kapsam: modül kayıtlarıyla aynı ikili desen (bkz. 037_freelancer_modules).
  organization_id       uuid references public.organizations(id) on delete cascade,
  job_id                uuid references public.jobs(id) on delete cascade,
  department_id         uuid references public.departments(id) on delete set null,

  provider              varchar not null default 'microsoft'
                          check (provider in ('microsoft', 'google')),

  -- Kutunun okunduğu bağlantı. Hesap kaydı silinirse kutu da anlamsızlaşır.
  microsoft_account_id  uuid references public.microsoft_accounts(id) on delete cascade,

  -- Görüntülenen adres. Bağlayanın kendi adresi ya da erişimi olan paylaşılan
  -- bir kutu (ör. info@sirket.com) olabilir; Graph'ta paylaşılan kutuya
  -- /users/{adres}/messages ile erişilir.
  address               varchar not null,
  display_name          varchar,
  -- Bağlayanın kendi kutusu değilse doludur: Graph yolunda bu adres kullanılır.
  shared_mailbox        varchar,

  -- Yanıtların sonuna eklenecek imza (düz metin ya da basit HTML).
  signature             text,

  connected_by          uuid references public.users(id) on delete set null,
  active                boolean not null default true,
  -- Son hata: jeton düştüğünde kullanıcıya "yeniden bağlayın" diyebilmek için.
  connection_error      text,
  last_checked_at       timestamp,

  created_at            timestamp not null default current_timestamp,
  updated_at            timestamp,
  archived_at           timestamp,

  constraint mail_accounts_scope check (num_nonnulls(organization_id, job_id) = 1)
);

comment on table public.mail_accounts is
  'E-posta modulune bagli gelen kutusu. Iletiler SAKLANMAZ, Graph uzerinden canli okunur. Jeton microsoft_accounts tablosunda.';
comment on column public.mail_accounts.shared_mailbox is
  'Baglayanin kendi kutusu degilse paylasilan kutunun adresi (ornek: info@sirket.com).';
comment on column public.mail_accounts.connected_by is
  'Kutuyu module kim acti. Modul uyeleri bu kisinin baglantisi uzerinden okur.';

create index if not exists mail_accounts_org_idx
  on public.mail_accounts(organization_id) where organization_id is not null and archived_at is null;
create index if not exists mail_accounts_job_idx
  on public.mail_accounts(job_id) where job_id is not null and archived_at is null;

alter table public.mail_accounts enable row level security;
