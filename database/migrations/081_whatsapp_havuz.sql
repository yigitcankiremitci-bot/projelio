-- 081_whatsapp_havuz.sql
-- WhatsApp numaraları organizasyonun değil PLATFORMUN: yöneticiler (role=admin)
-- havuza birden çok numara ekler; her kullanıcıya havuzdan bir numara kalıcı
-- olarak atanır ("Projelio numaran"); Lio bu numaradan müşterilerle konuşur.
-- Tasarım: docs/whatsapp-qr-plan.md §12 (havuz modeli).
--
-- 080'deki tablolar korunur; bağlantı/kişi/konuşma satırları organizasyon
-- kapsamından numara kapsamına taşınır. Mevcut tek bağlantı (varsa) havuzun
-- ilk numarası olur.

-- ============================================================ Bağlantı: havuz

alter table public.whatsapp_connections
  alter column organization_id drop not null,
  add column if not exists label               text,
  add column if not exists created_by_user_id  uuid references public.users(id) on delete set null;

-- Organizasyon başına tek numara kısıtı kalkıyor; artık havuz.
drop index if exists public.whatsapp_connections_active_org_uq;

-- Mevcut bağlantı(lar) havuza geçer: etiket organizasyon adı, organizasyon bağı kalkar.
update public.whatsapp_connections c
   set label = coalesce(c.label, (select o.name from public.organizations o where o.id = c.organization_id), 'Numara'),
       created_by_user_id = coalesce(c.created_by_user_id, c.linked_by_user_id),
       organization_id = null
 where c.organization_id is not null;

comment on column public.whatsapp_connections.organization_id is
  'Artık kullanılmıyor (havuz modeli, 081). Geriye dönük uyumluluk için duruyor, hep null.';

-- ============================================================ Kullanıcı ↔ numara ataması
-- Kalıcı: bir kez atanan numara değişmez (müşteri hep aynı numarayı görür).
-- Numara silinirse atama engellenir (restrict) — önce kullanıcılar taşınır.

create table if not exists public.whatsapp_user_numbers (
  user_id        uuid primary key references public.users(id) on delete cascade,
  connection_id  uuid not null references public.whatsapp_connections(id) on delete restrict,
  assigned_at    timestamptz not null default now()
);

create index if not exists whatsapp_user_numbers_conn_idx
  on public.whatsapp_user_numbers (connection_id);

alter table public.whatsapp_user_numbers enable row level security;

-- ============================================================ Kişiler: numara kapsamı

alter table public.whatsapp_contacts
  alter column organization_id drop not null,
  add column if not exists connection_id uuid references public.whatsapp_connections(id) on delete cascade,
  -- 'user'     : bir Projelio kullanıcısının kendi telefonu (bildirim alıcısı)
  -- 'customer' : dış kişi (müşteri, tedarikçi); Lio / kullanıcı yazışır
  add column if not exists kind text not null default 'user'
    check (kind in ('user', 'customer')),
  -- Müşteri kaydına bağ (party); numara party.phone ya da party_contact.phone'dan gelir.
  add column if not exists party_id uuid references public.party(id) on delete set null;

-- Mevcut kişiler: organizasyonlarının (artık havuzdaki) numarasına bağlanır.
update public.whatsapp_contacts wc
   set connection_id = (
     select c.id from public.whatsapp_connections c
      where c.session_name = 'org_' || wc.organization_id::text
      limit 1)
 where wc.connection_id is null;

drop index if exists public.whatsapp_contacts_org_phone_uq;

create unique index if not exists whatsapp_contacts_conn_phone_uq
  on public.whatsapp_contacts (connection_id, phone_e164);

create index if not exists whatsapp_contacts_party_idx
  on public.whatsapp_contacts (party_id) where party_id is not null;

-- ============================================================ Konuşmalar: sahip ve tür

alter table public.whatsapp_threads
  -- 'notification': kullanıcının kendi telefonuna giden bildirim akışı
  -- 'customer'    : müşteriyle yazışma (Lio ya da kullanıcı)
  add column if not exists kind text not null default 'notification'
    check (kind in ('notification', 'customer')),
  -- Konuşmayı başlatan / sorumlu kullanıcı; sahipsiz gelen mesajda null.
  add column if not exists owner_user_id uuid references public.users(id) on delete set null,
  -- Müşteri konuşmasının erişim kapsamı (party'nin organizasyonu).
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  -- Açıkken müşteriden gelen her mesaja Lio kendi yanıtlar (bkz. whatsapp-lio.service.ts).
  add column if not exists lio_auto_reply boolean not null default false,
  add column if not exists title text;

create index if not exists whatsapp_threads_owner_idx
  on public.whatsapp_threads (owner_user_id, last_message_at desc) where owner_user_id is not null;

create index if not exists whatsapp_threads_org_idx
  on public.whatsapp_threads (organization_id) where organization_id is not null;

-- ============================================================ Mesajlar: kim gönderdi

alter table public.whatsapp_messages
  -- 'system' bildirim kanalı, 'user' elle yazan kullanıcı, 'lio' AI asistan
  add column if not exists sent_by text
    check (sent_by in ('system', 'user', 'lio')),
  add column if not exists sent_by_user_id uuid references public.users(id) on delete set null;

-- ============================================================ Eşleştirme kodları: numara kapsamı

alter table public.whatsapp_link_codes
  alter column organization_id drop not null,
  add column if not exists connection_id uuid references public.whatsapp_connections(id) on delete cascade;
