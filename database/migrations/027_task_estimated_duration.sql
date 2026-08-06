-- Görevi yapacak kişinin bildirdiği tahmini iş süresi (opsiyonel).
-- Deadline "ne zamana kadar bitmeli"yi, bu ise "ne kadar sürer"i tutar —
-- ikisi birbirinden bağımsızdır. Sayı + birim (saat/gün) olarak saklanır.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_duration_value NUMERIC;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_duration_unit TEXT
  CHECK (estimated_duration_unit IN ('hours', 'days'));

-- Birim değeri olmadan anlamsız kalmasın: biri set edilmişse diğeri de set edilmeli.
-- (Postgre'de ADD CONSTRAINT IF NOT EXISTS desteklenmediği için DO bloğuyla kontrol edilir.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_task_duration_pair'
  ) THEN
    ALTER TABLE tasks ADD CONSTRAINT chk_task_duration_pair
      CHECK (
        (estimated_duration_value IS NULL AND estimated_duration_unit IS NULL)
        OR (estimated_duration_value IS NOT NULL AND estimated_duration_unit IS NOT NULL)
      );
  END IF;
END $$;
