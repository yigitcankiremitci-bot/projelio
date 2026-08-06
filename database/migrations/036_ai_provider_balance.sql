-- Projelio'nun Anthropic hesabına yüklediği gerçek bakiye takibi.
--
-- ai_credit_transactions zaten her AI isteğinin GERÇEK Anthropic maliyetini (cost_usd)
-- kaydediyor. Burada eksik olan tek şey: admin Anthropic konsolunda hesaba bakiye
-- yüklediğinde bunu sisteme bildirebileceği bir yer. Bu ikisi birleşince admin paneli
-- "kalan bakiye" = (yüklenenler toplamı) - (şimdiye kadarki gerçek Anthropic maliyeti)
-- hesaplayıp gösterebiliyor. Anthropic'in kendi bakiyesini okuyan bir API'si olmadığı
-- için bu manuel girişe dayanır; admin gerçekte console.anthropic.com'da ne yüklediyse
-- burada da aynı tutarı girmelidir.

CREATE TABLE IF NOT EXISTS ai_provider_balance_topups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount_usd NUMERIC(12, 2) NOT NULL CHECK (amount_usd > 0),
  description TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_provider_balance_topups_created ON ai_provider_balance_topups(created_at DESC);

ALTER TABLE ai_provider_balance_topups ENABLE ROW LEVEL SECURITY;
