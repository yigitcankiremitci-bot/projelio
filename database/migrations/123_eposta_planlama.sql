-- 123 — E-posta gönderimini ileri bir zamana planlamak
--
-- Yönetici taslağı hazırlayıp "yarın sabah gitsin" diyebilmeli. Planlanan
-- kampanya kuyrukta 'bekliyor' durumunda bekler; gönderim turu (dakikada bir)
-- yalnızca zamanı gelmiş olanları alır. Ayrı bir 'planlandi' durumu açılmadı:
-- planlı ve plansız bekleyen kampanyanın tek farkı ne zaman başlayacağı, ve
-- iptal/izleme yolu ikisinde de aynı.
--
-- Alıcı listesi PLANLANDIĞI AN belirlenir ve öyle kalır: "son 14 günde kayıt
-- olanlar" yarın gönderildiğinde bugün sayılan kişilere gider. Yöneticinin
-- onayladığı sayı ile giden sayı ayrışmasın diye.
alter table public.eposta_kampanyalari
  add column if not exists planlanan_at timestamp;

comment on column public.eposta_kampanyalari.planlanan_at is
  'Gonderimin baslayacagi an (UTC). Bos = hemen. Tur yalnizca zamani gelenleri alir.';
