-- Projelio - PayTR Kart Saklama: kullanıcının PayTR'deki kart kimliği (utoken)
--
-- PayTR Direkt API + Kart Saklama + Non3D yetkileri 2026-09-24'te açıldı.
-- Abonelik yenilemesi saklı karttan Non3D çekimle yapılacak; bunun için
-- kullanıcı başına PayTR'nin verdiği `utoken` saklanmalı.
--
-- KART VERİSİ BURADA YOK. Kart numarası PayTR'de duruyor; utoken yalnızca
-- "bu kullanıcının PayTR'deki kart grubu" kimliği. Kartları (ctoken, son 4
-- hane, require_cvv) her seferinde CAPI LIST ile PayTR'ye soruyoruz — kopyasını
-- tutmak, PayTR'de silinmiş bir karta çekim denemek demek olurdu.
--
-- KULLANICI BAŞINA TEK utoken: PayTR, mevcut utoken gönderilmeden yeni kart
-- saklanırsa YENİ bir utoken üretiyor ve kullanıcının kartları iki gruba
-- bölünüyor. Birincil anahtar user_id olduğu için ikinci satır açılamaz;
-- kod her kart saklama isteğinde var olanı gönderir.
--
-- son_bildirim: kart saklamayla ilgili son PayTR bildiriminin ALAN ADLARI,
-- durumu ve hata mesajı (imza/hash YOK). PayTR dokümanı bildirimde utoken'ın
-- hangi alanla geldiğini açıkça yazmıyor; ilk gerçek denemede neyin geldiğini
-- görebilmek için tutuluyor. utoken henüz yoksa satır yalnızca bu bilgiyle açılır.

CREATE TABLE IF NOT EXISTS paytr_kart_sahipleri (
    user_id      UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    utoken       TEXT UNIQUE,
    son_bildirim JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
