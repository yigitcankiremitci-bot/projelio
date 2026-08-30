-- 077_paylasim_linki_eposta_kapisi.sql
-- Paylaşım linkine e-posta kapısı
--
-- NEDEN: token tek başına "linki ELİNDE TUTAN herkes görür" demek. Link bir
-- WhatsApp grubuna düşerse ya da yanlış kişiye iletilirse sahibin haberi bile
-- olmuyor. Alıcının e-postasını sormak bunu tamamen engellemez ama linki
-- iletmeyi bilinçli bir eyleme dönüştürür: iletilen kişi de aynı adresi
-- bilmek zorunda.
--
-- BU BİR KİMLİK DOĞRULAMASI DEĞİL. E-posta doğrulanmıyor, kod gönderilmiyor;
-- adresi bilen herkes geçer. Gerçek koruma hâlâ token'ın tahmin edilemezliği.
-- Kapı, kazayla yayılmaya karşı; kararlı bir saldırgana karşı değil.
-- Bu yüzden 054'teki "link bir yetki değil, bir penceredir" kuralı sürüyor.
--
-- KİŞİSEL VERİ: buradaki adres Projelio kullanıcısı OLMAYAN birine ait.
-- Yalnızca linki oluşturan proje sahibine gösterilir, hiçbir public yanıta
-- konmaz ve loglara yazılmaz (bkz. ProjectSharesService.resolve).

alter table public.project_share_links
  add column if not exists recipient_email varchar(160);

comment on column public.project_share_links.recipient_email is
  'Linki acacak kisinin e-postasi. Bosca link dogrudan acilir. Kimlik dogrulamasi DEGIL: adresi bilen gecer. Public yanitlara konmaz.';

-- Projenin tamamlanması linki kapatıyor (bkz. shareLinkClosedReason). Bu
-- KOLONLA DEĞİL, okuma anında projenin durumuna bakılarak karar veriliyor:
-- proje yeniden açılırsa link de kendiliğinden çalışsın, sahibin linki tek tek
-- yeniden üretmesi gerekmesin. Bu yüzden burada yeni bir sütun yok.
