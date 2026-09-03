-- 080_whatsapp.sql
-- WhatsApp entegrasyonu: QR ile bağlanan numara (WAHA köprüsü).
-- Tasarım ve gerekçeler: docs/whatsapp-qr-plan.md
--
-- RLS açık ama politika yok — repo konvansiyonu: erişim yalnızca service_role
-- üzerinden, karar servis katmanında (bkz. 076_sosyal_hesap_kimlik_bilgileri.sql).

-- ============================================================ Bağlantı
-- Organizasyon başına bir WhatsApp numarası. Numara WAHA'daki bir "oturum"a
-- karşılık gelir; oturum anahtarları burada DEĞİL, WAHA'nın kendi
-- veritabanında durur. Bu tablo yalnızca kimin, hangi durumda, hangi numarayı
-- bağladığını bilir.

create table if not exists public.whatsapp_connections (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,

  -- WAHA oturum adı: org_<organizationId>. Webhook yalnızca bu adı taşır;
  -- gelen olayı bağlantıya bağlamanın tek yolu bu.
  session_name        text not null,

  -- 'stopped'  : oturum yok ya da durduruldu
  -- 'starting' : WAHA oturumu açıyor
  -- 'scan_qr'  : QR bekleniyor
  -- 'working'  : bağlı, mesaj gidip gelebilir
  -- 'failed'   : WAHA hata bildirdi; insan kararı bekler (otomatik yeniden
  --              başlatma YOK — bağlan/kop döngüsü ban tetikleyicisi)
  status              text not null default 'stopped'
                        check (status in ('stopped', 'starting', 'scan_qr', 'working', 'failed')),
  engine              text,

  -- Bağlanınca WAHA'nın bildirdiği numara (E.164, artı işaretiyle).
  phone_e164          text,
  push_name           text,

  linked_by_user_id   uuid references public.users(id) on delete set null,
  last_connected_at   timestamptz,
  last_status_at      timestamptz,

  -- Isınma merdiveni bağlandığı andan sayılır (bkz. whatsapp-rate-limit.ts).
  warmup_started_at   timestamptz,

  -- WhatsApp'ın yeni-kişi/kapasite kısıtı (463/475) görülünce gönderim bu ana
  -- kadar durur; oturuma dokunulmaz. Yönetici arayüzde nedenini görür.
  paused_until        timestamptz,
  pause_reason        text,

  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists whatsapp_connections_active_org_uq
  on public.whatsapp_connections (organization_id) where is_active;

create unique index if not exists whatsapp_connections_session_uq
  on public.whatsapp_connections (session_name);

alter table public.whatsapp_connections enable row level security;

-- ============================================================ Kişiler

create table if not exists public.whatsapp_contacts (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,

  -- E.164, artı işaretiyle: +905321234567. Normalizasyon uygulama katmanında
  -- (whatsapp-phone.ts).
  phone_e164       text not null,
  -- WhatsApp'ın sohbet kimliği: 905321234567@c.us. Gönderim adresi budur.
  wa_jid           text not null,
  display_name     text,

  -- Kişi bir Projelio kullanıcısıysa bağlanır; dış kişilerde null kalır.
  user_id          uuid references public.users(id) on delete set null,

  -- 'unknown' = hiç sorulmadı, 'opted_in' = izin verdi, 'opted_out' = çıktı.
  -- Bildirim yalnızca opted_in kişiye gider.
  opt_in_state     text not null default 'unknown'
                     check (opt_in_state in ('unknown', 'opted_in', 'opted_out')),
  -- 'link_code' = kullanıcı eşleştirme koduyla yazdı, 'keyword' = BAŞLAT dedi,
  -- 'admin' = yönetici ekledi.
  opt_in_source    text,
  opt_in_at        timestamptz,
  opt_out_at       timestamptz,

  -- Kişiden gelen SON mesajın anı. Yeni kişiye ilk mesajı biz atmayız: bu alan
  -- boşsa gönderim yapılmaz (WhatsApp'ın "tanımadığın kişiye yazma" kısıtı ve
  -- ban riski). Bkz. docs/whatsapp-qr-plan.md §5.3
  last_inbound_at  timestamptz,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists whatsapp_contacts_org_phone_uq
  on public.whatsapp_contacts (organization_id, phone_e164);

create index if not exists whatsapp_contacts_user_idx
  on public.whatsapp_contacts (user_id) where user_id is not null;

alter table public.whatsapp_contacts enable row level security;

-- ============================================================ Eşleştirme kodları
-- Kullanıcı "WhatsApp'tan bildirim al" deyince üretilir; kullanıcı kodu
-- organizasyonun numarasına mesaj olarak gönderir, webhook kodu tanıyıp kişiyi
-- kullanıcıya bağlar. Ayrı tablo: kullanıcı henüz kişi değilken de var olmalı.

create table if not exists public.whatsapp_link_codes (
  code             text primary key,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  user_id          uuid not null references public.users(id) on delete cascade,
  expires_at       timestamptz not null,
  used_at          timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists whatsapp_link_codes_user_idx
  on public.whatsapp_link_codes (user_id, organization_id);

alter table public.whatsapp_link_codes enable row level security;

-- ============================================================ Konuşmalar

create table if not exists public.whatsapp_threads (
  id                uuid primary key default gen_random_uuid(),
  connection_id     uuid not null references public.whatsapp_connections(id) on delete cascade,
  contact_id        uuid not null references public.whatsapp_contacts(id) on delete cascade,

  last_inbound_at   timestamptz,
  last_outbound_at  timestamptz,
  last_message_at   timestamptz,

  -- İnsan devraldıysa otomatik bildirim gönderme (ileride sohbet ekranı için).
  human_handoff_at  timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists whatsapp_threads_conn_contact_uq
  on public.whatsapp_threads (connection_id, contact_id);

create index if not exists whatsapp_threads_last_message_idx
  on public.whatsapp_threads (last_message_at desc);

alter table public.whatsapp_threads enable row level security;

-- ============================================================ Mesajlar

create table if not exists public.whatsapp_messages (
  id               uuid primary key default gen_random_uuid(),
  thread_id        uuid not null references public.whatsapp_threads(id) on delete cascade,

  direction        text not null check (direction in ('inbound', 'outbound')),

  -- WAHA'nın mesaj kimliği. Giden mesajda gönderim yanıtından, gelen mesajda
  -- webhook'tan. Kuyrukta bekleyen satırda null. Teslimat (ack) olayları bu
  -- kimlikle eşlenir.
  wa_message_id    text,
  body             text,

  -- queued → sending → sent → delivered → read ; failed ; received (gelen)
  status           text not null default 'queued'
                     check (status in ('queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'received')),
  error_code       text,
  error_detail     text,

  -- Aynı olayın iki kez kuyruğa girmesini engeller (ör. notification:<id>).
  dedupe_key       text,
  -- Hangi bildirimden doğdu; bildirim kanalı dışından gönderilen mesajda null.
  notification_id  uuid,

  attempt_count    integer not null default 0,
  next_attempt_at  timestamptz,

  sent_at          timestamptz,
  delivered_at     timestamptz,
  read_at          timestamptz,
  created_at       timestamptz not null default now()
);

create unique index if not exists whatsapp_messages_dedupe_uq
  on public.whatsapp_messages (dedupe_key) where dedupe_key is not null;

create unique index if not exists whatsapp_messages_wa_id_uq
  on public.whatsapp_messages (wa_message_id) where wa_message_id is not null;

-- Kuyruk tarayıcısının baktığı küme: yalnızca bekleyenler.
create index if not exists whatsapp_messages_queue_idx
  on public.whatsapp_messages (next_attempt_at, created_at)
  where status = 'queued';

create index if not exists whatsapp_messages_thread_idx
  on public.whatsapp_messages (thread_id, created_at desc);

alter table public.whatsapp_messages enable row level security;

-- ============================================================ Webhook olayları
-- Ham olay önce buraya yazılır ve WAHA'ya hemen 200 dönülür; işleme sonra.
-- event_id unique: WAHA tekrar denerse ikinci kayıt düşer, olay iki kez
-- işlenmez.

create table if not exists public.whatsapp_webhook_events (
  id            uuid primary key default gen_random_uuid(),
  event_id      text not null unique,
  session_name  text not null,
  event         text not null,
  payload       jsonb not null,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  error         text
);

create index if not exists whatsapp_webhook_events_pending_idx
  on public.whatsapp_webhook_events (received_at)
  where processed_at is null;

alter table public.whatsapp_webhook_events enable row level security;

-- ============================================================ updated_at
-- Repoda updated_at için ortak tetikleyici yok; uygulama katmanı yazıyor.
