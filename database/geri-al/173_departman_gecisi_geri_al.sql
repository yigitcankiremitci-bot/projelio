-- 173_departman_gecisi geri alma
-- Uygulanmış geçişler GERİ GELMEZ: silinen departmanlar silinmiş, verileri
-- Yönetim'de kalır. Bu betik yalnızca fonksiyonu ve işaret sütununu kaldırır;
-- sütun gidince geçiş penceresi kimseye çıkmaz (sunucu okuyamayınca boş döner).
drop function if exists public.departman_gecisi_uygula(uuid, uuid[], text, uuid);
alter table public.organizations drop column if exists departman_gecisi_at;
