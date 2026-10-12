-- 162_projelio_posta_kutulari.sql
-- E-posta modülüne üçüncü sağlayıcı: @projelio.app adresi.
--
-- NE YAPIYOR
-- ----------
-- Platform yöneticisi bir modül kapsamında (şirket/departman ya da iş)
-- ad@projelio.app biçiminde bir kutu açar. Kutu, Outlook kutusuyla aynı
-- `mail_accounts` satırıdır (provider = 'projelio'); modüle atanmış herkes
-- okur, yanıtlar, yeni e-posta yazar.
--
-- NEDEN BU SEFER İLETİ SAKLANIYOR
-- -------------------------------
-- 064 "ileti saklanmaz" diyordu, çünkü orada postanın asıl evi Microsoft'tu ve
-- Projelio yalnızca bir pencereydi. Burada postanın evi BİZİZ: gelen posta
-- Resend'in gelen-posta webhook'uyla düşer, giden posta Resend API'siyle
-- çıkar ve ikisinin de Projelio dışında okunabildiği bir kutu yok. Saklamazsak
-- posta hiç yok demektir. Bu yüzden iletiler `mail_messages`'ta, ekleri özel
-- (public olmayan) `mail-ekleri` kovasında duruyor; Outlook kutularının hiçbir
-- iletisi bu tabloya YAZILMAZ.
--
-- GELEN POSTANIN YOLU
-- -------------------
-- projelio.app'in MX kaydı Google Workspace'te kalıyor (info@ gibi gerçek
-- Workspace kutuları bozulmasın). Google Admin'de bir yönlendirme kuralı
-- tanınmayan @projelio.app alıcılarının zarf alıcısını Resend'in gelen-posta
-- adresine çevirir; To başlığı değişmez, eşleştirme ona göre yapılır.
-- Kurulum: docs/projelio-posta.md.
--
-- GÜVENLİK NOTU: diğer modül tablolarıyla aynı model — RLS açık, politika
-- yok; erişim yalnızca service_role üzerinden, yetki MailboxService'te.

alter table public.mail_accounts drop constraint if exists mail_accounts_provider_check;
alter table public.mail_accounts
  add constraint mail_accounts_provider_check
    check (provider in ('microsoft', 'google', 'projelio'));

-- Bir @projelio.app adresi aynı anda yalnızca BİR kutuya ait olabilir: iki
-- şirketin aynı adresi alması, gelen postanın ikisine birden düşmesi demekti.
-- Arşivlenen kutunun adresi serbest kalır (yeniden açılabilsin diye).
create unique index if not exists mail_accounts_projelio_adres_uniq
  on public.mail_accounts(lower(address))
  where provider = 'projelio' and archived_at is null;

create table if not exists public.mail_messages (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references public.mail_accounts(id) on delete cascade,

  -- inbox · sent · spam · trash. Klasör ağacı yok; e-postanın %99'u bu dördü.
  folder            varchar not null default 'inbox'
                      check (folder in ('inbox', 'sent', 'spam', 'trash')),
  direction         varchar not null check (direction in ('in', 'out')),

  -- Resend'in kimliği: gelende alınan, gidende gönderilen e-postanınki.
  -- Webhook yeniden denendiğinde aynı ileti ikinci kez yazılmasın diye
  -- aşağıda kutu başına tekil.
  resend_id         varchar,

  -- Yazışma zinciri: yanıt başlıkları (In-Reply-To/References) bunlardan kurulur.
  message_id_header varchar,
  in_reply_to       varchar,
  references_header text,

  from_address      varchar,
  from_name         varchar,
  -- [{ "name": "...", "address": "..." }]
  to_addresses      jsonb not null default '[]'::jsonb,
  cc_addresses      jsonb not null default '[]'::jsonb,
  reply_to          varchar,

  subject           text not null default '',
  body_html         text,
  body_text         text not null default '',

  is_read           boolean not null default false,
  has_attachments   boolean not null default false,
  -- Gelen postada Resend'in SPF/DKIM/DMARC sonucu; DMARC'ı düşen spam'e gider.
  auth_result       jsonb,

  -- Giden postayı kim yazdı (kutu ortak olduğu için "kim gönderdi" sorusu var).
  sent_by           uuid references public.users(id) on delete set null,
  -- Giden postada Resend hatası olursa buraya düşer; ileti yine "gönderilen"de
  -- görünür ki kullanıcı yazdığının kaybolduğunu sanmasın.
  send_error        text,

  -- timestamptz: posta dünyanın her yerinden, kendi saat diliminde gelir.
  received_at       timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

comment on table public.mail_messages is
  'Yalnizca provider=projelio kutularin iletileri. Outlook kutulari burada SAKLANMAZ (bkz. 064).';

create unique index if not exists mail_messages_resend_uniq
  on public.mail_messages(account_id, resend_id) where resend_id is not null;
create index if not exists mail_messages_liste_idx
  on public.mail_messages(account_id, folder, received_at desc);

create table if not exists public.mail_attachments (
  id            uuid primary key default gen_random_uuid(),
  message_id    uuid not null references public.mail_messages(id) on delete cascade,
  filename      varchar not null,
  content_type  varchar,
  size_bytes    integer not null default 0,
  -- Kovadaki yol: <kutu>/<ileti>/<ek>-<ad>. Boşsa ek indirilemedi (boyut
  -- tavanı ya da Resend hatası) — listede adıyla görünür, indirilemez.
  storage_path  varchar,
  content_id    varchar,
  created_at    timestamptz not null default now()
);

create index if not exists mail_attachments_message_idx on public.mail_attachments(message_id);

alter table public.mail_messages enable row level security;
alter table public.mail_attachments enable row level security;

-- Ekler özel kovada: indirme yalnızca sunucunun ürettiği süreli imzalı
-- bağlantıyla. 25 MB = Resend'in gönderimde kabul ettiği toplamın altı.
insert into storage.buckets (id, name, public, file_size_limit)
values ('mail-ekleri', 'mail-ekleri', false, 25 * 1024 * 1024)
on conflict (id) do nothing;
