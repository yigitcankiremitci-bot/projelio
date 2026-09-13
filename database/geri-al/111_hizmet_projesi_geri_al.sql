-- 111_hizmet_projesi geri alma. Bayrak kalkınca projeler eskisi gibi işe
-- toplanır; hizmet ödemeleri projede gelir olarak kalır (veri kaybı yok).
alter table public.projects drop column if exists hizmet_projesi;
