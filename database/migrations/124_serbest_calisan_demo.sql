-- 124: Serbest çalışan demo hesabı — Oliver Hayes (müzik prodüktörü + video editörü)
--
-- NEDEN: Mevcut demo (ceo@celikhan.test) bir ŞİRKET demosu. Serbest çalışan
-- ziyaretçi departman, kadro ve holding ekranlarıyla karşılaşıyordu; kendi
-- durumunu (İşlerim, kendi projeleri, kendi Kasa'sı, Yaptım) göremiyordu.
-- Yabancı test kullanıcıları için de İngilizce içerikli bir hesap gerekiyordu.
--
-- NASIL ÇALIŞIR: Bütün satırlar `ce11f...` kimlikleriyle — şirket demosuyla
-- AYNI `ce11` aralığında. Bu yüzden:
--   • demo korumaları (şifre değiştirme, hesap silme, Lio bakiyesi) kendiliğinden
--     geçerli (common/demo-hesap.ts `ce11` ön ekine bakıyor);
--   • her demo girişindeki sıfırlama bu satırları "ziyaretçi eklemesi" sanıp
--     silmiyor (modules/demo/demo-kapsam.ts).
--
-- ÖNEMLİ — UYGULADIKTAN SONRA: Admin > Demo > "Şu anki hâli kaydet" ile anlık
-- görüntüyü yenile. Yenilenmezse bu satırlar silinmez ama ziyaretçinin
-- yaptığı DEĞİŞİKLİKLER geri alınmaz (anlık görüntüde karşılıkları yok).
--
-- Tarihler uygulandığı güne göre göreli (current_date ± n): takvim ve teslim
-- tarihleri demo açıldığında güncel görünsün diye. Anlık görüntü alınınca
-- o hâliyle donar.
--
-- Tekrar çalıştırılabilir: her insert `on conflict do nothing`. Transaction
-- deploy/migrate.sh'in (--single-transaction); dosyada ayrıca begin/commit yok.
-- Şifre: Freelance2026!  (bcrypt, 12 tur — apps/web/src/lib/demoHesap.ts ile aynı)


-- ─────────────────────────────────────────────────────────────── Kullanıcı
insert into users (id, full_name, email, password_hash, role, username, account_type,
  onboarding_completed_at, title, bio, email_verified_at, sector, team_size, use_cases, onboarding_modules, created_at)
values ('ce11f000-0000-4000-8000-000000000001', 'Oliver Hayes', 'oliver@hayes.test',
  '$2b$12$EFkqtDlDi4.Y0PYKFSMNI.c.dUoMy.5ezo1lVoXpJV4VVI9qAHym6', 'demo', 'oliverhayes', 'freelancer',
  now() - interval '120 days', 'Music Producer & Video Editor',
  'London-born producer and editor working from a small studio in Kadıköy, Istanbul. Mixes records by day, cuts brand films by night.',
  now() - interval '120 days', 'reklam_medya', 'tek_kisi',
  array['proje_yonetimi','gorev_takibi','butce_finans','planlama_takvim'],
  array['crm_musteri','fm_fatura','hud_sozlesme','pd_sosyal_medya','bt_yazilim'],
  now() - interval '120 days')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────── İşler
insert into jobs (id, owner_id, title, description, sort_order, created_at) values
('ce11f001-0000-4000-8000-000000000001', 'ce11f000-0000-4000-8000-000000000001', 'Music Production',
 'Mixing, mastering, scoring and jingles for artists and brands.', 0, now() - interval '110 days'),
('ce11f001-0000-4000-8000-000000000002', 'ce11f000-0000-4000-8000-000000000001', 'Video Editing',
 'Brand campaigns, music videos and event recaps — plus my own YouTube channel.', 1, now() - interval '100 days')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────── Müşteriler (Customers modülü)
insert into party (id, job_id, party_type, display_name, email, website, roles, status, notes, created_by, owner_user_id) values
('ce11f010-0000-4000-8000-000000000001', 'ce11f001-0000-4000-8000-000000000001', 'person', 'Nova Lane', 'hello@novalane.example', 'https://novalane.example', array['customer'], 'active', 'Indie-pop artist from London. Prefers voice notes to email.', 'ce11f000-0000-4000-8000-000000000001', 'ce11f000-0000-4000-8000-000000000001'),
('ce11f010-0000-4000-8000-000000000002', 'ce11f001-0000-4000-8000-000000000001', 'company', 'Brightwater Coffee', 'marketing@brightwater.example', 'https://brightwater.example', array['customer'], 'active', 'Istanbul café chain, 14 branches. Jingle used in store and on Instagram.', 'ce11f000-0000-4000-8000-000000000001', 'ce11f000-0000-4000-8000-000000000001'),
('ce11f010-0000-4000-8000-000000000003', 'ce11f001-0000-4000-8000-000000000001', 'company', 'Harbour Lights Films', 'production@harbourlights.example', null, array['customer'], 'active', 'Short film "The Quiet Harbour" — festival submission in December.', 'ce11f000-0000-4000-8000-000000000001', 'ce11f000-0000-4000-8000-000000000001'),
('ce11f010-0000-4000-8000-000000000004', 'ce11f001-0000-4000-8000-000000000002', 'company', 'Kestrel Running', 'brand@kestrel.example', 'https://kestrel.example', array['customer'], 'active', 'European running brand. Autumn campaign: one hero film + social cutdowns.', 'ce11f000-0000-4000-8000-000000000001', 'ce11f000-0000-4000-8000-000000000001'),
('ce11f010-0000-4000-8000-000000000005', 'ce11f001-0000-4000-8000-000000000002', 'company', 'Atlas Tech Summit', 'events@atlassummit.example', null, array['lead'], 'active', 'Conference recap video — on hold until they confirm the budget.', 'ce11f000-0000-4000-8000-000000000001', 'ce11f000-0000-4000-8000-000000000001'),
('ce11f010-0000-4000-8000-000000000006', 'ce11f001-0000-4000-8000-000000000002', 'person', 'Nova Lane', 'hello@novalane.example', 'https://novalane.example', array['customer'], 'active', 'Music video for the lead single "Midnight Static".', 'ce11f000-0000-4000-8000-000000000001', 'ce11f000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────── Projeler
insert into projects (id, owner_id, job_id, title, description, total_budget, start_date, deadline, status, sort_order, created_at) values
('ce11f002-0000-4000-8000-000000000001', 'ce11f000-0000-4000-8000-000000000001', 'ce11f001-0000-4000-8000-000000000001',
 'Nova Lane — "Midnight Static" EP', 'Mix and master five tracks for Nova Lane''s debut EP. Stems delivered as 24-bit WAVs; release date is fixed with the label.', 96000, current_date - 30, current_date + 24, 'active', 0, now() - interval '32 days'),
('ce11f002-0000-4000-8000-000000000002', 'ce11f000-0000-4000-8000-000000000001', 'ce11f001-0000-4000-8000-000000000001',
 'Brightwater Coffee — Store Jingle', '20-second jingle plus a 6-second sonic logo for stores and Instagram.', 45000, current_date - 70, current_date - 38, 'completed', 1, now() - interval '72 days'),
('ce11f002-0000-4000-8000-000000000003', 'ce11f000-0000-4000-8000-000000000001', 'ce11f001-0000-4000-8000-000000000001',
 'Film Score — "The Quiet Harbour"', 'Original score for a 14-minute short film. Piano, strings and field recordings from the Bosphorus.', 75000, current_date - 12, current_date + 55, 'active', 2, now() - interval '14 days'),
('ce11f002-0000-4000-8000-000000000004', 'ce11f000-0000-4000-8000-000000000001', 'ce11f001-0000-4000-8000-000000000002',
 'Kestrel Running — Autumn Campaign', 'One 60-second hero film and three social cutdowns from two days of footage.', 120000, current_date - 20, current_date + 10, 'active', 0, now() - interval '22 days'),
('ce11f002-0000-4000-8000-000000000005', 'ce11f000-0000-4000-8000-000000000001', 'ce11f001-0000-4000-8000-000000000002',
 'Nova Lane — "Midnight Static" Music Video', 'Edit and colour grade for the lead single. Performance and night-city B-roll.', 54000, current_date - 5, current_date + 30, 'active', 1, now() - interval '6 days'),
('ce11f002-0000-4000-8000-000000000006', 'ce11f000-0000-4000-8000-000000000001', 'ce11f001-0000-4000-8000-000000000002',
 'Atlas Tech Summit — Recap Video', 'Three-minute recap of the two-day conference. Waiting for the client to confirm the budget.', 60000, current_date + 14, current_date + 45, 'on_hold', 2, now() - interval '4 days')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────── Çıktılar
insert into outputs (id, project_id, title, description, sort_order) values
('ce11f003-0000-4000-8000-000000000001', 'ce11f002-0000-4000-8000-000000000001', 'Track 1 — Midnight Static', 'Lead single. Mix must be signed off first — the video is cut to it.', 0),
('ce11f003-0000-4000-8000-000000000002', 'ce11f002-0000-4000-8000-000000000001', 'Track 2 — Paper Planes', null, 1),
('ce11f003-0000-4000-8000-000000000003', 'ce11f002-0000-4000-8000-000000000001', 'Track 3 — Neon Rain', null, 2),
('ce11f003-0000-4000-8000-000000000004', 'ce11f002-0000-4000-8000-000000000001', 'EP master & delivery', 'Loudness-matched masters, instrumentals and stems for the label.', 3),
('ce11f003-0000-4000-8000-000000000005', 'ce11f002-0000-4000-8000-000000000004', 'Hero film (60s)', null, 0),
('ce11f003-0000-4000-8000-000000000006', 'ce11f002-0000-4000-8000-000000000004', 'Social cutdowns (3 × 15s)', '9:16 for Reels/TikTok, 1:1 for the feed.', 1)
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────── Görevler
-- Kolon sırası: id, project_id, output_id, parent_task_id, title, description, status, priority,
-- start_date, deadline, deadline_time, estimated_duration_value, estimated_duration_unit, sort_order, completed_at
insert into tasks (id, project_id, output_id, parent_task_id, assigned_to, title, description, status, priority,
  start_date, deadline, deadline_time, estimated_duration_value, estimated_duration_unit, sort_order, completed_at, completed_by) values
-- EP
('ce11f004-0000-4000-8000-000000000001', 'ce11f002-0000-4000-8000-000000000001', 'ce11f003-0000-4000-8000-000000000001', null, 'ce11f000-0000-4000-8000-000000000001',
 'Mix "Midnight Static"', 'Drums are too bright in the chorus — Nova wants more weight on the bass synth.', 'completed', 3, current_date - 20, current_date - 9, '18:00', 6, 'hours', 0, now() - interval '9 days', 'ce11f000-0000-4000-8000-000000000001'),
('ce11f004-0000-4000-8000-000000000002', 'ce11f002-0000-4000-8000-000000000001', 'ce11f003-0000-4000-8000-000000000001', null, 'ce11f000-0000-4000-8000-000000000001',
 'Vocal tuning & comping', null, 'completed', 2, current_date - 22, current_date - 14, null, 3, 'hours', 1, now() - interval '14 days', 'ce11f000-0000-4000-8000-000000000001'),
('ce11f004-0000-4000-8000-000000000003', 'ce11f002-0000-4000-8000-000000000001', 'ce11f003-0000-4000-8000-000000000002', null, 'ce11f000-0000-4000-8000-000000000001',
 'Mix "Paper Planes"', 'Rough mix sent. Waiting on the new guitar take from Deniz.', 'in_progress', 3, current_date - 4, current_date + 3, '17:00', 5, 'hours', 0, null, null),
('ce11f004-0000-4000-8000-000000000004', 'ce11f002-0000-4000-8000-000000000001', 'ce11f003-0000-4000-8000-000000000002', null, 'ce11f000-0000-4000-8000-000000000001',
 'Record session guitar (Deniz)', 'Two hours at the studio. Bring the Telecaster and the tape delay.', 'todo', 2, current_date + 1, current_date + 1, '14:00', 2, 'hours', 1, null, null),
('ce11f004-0000-4000-8000-000000000005', 'ce11f002-0000-4000-8000-000000000001', 'ce11f003-0000-4000-8000-000000000003', null, 'ce11f000-0000-4000-8000-000000000001',
 'Mix "Neon Rain"', null, 'todo', 2, current_date + 4, current_date + 9, '18:00', 5, 'hours', 0, null, null),
('ce11f004-0000-4000-8000-000000000006', 'ce11f002-0000-4000-8000-000000000001', 'ce11f003-0000-4000-8000-000000000004', null, 'ce11f000-0000-4000-8000-000000000001',
 'Master the EP', 'Target −9 LUFS integrated for streaming; keep the dynamics on "Neon Rain".', 'todo', 4, current_date + 15, current_date + 20, '12:00', 1, 'days', 0, null, null),
('ce11f004-0000-4000-8000-000000000007', 'ce11f002-0000-4000-8000-000000000001', 'ce11f003-0000-4000-8000-000000000004', null, 'ce11f000-0000-4000-8000-000000000001',
 'Deliver stems & instrumentals to the label', null, 'todo', 3, current_date + 21, current_date + 24, '10:00', 2, 'hours', 1, null, null),
-- Jingle (tamamlandı)
('ce11f004-0000-4000-8000-000000000008', 'ce11f002-0000-4000-8000-000000000002', null, null, 'ce11f000-0000-4000-8000-000000000001',
 'Write three jingle demos', null, 'completed', 2, current_date - 68, current_date - 60, null, 1, 'days', 0, now() - interval '60 days', 'ce11f000-0000-4000-8000-000000000001'),
('ce11f004-0000-4000-8000-000000000009', 'ce11f002-0000-4000-8000-000000000002', null, null, 'ce11f000-0000-4000-8000-000000000001',
 'Final mix + 6-second sonic logo', null, 'completed', 3, current_date - 50, current_date - 40, null, 4, 'hours', 1, now() - interval '40 days', 'ce11f000-0000-4000-8000-000000000001'),
-- Film müziği
('ce11f004-0000-4000-8000-000000000010', 'ce11f002-0000-4000-8000-000000000003', null, null, 'ce11f000-0000-4000-8000-000000000001',
 'Spotting session with the director', 'Mark every cue on the timeline — 9 cues in the current cut.', 'completed', 3, current_date - 10, current_date - 8, '11:00', 2, 'hours', 0, now() - interval '8 days', 'ce11f000-0000-4000-8000-000000000001'),
('ce11f004-0000-4000-8000-000000000011', 'ce11f002-0000-4000-8000-000000000003', null, null, 'ce11f000-0000-4000-8000-000000000001',
 'Record ferry & harbour field recordings', 'Early morning, Kadıköy–Karaköy ferry. Zoom H6 + windshield.', 'in_progress', 2, current_date - 2, current_date + 2, '08:00', 3, 'hours', 1, null, null),
('ce11f004-0000-4000-8000-000000000012', 'ce11f002-0000-4000-8000-000000000003', null, null, 'ce11f000-0000-4000-8000-000000000001',
 'Compose main theme', null, 'todo', 4, current_date + 3, current_date + 14, null, 2, 'days', 2, null, null),
-- Kestrel
('ce11f004-0000-4000-8000-000000000013', 'ce11f002-0000-4000-8000-000000000004', 'ce11f003-0000-4000-8000-000000000005', null, 'ce11f000-0000-4000-8000-000000000001',
 'Assemble hero film rough cut', null, 'completed', 3, current_date - 15, current_date - 6, null, 1, 'days', 0, now() - interval '6 days', 'ce11f000-0000-4000-8000-000000000001'),
('ce11f004-0000-4000-8000-000000000014', 'ce11f002-0000-4000-8000-000000000004', 'ce11f003-0000-4000-8000-000000000005', null, 'ce11f000-0000-4000-8000-000000000001',
 'Apply client notes (round 2)', 'Shorter opening, swap the finish-line shot, logo two seconds earlier.', 'in_progress', 5, current_date - 1, current_date + 2, '16:00', 4, 'hours', 1, null, null),
('ce11f004-0000-4000-8000-000000000015', 'ce11f002-0000-4000-8000-000000000004', 'ce11f003-0000-4000-8000-000000000005', null, 'ce11f000-0000-4000-8000-000000000001',
 'Colour grade & sound mix', null, 'todo', 3, current_date + 3, current_date + 6, null, 1, 'days', 2, null, null),
('ce11f004-0000-4000-8000-000000000016', 'ce11f002-0000-4000-8000-000000000004', 'ce11f003-0000-4000-8000-000000000006', null, 'ce11f000-0000-4000-8000-000000000001',
 'Cut three 15-second versions', null, 'todo', 3, current_date + 6, current_date + 9, '18:00', 5, 'hours', 0, null, null),
('ce11f004-0000-4000-8000-000000000017', 'ce11f002-0000-4000-8000-000000000004', 'ce11f003-0000-4000-8000-000000000006', null, 'ce11f000-0000-4000-8000-000000000001',
 'Export 9:16 and 1:1 deliverables', null, 'todo', 2, current_date + 9, current_date + 10, '12:00', 1, 'hours', 1, null, null),
-- Klip
('ce11f004-0000-4000-8000-000000000018', 'ce11f002-0000-4000-8000-000000000005', null, null, 'ce11f000-0000-4000-8000-000000000001',
 'Sync performance takes to the final mix', null, 'in_progress', 3, current_date - 3, current_date + 4, null, 3, 'hours', 0, null, null),
('ce11f004-0000-4000-8000-000000000019', 'ce11f002-0000-4000-8000-000000000005', null, null, 'ce11f000-0000-4000-8000-000000000001',
 'Select night-city B-roll', null, 'todo', 1, current_date + 4, current_date + 8, null, 2, 'hours', 1, null, null),
('ce11f004-0000-4000-8000-000000000020', 'ce11f002-0000-4000-8000-000000000005', null, null, 'ce11f000-0000-4000-8000-000000000001',
 'First full edit for Nova', null, 'todo', 3, current_date + 8, current_date + 18, '19:00', 2, 'days', 2, null, null),
-- Atlas (beklemede)
('ce11f004-0000-4000-8000-000000000021', 'ce11f002-0000-4000-8000-000000000006', null, null, 'ce11f000-0000-4000-8000-000000000001',
 'Send quote and shooting plan', null, 'completed', 2, current_date - 4, current_date - 3, null, 1, 'hours', 0, now() - interval '3 days', 'ce11f000-0000-4000-8000-000000000001'),
('ce11f004-0000-4000-8000-000000000022', 'ce11f002-0000-4000-8000-000000000006', null, null, 'ce11f000-0000-4000-8000-000000000001',
 'Follow up on budget approval', null, 'todo', 1, current_date + 5, current_date + 7, '10:00', 15, 'minutes', 1, null, null)
on conflict (id) do nothing;

-- Alt görevler
insert into tasks (id, project_id, parent_task_id, assigned_to, title, status, priority, deadline, sort_order, completed_at, completed_by) values
('ce11f004-0000-4000-8000-000000000101', 'ce11f002-0000-4000-8000-000000000001', 'ce11f004-0000-4000-8000-000000000003', 'ce11f000-0000-4000-8000-000000000001', 'Balance drums and bass', 'completed', 0, current_date + 3, 0, now() - interval '2 days', 'ce11f000-0000-4000-8000-000000000001'),
('ce11f004-0000-4000-8000-000000000102', 'ce11f002-0000-4000-8000-000000000001', 'ce11f004-0000-4000-8000-000000000003', 'ce11f000-0000-4000-8000-000000000001', 'Vocal chain & de-essing', 'in_progress', 0, current_date + 3, 1, null, null),
('ce11f004-0000-4000-8000-000000000103', 'ce11f002-0000-4000-8000-000000000001', 'ce11f004-0000-4000-8000-000000000003', 'ce11f000-0000-4000-8000-000000000001', 'Print mix + instrumental', 'todo', 0, current_date + 3, 2, null, null),
('ce11f004-0000-4000-8000-000000000104', 'ce11f002-0000-4000-8000-000000000004', 'ce11f004-0000-4000-8000-000000000014', 'ce11f000-0000-4000-8000-000000000001', 'Trim the opening to 4 seconds', 'completed', 0, current_date + 2, 0, now() - interval '1 day', 'ce11f000-0000-4000-8000-000000000001'),
('ce11f004-0000-4000-8000-000000000105', 'ce11f002-0000-4000-8000-000000000004', 'ce11f004-0000-4000-8000-000000000014', 'ce11f000-0000-4000-8000-000000000001', 'Swap the finish-line shot', 'todo', 0, current_date + 2, 1, null, null),
('ce11f004-0000-4000-8000-000000000106', 'ce11f002-0000-4000-8000-000000000004', 'ce11f004-0000-4000-8000-000000000014', 'ce11f000-0000-4000-8000-000000000001', 'Move the logo reveal earlier', 'todo', 0, current_date + 2, 2, null, null)
on conflict (id) do nothing;

-- Atamalar (Yapılacaklar > İş görevlerim buradan okuyor, bkz. 055)
insert into task_assignees (id, task_id, user_id, assigned_by)
select ('ce11f005-0000-4000-8000-' || lpad(right(t.id::text, 12), 12, '0'))::uuid, t.id,
       'ce11f000-0000-4000-8000-000000000001', 'ce11f000-0000-4000-8000-000000000001'
from tasks t
where t.id::text like 'ce11f004-%'
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────── Rutinler
insert into operations (id, owner_id, job_id, title, description, status, started_on, budget_per_period, budget_period, timezone, sort_order) values
('ce11f006-0000-4000-8000-000000000001', 'ce11f000-0000-4000-8000-000000000001', 'ce11f001-0000-4000-8000-000000000002',
 'Studio Diaries — YouTube Channel', 'Weekly behind-the-scenes videos from the studio. Keeps new clients coming in.', 'active', current_date - 90, 0, 'monthly', 'Europe/Istanbul', 0),
('ce11f006-0000-4000-8000-000000000002', 'ce11f000-0000-4000-8000-000000000001', 'ce11f001-0000-4000-8000-000000000001',
 'Studio Admin', 'The unglamorous bit: invoices, backups and gear upkeep.', 'active', current_date - 100, 0, 'monthly', 'Europe/Istanbul', 1)
on conflict (id) do nothing;

-- Tekrarlar tetikleyiciyle (operation_routines_resync) üretiliyor; kimlikleri
-- rastgele ve anlık görüntüye bilerek alınmıyor (bkz. demo-anlik-goruntu.service.ts).
insert into operation_routines (id, operation_id, title, description, default_assignee, freq, interval_n, byweekday, bymonthday, starts_on, due_time, generate_ahead_days, sort_order) values
('ce11f007-0000-4000-8000-000000000001', 'ce11f006-0000-4000-8000-000000000001', 'Publish the weekly video', 'Edit, thumbnail, title, upload. Goes live Friday 18:00.', 'ce11f000-0000-4000-8000-000000000001', 'weekly', 1, array[5]::smallint[], null, current_date - 28, '18:00', 30, 0),
('ce11f007-0000-4000-8000-000000000002', 'ce11f006-0000-4000-8000-000000000001', 'Post two Shorts', 'Cut two vertical clips from the week''s video.', 'ce11f000-0000-4000-8000-000000000001', 'weekly', 1, array[2]::smallint[], null, current_date - 28, '12:00', 30, 1),
('ce11f007-0000-4000-8000-000000000003', 'ce11f006-0000-4000-8000-000000000002', 'Send invoices & chase late payments', null, 'ce11f000-0000-4000-8000-000000000001', 'monthly', 1, null, array[1]::smallint[], current_date - 60, '10:00', 45, 0),
('ce11f007-0000-4000-8000-000000000004', 'ce11f006-0000-4000-8000-000000000002', 'Back up project drives', 'Mirror the RAID to the offsite drive.', 'ce11f000-0000-4000-8000-000000000001', 'weekly', 1, array[0]::smallint[], null, current_date - 60, '20:00', 30, 1)
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────── Modüller (iş başına)
insert into job_modules (id, job_id, module_key) values
('ce11f008-0000-4000-8000-000000000001', 'ce11f001-0000-4000-8000-000000000001', 'crm_musteri'),
('ce11f008-0000-4000-8000-000000000002', 'ce11f001-0000-4000-8000-000000000001', 'fm_fatura'),
('ce11f008-0000-4000-8000-000000000003', 'ce11f001-0000-4000-8000-000000000001', 'hud_sozlesme'),
('ce11f008-0000-4000-8000-000000000004', 'ce11f001-0000-4000-8000-000000000001', 'hud_marka_patent_telif'),
('ce11f008-0000-4000-8000-000000000005', 'ce11f001-0000-4000-8000-000000000001', 'bt_yazilim'),
('ce11f008-0000-4000-8000-000000000006', 'ce11f001-0000-4000-8000-000000000002', 'crm_musteri'),
('ce11f008-0000-4000-8000-000000000007', 'ce11f001-0000-4000-8000-000000000002', 'fm_fatura'),
('ce11f008-0000-4000-8000-000000000008', 'ce11f001-0000-4000-8000-000000000002', 'pd_sosyal_medya'),
('ce11f008-0000-4000-8000-000000000009', 'ce11f001-0000-4000-8000-000000000002', 'bt_yazilim')
on conflict (id) do nothing;

insert into module_records (id, job_id, module_key, data, created_by, created_at) values
-- Faturalar
('ce11f009-0000-4000-8000-000000000001', 'ce11f001-0000-4000-8000-000000000001', 'fm_fatura',
 jsonb_build_object('direction','issued','counterpartyName','ce11f010-0000-4000-8000-000000000001','invoiceNo','OH-2026-031','amount',1600,'currency','EUR','status','paid','issueDate',(current_date - 28)::text), 'ce11f000-0000-4000-8000-000000000001', now() - interval '28 days'),
('ce11f009-0000-4000-8000-000000000002', 'ce11f001-0000-4000-8000-000000000001', 'fm_fatura',
 jsonb_build_object('direction','issued','counterpartyName','ce11f010-0000-4000-8000-000000000002','invoiceNo','OH-2026-027','amount',45000,'currency','TRY','status','paid','issueDate',(current_date - 38)::text), 'ce11f000-0000-4000-8000-000000000001', now() - interval '38 days'),
('ce11f009-0000-4000-8000-000000000003', 'ce11f001-0000-4000-8000-000000000001', 'fm_fatura',
 jsonb_build_object('direction','issued','counterpartyName','ce11f010-0000-4000-8000-000000000003','invoiceNo','OH-2026-034','amount',1250,'currency','EUR','status','pending','issueDate',(current_date - 9)::text), 'ce11f000-0000-4000-8000-000000000001', now() - interval '9 days'),
('ce11f009-0000-4000-8000-000000000004', 'ce11f001-0000-4000-8000-000000000002', 'fm_fatura',
 jsonb_build_object('direction','issued','counterpartyName','ce11f010-0000-4000-8000-000000000004','invoiceNo','OH-2026-033','amount',2000,'currency','EUR','status','paid','issueDate',(current_date - 18)::text), 'ce11f000-0000-4000-8000-000000000001', now() - interval '18 days'),
('ce11f009-0000-4000-8000-000000000005', 'ce11f001-0000-4000-8000-000000000002', 'fm_fatura',
 jsonb_build_object('direction','received','counterpartyName','Adobe','invoiceNo','ADB-88213','amount',59.99,'currency','EUR','status','paid','issueDate',(current_date - 21)::text), 'ce11f000-0000-4000-8000-000000000001', now() - interval '21 days'),
-- Sözleşmeler
('ce11f009-0000-4000-8000-000000000011', 'ce11f001-0000-4000-8000-000000000001', 'hud_sozlesme',
 jsonb_build_object('counterpartyName','ce11f010-0000-4000-8000-000000000001','contractType','Mixing & mastering agreement','startDate',(current_date - 30)::text,'endDate',(current_date + 60)::text,'status','active'), 'ce11f000-0000-4000-8000-000000000001', now() - interval '30 days'),
('ce11f009-0000-4000-8000-000000000012', 'ce11f001-0000-4000-8000-000000000001', 'hud_sozlesme',
 jsonb_build_object('counterpartyName','ce11f010-0000-4000-8000-000000000003','contractType','Score licence (festival + online)','startDate',(current_date - 12)::text,'endDate',(current_date + 1080)::text,'status','active'), 'ce11f000-0000-4000-8000-000000000001', now() - interval '12 days'),
-- Telif
('ce11f009-0000-4000-8000-000000000021', 'ce11f001-0000-4000-8000-000000000001', 'hud_marka_patent_telif',
 jsonb_build_object('title','"Midnight Static" (composition, co-write)','ipType','copyright','registrationNo','PRS 7731-0042','applicationDate',(current_date - 25)::text,'status','registered'), 'ce11f000-0000-4000-8000-000000000001', now() - interval '25 days'),
('ce11f009-0000-4000-8000-000000000022', 'ce11f001-0000-4000-8000-000000000001', 'hud_marka_patent_telif',
 jsonb_build_object('title','Brightwater sonic logo','ipType','copyright','applicationDate',(current_date - 36)::text,'status','applied'), 'ce11f000-0000-4000-8000-000000000001', now() - interval '36 days'),
-- Yazılım envanteri
('ce11f009-0000-4000-8000-000000000031', 'ce11f001-0000-4000-8000-000000000001', 'bt_yazilim',
 jsonb_build_object('toolName','Ableton Live Suite','vendor','Ableton','licenseType','Perpetual','status','active'), 'ce11f000-0000-4000-8000-000000000001', now() - interval '100 days'),
('ce11f009-0000-4000-8000-000000000032', 'ce11f001-0000-4000-8000-000000000001', 'bt_yazilim',
 jsonb_build_object('toolName','Splice Sounds','vendor','Splice','licenseType','Monthly','renewalDate',(current_date + 9)::text,'status','active'), 'ce11f000-0000-4000-8000-000000000001', now() - interval '90 days'),
('ce11f009-0000-4000-8000-000000000033', 'ce11f001-0000-4000-8000-000000000001', 'bt_yazilim',
 jsonb_build_object('toolName','iZotope Ozone 11','vendor','iZotope','licenseType','Perpetual','status','active'), 'ce11f000-0000-4000-8000-000000000001', now() - interval '80 days'),
('ce11f009-0000-4000-8000-000000000034', 'ce11f001-0000-4000-8000-000000000002', 'bt_yazilim',
 jsonb_build_object('toolName','Adobe Creative Cloud','vendor','Adobe','licenseType','Monthly','renewalDate',(current_date + 9)::text,'status','active'), 'ce11f000-0000-4000-8000-000000000001', now() - interval '95 days'),
('ce11f009-0000-4000-8000-000000000035', 'ce11f001-0000-4000-8000-000000000002', 'bt_yazilim',
 jsonb_build_object('toolName','DaVinci Resolve Studio','vendor','Blackmagic Design','licenseType','Perpetual','status','active'), 'ce11f000-0000-4000-8000-000000000001', now() - interval '95 days'),
('ce11f009-0000-4000-8000-000000000036', 'ce11f001-0000-4000-8000-000000000002', 'bt_yazilim',
 jsonb_build_object('toolName','Frame.io','vendor','Adobe','licenseType','Yearly','renewalDate',(current_date + 3)::text,'status','expiring'), 'ce11f000-0000-4000-8000-000000000001', now() - interval '60 days')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────── Sosyal medya (Video Editing işi)
insert into social_accounts (id, job_id, platform, handle, display_name, profile_url, follower_count, audience_note, tone_note, posting_frequency, owner_user_id, created_by) values
('ce11f011-0000-4000-8000-000000000001', 'ce11f001-0000-4000-8000-000000000002', 'youtube', 'studiodiaries', 'Studio Diaries', 'https://youtube.com/@studiodiaries', 8400, 'Home-studio producers and editors, 18–34.', 'Relaxed, a bit nerdy, always show the settings.', 'Weekly', 'ce11f000-0000-4000-8000-000000000001', 'ce11f000-0000-4000-8000-000000000001'),
('ce11f011-0000-4000-8000-000000000002', 'ce11f001-0000-4000-8000-000000000002', 'instagram', 'oliverhayes.sound', 'Oliver Hayes', 'https://instagram.com/oliverhayes.sound', 3150, 'Artists and brand marketers in Istanbul and London.', 'Short, visual, before/after.', '3× a week', 'ce11f000-0000-4000-8000-000000000001', 'ce11f000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into social_posts (id, job_id, title, caption, hashtags, content_type, status, scheduled_at, published_at, assignee_id, created_by, reach, engagement) values
('ce11f012-0000-4000-8000-000000000001', 'ce11f001-0000-4000-8000-000000000002', 'Mixing a debut EP — episode 12',
 'How I get a chorus to lift without turning everything up. Full session breakdown.', '#mixing #musicproduction #ableton', 'video', 'published', null, now() - interval '4 days', 'ce11f000-0000-4000-8000-000000000001', 'ce11f000-0000-4000-8000-000000000001', 5200, 410),
('ce11f012-0000-4000-8000-000000000002', 'ce11f001-0000-4000-8000-000000000002', 'Before/after: Kestrel colour grade',
 'Flat log footage to final grade in 30 seconds.', '#colorgrading #davinciresolve', 'reel', 'scheduled', (current_date + 2)::timestamp + time '18:00', null, 'ce11f000-0000-4000-8000-000000000001', 'ce11f000-0000-4000-8000-000000000001', null, null),
('ce11f012-0000-4000-8000-000000000003', 'ce11f001-0000-4000-8000-000000000002', 'Recording ferry sounds for a film score',
 null, null, 'video', 'idea', null, null, 'ce11f000-0000-4000-8000-000000000001', 'ce11f000-0000-4000-8000-000000000001', null, null)
on conflict (id) do nothing;

insert into social_post_targets (id, post_id, account_id, status, published_at, publish_at) values
('ce11f013-0000-4000-8000-000000000001', 'ce11f012-0000-4000-8000-000000000001', 'ce11f011-0000-4000-8000-000000000001', 'published', now() - interval '4 days', null),
('ce11f013-0000-4000-8000-000000000002', 'ce11f012-0000-4000-8000-000000000002', 'ce11f011-0000-4000-8000-000000000002', 'scheduled', null, (current_date + 2)::timestamp + time '18:00')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────── Kasa
insert into recurring_payments (id, owner_id, job_id, project_id, type, amount, currency, description, category, "interval", next_due_date, anchor_day, reminder_days_before) values
('ce11f014-0000-4000-8000-000000000001', 'ce11f000-0000-4000-8000-000000000001', null, null, 'expense', 18000, 'TRY', 'Studio rent — Kadıköy', 'Rent', 'monthly', (date_trunc('month', current_date) + interval '1 month')::date, 1, 3),
('ce11f014-0000-4000-8000-000000000002', 'ce11f000-0000-4000-8000-000000000001', 'ce11f001-0000-4000-8000-000000000002', null, 'expense', 59.99, 'EUR', 'Adobe Creative Cloud', 'Software', 'monthly', current_date + 9, null, 1),
('ce11f014-0000-4000-8000-000000000003', 'ce11f000-0000-4000-8000-000000000001', 'ce11f001-0000-4000-8000-000000000001', null, 'expense', 12.99, 'USD', 'Splice Sounds', 'Software', 'monthly', current_date + 9, null, 1)
on conflict (id) do nothing;

-- Bir satır yalnızca TEK kademeye ait (budget_tx_single_parent): proje, iş ya da hiçbiri.
insert into budget_transactions (id, owner_id, created_by, project_id, job_id, type, amount, currency, description, category, occurred_at, counterparty_id, source) values
('ce11f015-0000-4000-8000-000000000001', 'ce11f000-0000-4000-8000-000000000001', 'ce11f000-0000-4000-8000-000000000001', 'ce11f002-0000-4000-8000-000000000001', null, 'income', 1600, 'EUR', 'EP deposit (50%)', 'Client payment', current_date - 26, 'ce11f010-0000-4000-8000-000000000001', 'manual'),
('ce11f015-0000-4000-8000-000000000002', 'ce11f000-0000-4000-8000-000000000001', 'ce11f000-0000-4000-8000-000000000001', 'ce11f002-0000-4000-8000-000000000001', null, 'payout', 4500, 'TRY', 'Session guitar — Deniz (first day)', 'Session musician', current_date - 12, null, 'manual'),
('ce11f015-0000-4000-8000-000000000003', 'ce11f000-0000-4000-8000-000000000001', 'ce11f000-0000-4000-8000-000000000001', 'ce11f002-0000-4000-8000-000000000002', null, 'income', 45000, 'TRY', 'Brightwater jingle — final payment', 'Client payment', current_date - 35, 'ce11f010-0000-4000-8000-000000000002', 'manual'),
('ce11f015-0000-4000-8000-000000000004', 'ce11f000-0000-4000-8000-000000000001', 'ce11f000-0000-4000-8000-000000000001', 'ce11f002-0000-4000-8000-000000000004', null, 'income', 2000, 'EUR', 'Kestrel campaign — first half', 'Client payment', current_date - 16, 'ce11f010-0000-4000-8000-000000000004', 'manual'),
('ce11f015-0000-4000-8000-000000000005', 'ce11f000-0000-4000-8000-000000000001', 'ce11f000-0000-4000-8000-000000000001', 'ce11f002-0000-4000-8000-000000000004', null, 'expense', 3200, 'TRY', 'Music licence for the hero film', 'Licensing', current_date - 8, null, 'manual'),
('ce11f015-0000-4000-8000-000000000006', 'ce11f000-0000-4000-8000-000000000001', 'ce11f000-0000-4000-8000-000000000001', 'ce11f002-0000-4000-8000-000000000003', null, 'expense', 2600, 'TRY', 'Hydrophone rental (field recordings)', 'Equipment', current_date - 3, null, 'manual'),
('ce11f015-0000-4000-8000-000000000007', 'ce11f000-0000-4000-8000-000000000001', 'ce11f000-0000-4000-8000-000000000001', null, 'ce11f001-0000-4000-8000-000000000002', 'expense', 59.99, 'EUR', 'Adobe Creative Cloud', 'Software', current_date - 21, null, 'manual'),
('ce11f015-0000-4000-8000-000000000008', 'ce11f000-0000-4000-8000-000000000001', 'ce11f000-0000-4000-8000-000000000001', null, 'ce11f001-0000-4000-8000-000000000001', 'expense', 12.99, 'USD', 'Splice Sounds', 'Software', current_date - 21, null, 'manual'),
('ce11f015-0000-4000-8000-000000000009', 'ce11f000-0000-4000-8000-000000000001', 'ce11f000-0000-4000-8000-000000000001', null, 'ce11f001-0000-4000-8000-000000000001', 'expense', 14500, 'TRY', 'New studio monitors (used pair)', 'Equipment', current_date - 44, null, 'manual'),
('ce11f015-0000-4000-8000-000000000010', 'ce11f000-0000-4000-8000-000000000001', 'ce11f000-0000-4000-8000-000000000001', null, null, 'expense', 18000, 'TRY', 'Studio rent — Kadıköy', 'Rent', date_trunc('month', current_date)::date, null, 'manual'),
('ce11f015-0000-4000-8000-000000000011', 'ce11f000-0000-4000-8000-000000000001', 'ce11f000-0000-4000-8000-000000000001', null, null, 'income', 7800, 'TRY', 'YouTube AdSense — last month', 'Channel revenue', current_date - 15, null, 'manual')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────── Yapılacaklar (kişisel)
insert into personal_todos (id, user_id, title, description, status, priority, due_date, due_time, sort_order, completed_at) values
('ce11f016-0000-4000-8000-000000000001', 'ce11f000-0000-4000-8000-000000000001', 'Renew residence permit appointment', 'Bring the rental contract and last three bank statements.', 'todo', 4, current_date + 6, '10:30', 0, null),
('ce11f016-0000-4000-8000-000000000002', 'ce11f000-0000-4000-8000-000000000001', 'Quarterly VAT with the accountant', null, 'in_progress', 3, current_date + 4, null, 1, null),
('ce11f016-0000-4000-8000-000000000003', 'ce11f000-0000-4000-8000-000000000001', 'Replace the broken XLR cable', null, 'todo', 1, current_date + 2, null, 2, null),
('ce11f016-0000-4000-8000-000000000004', 'ce11f000-0000-4000-8000-000000000001', 'Update portfolio reel', null, 'completed', 2, current_date - 5, null, 3, now() - interval '5 days')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────── Takvim: odak alanları, hedefler, bloklar
insert into plan_focus_areas (id, user_id, name, color, job_id, sort_order) values
('ce11f017-0000-4000-8000-000000000001', 'ce11f000-0000-4000-8000-000000000001', 'Music production', '#C0813F', 'ce11f001-0000-4000-8000-000000000001', 0),
('ce11f017-0000-4000-8000-000000000002', 'ce11f000-0000-4000-8000-000000000001', 'Video editing', '#5B7FA6', 'ce11f001-0000-4000-8000-000000000002', 1),
('ce11f017-0000-4000-8000-000000000003', 'ce11f000-0000-4000-8000-000000000001', 'Admin & business', '#7A8B6F', null, 2)
on conflict (id) do nothing;

insert into plan_periods (id, user_id, kind, period_start, theme, capacity_minutes, status) values
('ce11f018-0000-4000-8000-000000000001', 'ce11f000-0000-4000-8000-000000000001', 'week', date_trunc('week', current_date)::date,
 'Get Kestrel signed off and the EP mixes locked.', 1800, 'active'),
('ce11f018-0000-4000-8000-000000000002', 'ce11f000-0000-4000-8000-000000000001', 'month', date_trunc('month', current_date)::date,
 'Deliver the EP, start the film score, keep the channel weekly.', null, 'active')
on conflict (id) do nothing;

insert into plan_targets (id, period_id, focus_area_id, title, share_pct, target_count, unit, done_count, sort_order) values
('ce11f019-0000-4000-8000-000000000001', 'ce11f018-0000-4000-8000-000000000001', 'ce11f017-0000-4000-8000-000000000001', null, 45, null, null, 0, 0),
('ce11f019-0000-4000-8000-000000000002', 'ce11f018-0000-4000-8000-000000000001', 'ce11f017-0000-4000-8000-000000000002', null, 40, null, null, 0, 1),
('ce11f019-0000-4000-8000-000000000003', 'ce11f018-0000-4000-8000-000000000001', 'ce11f017-0000-4000-8000-000000000003', null, 15, null, null, 0, 2),
('ce11f019-0000-4000-8000-000000000004', 'ce11f018-0000-4000-8000-000000000001', null, 'YouTube Shorts', null, 2, 'Shorts', 1, 3),
('ce11f019-0000-4000-8000-000000000005', 'ce11f018-0000-4000-8000-000000000002', null, 'EP tracks mixed', null, 5, 'tracks', 1, 0)
on conflict (id) do nothing;

-- Bu haftanın blokları (pazartesiden itibaren). Geçmiş günlerdekiler tamamlandı.
insert into plan_time_blocks (id, user_id, block_date, starts_at, ends_at, title, focus_area_id, task_id, status, completed_at, actual_minutes, sort_order)
select v.id::uuid, 'ce11f000-0000-4000-8000-000000000001', v.gun, v.bas::time, v.bit::time, v.baslik,
       v.odak::uuid, v.gorev::uuid,
       case when v.gun < current_date then 'done' else 'planned' end,
       case when v.gun < current_date then (v.gun::timestamp + v.bit::time) else null end,
       case when v.gun < current_date then v.dk else null end,
       v.sira
from (values
  ('ce11f020-0000-4000-8000-000000000001', date_trunc('week', current_date)::date,     '09:30', '12:30', null, 'ce11f017-0000-4000-8000-000000000001', 'ce11f004-0000-4000-8000-000000000003', 180, 0),
  ('ce11f020-0000-4000-8000-000000000002', date_trunc('week', current_date)::date,     '14:00', '17:00', null, 'ce11f017-0000-4000-8000-000000000002', 'ce11f004-0000-4000-8000-000000000014', 180, 1),
  ('ce11f020-0000-4000-8000-000000000003', date_trunc('week', current_date)::date + 1, '10:00', '11:00', 'Admin: invoices & email', 'ce11f017-0000-4000-8000-000000000003', null, 60, 0),
  ('ce11f020-0000-4000-8000-000000000004', date_trunc('week', current_date)::date + 1, '11:30', '15:30', null, 'ce11f017-0000-4000-8000-000000000002', 'ce11f004-0000-4000-8000-000000000018', 240, 1),
  ('ce11f020-0000-4000-8000-000000000005', date_trunc('week', current_date)::date + 2, '08:00', '10:30', null, 'ce11f017-0000-4000-8000-000000000001', 'ce11f004-0000-4000-8000-000000000011', 150, 0),
  ('ce11f020-0000-4000-8000-000000000006', date_trunc('week', current_date)::date + 2, '13:00', '17:00', null, 'ce11f017-0000-4000-8000-000000000002', 'ce11f004-0000-4000-8000-000000000014', 240, 1),
  ('ce11f020-0000-4000-8000-000000000007', date_trunc('week', current_date)::date + 3, '10:00', '13:00', null, 'ce11f017-0000-4000-8000-000000000001', 'ce11f004-0000-4000-8000-000000000012', 180, 0),
  ('ce11f020-0000-4000-8000-000000000008', date_trunc('week', current_date)::date + 3, '14:00', '16:00', 'Record session guitar with Deniz', 'ce11f017-0000-4000-8000-000000000001', null, 120, 1),
  ('ce11f020-0000-4000-8000-000000000009', date_trunc('week', current_date)::date + 4, '10:00', '14:00', 'Studio Diaries: edit & upload', 'ce11f017-0000-4000-8000-000000000002', null, 240, 0),
  ('ce11f020-0000-4000-8000-000000000010', date_trunc('week', current_date)::date + 4, '15:00', '16:00', 'Weekly review', 'ce11f017-0000-4000-8000-000000000003', null, 60, 1)
) as v(id, gun, bas, bit, baslik, odak, gorev, dk, sira)
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────── Yaptım (iş günlüğü)
insert into work_log_entries (id, user_id, title, note, done_at, duration_minutes, source, target_kind, target_id, target_label, linked_at) values
('ce11f021-0000-4000-8000-000000000001', 'ce11f000-0000-4000-8000-000000000001', 'Balanced drums and bass on "Paper Planes"', 'Parallel compression on the kick fixed the chorus.', now() - interval '2 days', 150, 'manual', 'task', 'ce11f004-0000-4000-8000-000000000003', 'Mix "Paper Planes"', now() - interval '2 days'),
('ce11f021-0000-4000-8000-000000000002', 'ce11f000-0000-4000-8000-000000000001', 'Trimmed the Kestrel opening to 4 seconds', null, now() - interval '1 day', 45, 'manual', 'task', 'ce11f004-0000-4000-8000-000000000014', 'Apply client notes (round 2)', now() - interval '1 day'),
('ce11f021-0000-4000-8000-000000000003', 'ce11f000-0000-4000-8000-000000000001', 'Call with Harbour Lights about the ending cue', 'Director wants silence for the last 20 seconds.', now() - interval '3 days', 30, 'manual', 'project', 'ce11f002-0000-4000-8000-000000000003', 'Film Score — "The Quiet Harbour"', now() - interval '3 days'),
('ce11f021-0000-4000-8000-000000000004', 'ce11f000-0000-4000-8000-000000000001', 'Answered client emails', null, now() - interval '1 day' - interval '3 hours', 25, 'manual', null, null, null, null),
('ce11f021-0000-4000-8000-000000000005', 'ce11f000-0000-4000-8000-000000000001', 'Filmed intro for this week''s Studio Diaries', null, now() - interval '5 hours', 60, 'manual', 'job', 'ce11f001-0000-4000-8000-000000000002', 'Video Editing', now() - interval '5 hours'),
('ce11f021-0000-4000-8000-000000000006', 'ce11f000-0000-4000-8000-000000000001', 'Tested hydrophone at Moda pier', null, now() - interval '4 days', 90, 'manual', null, null, null, null)
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────── Proje akışı (Sosyal sekmesi)
insert into project_posts (id, project_id, user_id, body, created_at) values
('ce11f022-0000-4000-8000-000000000001', 'ce11f002-0000-4000-8000-000000000001', 'ce11f000-0000-4000-8000-000000000001', 'Track 1 signed off by Nova and the label. Moving on to "Paper Planes".', now() - interval '9 days'),
('ce11f022-0000-4000-8000-000000000002', 'ce11f002-0000-4000-8000-000000000004', 'ce11f000-0000-4000-8000-000000000001', 'Round 2 notes are in — mostly pacing. Should be done by Thursday.', now() - interval '1 day')
on conflict (id) do nothing;
