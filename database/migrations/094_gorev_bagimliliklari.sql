-- 094_gorev_bagimliliklari.sql
-- Görev bağımlılıkları: "şu bitmeden bu başlayamaz".
--
-- SORUN:
--   Sıra bilgisi yalnızca insanların kafasındaydı. Bir görev kartı, hazır
--   olmadığı hâlde panoda "Yapılacak" sütununda duruyor; kime atandıysa o kişi
--   başlıyor, sonra "aa bu daha bitmemiş" diye geri dönüyordu. Alt görev
--   hiyerarşisi bunun yerine geçmiyor: alt görev "parçası", bağımlılık ise
--   "önce gelen" demek — iki ayrı proje ve iki ayrı çıktıdaki görevler de
--   birbirine bağlanabilmeli.
--
-- MODEL:
--   Tek bir kenar tablosu. task_id "bekleyen", depends_on_task_id "beklenen".
--   Yön bilerek bu şekilde: bir görevin neyi beklediği sorusu, bir görevi
--   kimin beklediğinden çok daha sık soruluyor (kart çizilirken her seferinde).
--
-- NEDEN AYRI TABLO (tasks'a bir kolon değil):
--   Bir görev birden fazla şeyi bekleyebilir. Kolon olsaydı ya tek bağımlılıkla
--   sınırlı kalırdık ya da diziyi elle tutup referans bütünlüğünü kaybederdik.
--
-- DÖNGÜ KONTROLÜ ŞEMADA DEĞİL:
--   A→B→C→A gibi bir çevrim veritabanı kısıtıyla engellenemiyor (özyinelemeli
--   bir kontrol gerekir). Kontrol servis katmanında, ekleme anında yapılıyor
--   (bkz. tasks.service.ts addDependency) — çevrim oluşursa iki görev de
--   sonsuza kadar birbirini beklediği için ikisi de hiç başlayamazdı.

create table if not exists public.task_dependencies (
  id uuid primary key default gen_random_uuid(),
  -- Bekleyen görev: bağımlılıkları bitmeden başlayamaz.
  task_id uuid not null references public.tasks(id) on delete cascade,
  -- Beklenen görev.
  depends_on_task_id uuid not null references public.tasks(id) on delete cascade,
  created_at timestamp not null default current_timestamp,
  created_by uuid references public.users(id) on delete set null,

  -- Aynı bağ iki kez kurulmasın: ikinci kayıt hiçbir şey eklemez ama arayüzde
  -- aynı görev iki kez listelenirdi.
  constraint task_dependencies_unique unique (task_id, depends_on_task_id),
  -- Kendi kendini bekleyen görev asla başlayamaz.
  constraint task_dependencies_not_self check (task_id <> depends_on_task_id)
);

-- "Bu görev neyi bekliyor" — kart çizilirken sorulan soru.
create index if not exists task_dependencies_task_id_idx
  on public.task_dependencies (task_id);

-- "Bu görev bitince kim serbest kalır" — tamamlama sonrası bildirim için.
create index if not exists task_dependencies_depends_on_idx
  on public.task_dependencies (depends_on_task_id);

comment on table public.task_dependencies is
  'Gorev bagimliliklari: task_id, depends_on_task_id bitmeden baslayamaz.';
