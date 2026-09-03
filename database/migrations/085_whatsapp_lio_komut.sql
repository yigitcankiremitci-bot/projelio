-- 085_whatsapp_lio_komut.sql
-- WhatsApp'tan Lio'ya komut: kullanıcı kendi telefonundan "günlük bütçe
-- raporu çıkar" yazınca Lio araçlarıyla cevap üretir ve aynı konuşmaya
-- gönderir. Bkz. docs/whatsapp-lio-komut-plani.md
--
-- Üç ayrı ihtiyaç, üç kolon:
--   1. Konuşma sürekliliği: "peki geçen aya göre?" çalışsın diye WhatsApp
--      thread'i bir Lio sohbetine bağlanır (6 saat sonra yenisi açılır).
--   2. Yazma izni: kullanıcı "yalnızca soruları yanıtla, hiçbir şeyi
--      değiştirme" diyebilsin. Kişi bazında: biri iş ve özel numarasını
--      ayrı bağlarsa ayrı ayarlansın.
--   3. Sessiz saat muafiyeti: kullanıcının KENDİ isteğine cevap gece de
--      gider; sessiz saat istenmeyen bildirimi önlemek için var.

alter table public.whatsapp_threads
  add column if not exists ai_conversation_id uuid references public.ai_conversations(id) on delete set null,
  add column if not exists ai_conversation_at timestamptz;

comment on column public.whatsapp_threads.ai_conversation_id is
  'Bu WhatsApp konuşmasının bağlı olduğu Lio sohbeti; 6 saat sessizlikten sonra yenisi açılır (085).';

alter table public.whatsapp_contacts
  add column if not exists lio_allow_writes boolean not null default true;

comment on column public.whatsapp_contacts.lio_allow_writes is
  'WhatsApp''tan veri değiştirilebilsin mi (görev aç, kayıt güncelle). Kapalıyken Lio yalnızca okur. Silme/bütçe her hâlükârda kapalı (085).';

alter table public.whatsapp_messages
  add column if not exists bypass_quiet_hours boolean not null default false;

comment on column public.whatsapp_messages.bypass_quiet_hours is
  'Kullanıcının kendi isteğine cevap: sessiz saatte de gönderilir. Hacim tavanları yine geçerli (085).';

-- Kuyruk işleyicisi bekleyen mesajları connection + status ile tarıyor;
-- yeni kolon o sorguya girdiği için ek indeks gerekmiyor.
