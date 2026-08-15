-- 051_job_member_invitations.sql
-- İşe alma artık bir davettir.
--
-- Önceden iş sahibi birini "İşe al" dediğinde job_members satırı doğrudan
-- açılıyor, kişiye sorulmuyordu: eklenen kullanıcıya yalnızca "Bir işe eklendin."
-- diye kim/hangi iş belirtmeyen bir bildirim gidiyordu. Artık satır 'pending'
-- açılır; kişi kabul edene kadar ne işin dosyalarına erişir ne de iş onun
-- anasayfasındaki "Katıldıklarım" listesine düşer.
--
-- status: pending (yanıt bekliyor) | approved (kabul etti) | rejected (reddetti)
-- invited_by: daveti gönderen kullanıcı — bildirimde "X seni Y işine ekledi"
--             yazabilmek için gerekli.

DO $$
BEGIN
  -- Kolonu yalnızca ilk kurulumda ekle ki migrasyon tekrar çalıştırılırsa
  -- aşağıdaki toplu 'approved' güncellemesi gerçek bekleyen davetleri
  -- sessizce kabul edilmiş saymasın.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'job_members' AND column_name = 'status'
  ) THEN
    ALTER TABLE job_members ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending';
    -- Göç anında var olan üyeler zaten fiilen ekibin içinde; onları bekleme
    -- durumuna düşürmek çalışan ekiplerin erişimini koparırdı.
    UPDATE job_members SET status = 'approved';
  END IF;
END $$;

ALTER TABLE job_members ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE job_members ADD COLUMN IF NOT EXISTS responded_at TIMESTAMP;

ALTER TABLE job_members DROP CONSTRAINT IF EXISTS job_members_status_check;
ALTER TABLE job_members
  ADD CONSTRAINT job_members_status_check CHECK (status IN ('pending', 'approved', 'rejected'));

-- Bekleyen davetleri kullanıcı bazında çekiyoruz (bildirim çanı her açılışta sorar).
CREATE INDEX IF NOT EXISTS idx_job_members_user_status ON job_members(user_id, status);

-- NOT: UNIQUE (job_id, user_id) kısıtı olduğu gibi kalıyor. Reddedilen kayıt
-- silinmediği için (iş sahibi "reddetti" bilgisini görmeli) aynı kişi tekrar
-- davet edildiğinde yeni satır açılmaz; var olan satır 'pending'e döndürülür
-- (bkz. job-members.service.ts hire()).
