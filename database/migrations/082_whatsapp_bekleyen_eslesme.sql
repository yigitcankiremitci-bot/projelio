-- 082_whatsapp_bekleyen_eslesme.sql
-- Kodsuz eşleşme: Projelio numarasına yazan bir telefon, bir kullanıcının
-- profil telefonuyla (users.phone, onboarding'de girilen) eşleşiyorsa
-- "EVET yazın" denir; EVET gelince kişi o kullanıcıya bağlanır. Aday kullanıcı
-- onaya kadar burada bekler. Bkz. docs/whatsapp-qr-plan.md §13

alter table public.whatsapp_contacts
  add column if not exists pending_user_id uuid references public.users(id) on delete set null,
  add column if not exists pending_since   timestamptz;

comment on column public.whatsapp_contacts.pending_user_id is
  'Profil telefonu eşleşen aday kullanıcı; EVET onayıyla user_id olur (082).';
