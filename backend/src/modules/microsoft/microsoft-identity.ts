import { UnauthorizedException } from "@nestjs/common";

export interface MicrosoftIdentity {
  sub: string;
  email: string;
  name?: string;
  /**
   * Sahipliği Microsoft tarafında KANITLANMIŞ adres; kanıt yoksa undefined.
   *
   * Var olan bir Projelio hesabıyla eşleştirme yalnızca bununla yapılabilir
   * (bkz. MicrosoftAuthService.loginWithMicrosoft). Gerekçesi decodeIdentity'de.
   */
  verifiedEmail?: string;
}

/**
 * Kişisel Microsoft hesaplarının (outlook.com, hotmail.com, live.com) sanal
 * kiracı kimliği. Microsoft'un sabiti; iş/okul kiracılarından ayırmak için.
 */
const PERSONAL_ACCOUNT_TENANT_ID = "9188040d-6c67-4c5b-b112-36a304b66dad";

/**
 * id_token içindeki kimliği okur. Google'daki decodeIdentity ile aynı
 * gerekçe: token doğrudan Microsoft'un token uç noktasından, TLS üzerinden,
 * client_secret'ımızla kimlik doğrulanmış bir istekte alındı — imza
 * doğrulaması gerekmiyor.
 *
 * `verifiedEmail` neden ayrı: Microsoft'ta `email` claim'i Google'daki gibi
 * "doğrulanmış" değildir. İş/okul kiracılarında bu alan kullanıcının `mail`
 * özniteliğinden gelir ve kiracı yöneticisi oraya İSTEDİĞİ adresi (başka
 * birinin Gmail adresi dahil) yazabilir. Kendi kiracısını açan biri bu yolla
 * "ben falanca@gmail.com'um" diyen geçerli bir id_token üretebilirdi; o
 * adresle var olan bir Projelio hesabına bağlanmasına izin verirsek hesap
 * devralınır. Bu yüzden eşleştirmede yalnızca şunlara güveniyoruz:
 *   - kişisel hesaplar: `email` claim'i hesabın kendisidir, Microsoft doğrular
 *   - iş/okul hesapları: `preferred_username` (UPN) — alan adı Azure'da
 *     doğrulanmadan kiracıya eklenemez
 *   - `xms_edov` claim'i true ise: "e-posta alan adının sahipliği doğrulandı"
 *     (uygulama kaydında isteğe bağlı claim olarak açılırsa gelir)
 */
export function decodeMicrosoftIdentity(idToken: string): MicrosoftIdentity {
  const parts = idToken.split(".");
  if (parts.length < 2) throw new UnauthorizedException("Microsoft kimlik bilgisi okunamadı.");

  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  if (!payload?.sub) throw new UnauthorizedException("Microsoft kimlik bilgisi eksik.");

  // Kişisel hesaplarda genelde `email` gelir; bazı iş/okul kiracılarında
  // yalnızca `preferred_username` (genelde UPN, e-posta biçiminde) olabilir.
  const email = payload.email ?? payload.preferred_username;
  if (!email) throw new UnauthorizedException("Microsoft hesabının e-postası alınamadı.");

  const personal = String(payload.tid ?? "") === PERSONAL_ACCOUNT_TENANT_ID;
  const upn = typeof payload.preferred_username === "string" && payload.preferred_username.includes("@")
    ? payload.preferred_username.toLowerCase()
    : undefined;

  let verifiedEmail: string | undefined;
  if (personal && payload.email) verifiedEmail = String(payload.email).toLowerCase();
  else if (payload.xms_edov === true && payload.email) verifiedEmail = String(payload.email).toLowerCase();
  else if (!personal && upn) verifiedEmail = upn;

  return {
    sub: String(payload.sub),
    email: String(email).toLowerCase(),
    name: payload.name ? String(payload.name) : undefined,
    verifiedEmail,
  };
}
