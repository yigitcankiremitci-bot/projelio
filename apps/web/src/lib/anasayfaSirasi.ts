// Şirket anasayfasındaki bölüm sırasının cihazdaki kopyası.
//
// Asıl kayıt hesapta (migration 167, `Organization.viewerHomeSections`) —
// telefonla bilgisayar aynı sırayı görsün diye. Cihazdaki kopya iki iş görür:
// şirket yanıtı gelmeden sayfa doğru sırayla açılır (bölümler yerinden
// zıplamaz) ve sunucu kaydı yoksa (migration uygulanmadan, ya da hesaba
// yazılmadan önce dizilmiş eski sıra) o kullanılır. Kurallar ortak:
// packages/shared anasayfaSirasi.ts.

import { anasayfaSirasiniCoz, type AnasayfaBolumu } from "@projelio/shared";

const PREFIX = "projelio_sirket_anasayfa_sirasi_";

export function getAnasayfaSirasi(organizationId: string): AnasayfaBolumu[] {
  try {
    const raw = localStorage.getItem(`${PREFIX}${organizationId}`);
    return anasayfaSirasiniCoz(raw ? JSON.parse(raw) : []);
  } catch {
    // Bozuk değer ya da kapalı depolama: varsayılan sıra.
    return anasayfaSirasiniCoz([]);
  }
}

export function setAnasayfaSirasi(organizationId: string, sira: AnasayfaBolumu[]) {
  try {
    localStorage.setItem(`${PREFIX}${organizationId}`, JSON.stringify(sira));
  } catch {
    // Yazılamazsa cihaz kopyası olmaz; hesaptaki kayıt yine geçerli.
  }
}
