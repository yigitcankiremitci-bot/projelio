-- Uygulanan migration'ların kaydı.
--
-- NEDEN VAR: bugüne kadar hangi migration'ın canlıda uygulandığı HİÇBİR YERDE
-- yazmıyordu. Migration'lar elle, tek tek uygulanıyor (bkz. CLAUDE.md) ve tek
-- doğrulama aracı `deploy/karsilastir-sema.sh` — o da yalnızca TABLO ADLARINI
-- karşılaştırıyor. Yani `ALTER TABLE ... ADD COLUMN`, yeni indeks, yeni CHECK ya
-- da yeni yetki kuralı içeren bir migration atlandığında karşılaştırma temiz
-- görünüyor: tablo zaten var.
--
-- Somut riski: "062 uygulandı mı?" sorusunun cevabı yoktu. Uygulanmadıysa `anon`
-- rolü hâlâ geniş yetkilere sahip demekti — sessiz bir güvenlik açığı. Aynı
-- şekilde yeni bir kolona bakan backend sürümü canlıya çıkıp migration
-- unutulursa uygulama çalışma anında patlıyor ve dağıtımın sağlık kontrolü bunu
-- yakalayamıyor (yalnızca /health'e bakıyor).
--
-- Bundan sonra migration'lar `deploy/migrate.sh` ile uygulanır; betik her dosyayı
-- tek transaction içinde çalıştırıp buraya bir satır yazar. Zaten uygulanmış
-- olanları atlar, yani tekrar çalıştırmak güvenlidir.

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  -- Dosya adının numara öneki değil, TAM ADI: "060" iki farklı dosyada
  -- kullanılmış durumda (numara çakışmaları için bkz. CLAUDE.md), yalnızca
  -- numarayı saklamak ikisini ayırt edemezdi.
  version     TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Dosyanın SHA-256'sı. Uygulandıktan SONRA değiştirilen bir migration'ı
  -- yakalar: içerik değişmişse aynı ada rağmen başka bir şey çalışmış demektir.
  checksum    TEXT,
  -- Ne kadar sürdü — uzun süren bir migration'ın tekrarında beklenecek süreyi
  -- önceden bilmek, canlıda bakım penceresi planlamayı kolaylaştırıyor.
  duration_ms INTEGER
);

COMMENT ON TABLE public.schema_migrations IS
  'Uygulanan migration dosyaları. deploy/migrate.sh tarafından yazılır; elle düzenlenmez.';

-- Bu tablo yalnızca service_role (backend) ve bakım erişimiyle okunur; genel
-- rollere açılmaz. 062'deki kuralla aynı çizgi: RLS açık, politika yok = RED.
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.schema_migrations FROM anon, authenticated;
