-- 047_party_fk_indexes.sql
-- 046'da atlanan iki yabancı anahtar indeksi.
--
-- Neden hepsi değil: indeks bedavaya gelmez, her yazmada güncellenir. Yalnızca
-- gerçek bir sorgu deseni ya da sık bir cascade işlemi olanlar ekleniyor.
--
--   party.parent_party_id     — "bu firmanın şubeleri" sorgusu; ayrıca party
--                               silinirken self-reference taraması yapılıyor.
--   party_activity.user_id    — aktivite tablosu party ailesinin en çok
--                               büyüyecek tablosu; kullanıcı silindiğinde
--                               (on delete set null) indekssiz tam tarama olur.
--
-- Bilerek atlananlar:
--   party.created_by, party.linked_user_id — yalnızca kullanıcı silinirken
--     taranır, sorguda filtre olarak kullanılmıyor. Kullanıcı silme nadir.
--   party.merged_into_id — "bu kayda ne birleştirildi?" sorgusu nadir; kolon
--     zaten party_org_idx/party_job_idx'in WHERE koşulunda geçiyor.

create index if not exists party_parent_idx
  on public.party(parent_party_id) where parent_party_id is not null;

create index if not exists party_activity_user_idx
  on public.party_activity(user_id) where user_id is not null;
