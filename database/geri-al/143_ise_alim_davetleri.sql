-- 143_ise_alim_davetleri.sql geri alma.
-- Kabul edilmiş davetlerin kadro/modül satırları department_members ve
-- module_members'ta kalır — onlar artık gerçek üyelik, davet kaydı değil.
drop table if exists public.ise_alim_davetleri;
