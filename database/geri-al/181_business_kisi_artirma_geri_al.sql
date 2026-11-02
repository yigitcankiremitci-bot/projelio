-- 181_business_kisi_artirma geri alma.
-- 'kisi_artirma' satırı varsa kısıt eklenemez; önce o satırlar incelenmeli.

DROP FUNCTION IF EXISTS ai_add_plan_credits(UUID, NUMERIC, TEXT, TIMESTAMPTZ);

alter table public.paytr_abonelik_odemeleri drop constraint if exists paytr_abonelik_odemeleri_tur_check;
alter table public.paytr_abonelik_odemeleri
  add constraint paytr_abonelik_odemeleri_tur_check
  check (tur in ('ilk', 'yenileme', 'elle', 'kart_degisim'));
