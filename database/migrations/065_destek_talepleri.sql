-- 065_destek_talepleri.sql
-- Destek: kullanıcıdan yöneticiye tek yönlü talep + tek yanıt
--
-- NE YAPIYOR
-- ----------
-- Kullanıcı Ayarlar > Destek'ten öneri/dilek/şikâyet bırakır; talep admin
-- panelindeki destek panosuna düşer. Admin yanıtladığında kullanıcıya bildirim
-- gider (bkz. notifications, type = 'support_reply').
--
-- NEDEN AYRI TABLO (mesajlaşma değil)
-- -----------------------------------
-- Bu bir sohbet DEĞİL: bir talep, bir yanıt. Genel bir mesajlaşma tablosu
-- kurmak okunmamış sayacı, katılımcı listesi, sıralama ve yetki kuralları
-- getirirdi; hiçbirine ihtiyaç yok. İleride karşılıklı yazışma gerekirse
-- support_messages diye ayrı bir tablo eklenir, bu tablo talebin başlığı olarak
-- kalır.
--
-- NEDEN `name` SÜTUNU VAR
-- -----------------------
-- Kullanıcı adı zaten users tablosunda duruyor ama form kendi "isim" alanını
-- soruyor: kişi talebi başkası adına (ör. ekip arkadaşı için) bırakabiliyor ve
-- yanıtın kime hitap edeceğini kendisi belirliyor. Kimin YAZDIĞI ise her zaman
-- user_id'de — o alan forma güvenmez.
--
-- SİLME DAVRANIŞI
-- ---------------
-- Kullanıcı silinirse talepleri de silinir (ON DELETE CASCADE): talep kişiseldir,
-- sahibi gidince saklamanın bir değeri yok. Yanıtlayan admin silinirse talep
-- durur, yalnızca replied_by boşalır (SET NULL) — yanıt metni kaybolmamalı.

CREATE TABLE IF NOT EXISTS support_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Formda yazılan ad. Kimin yazdığının kaynağı değil (bkz. yukarıdaki not).
  name        TEXT NOT NULL,
  subject     TEXT NOT NULL,
  message     TEXT NOT NULL,
  -- 'open'     — panoda bekliyor
  -- 'answered' — admin yanıtladı, kullanıcıya bildirim gitti
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered')),
  reply       TEXT,
  replied_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  replied_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Panonun varsayılan sorgusu: önce bekleyenler, içinde en yeniden eskiye.
CREATE INDEX IF NOT EXISTS support_requests_status_created_idx
  ON support_requests (status, created_at DESC);

-- "Benim taleplerim" listesi.
CREATE INDEX IF NOT EXISTS support_requests_user_idx
  ON support_requests (user_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- Erişim kuralları — bkz. 062_veritabani_izin_kurallari.sql
-- ----------------------------------------------------------------------------
-- RLS AÇIK, POLİTİKA YOK => varsayılan RED. Bu bilinçli: Projelio Supabase Auth
-- kullanmıyor, kimlik doğrulama uygulama katmanında (kendi JWT'si). Bu
-- veritabanında auth.uid() her zaman NULL döndüğü için ona dayanan bir politika
-- hiçbir şey korumaz, yalnızca "RLS'imiz var" yanılsaması verirdi.
--
-- Backend service_role ile bağlanır (BYPASSRLS), yani uygulama etkilenmez.
-- Bunun tek işi şu soruyu kapatmak: "biri publishable (anon) anahtarla
-- doğrudan Supabase REST'e giderse ne olur?" Cevap: hiçbir şey.
--
-- İkinci katman (anon/authenticated GRANT'lerinin geri alınması) bu tablo için
-- KENDİLİĞİNDEN geçerli: 062'nin 3. bölümü ALTER DEFAULT PRIVILEGES ile
-- bundan sonra oluşan tabloları da kapsıyor. Yine de ikisi tek başına geri
-- alınabilir olduğu için burada revoke da açıkça yazılıyor.
--
-- FORCE ROW LEVEL SECURITY kullanılmıyor (nedeni 062'de: SECURITY DEFINER
-- tetikleyiciler kendi tablolarını okuyamaz hale gelirdi).
ALTER TABLE support_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON support_requests FROM anon, authenticated;
