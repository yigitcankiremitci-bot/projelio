import type { ServiceUnlockMethod } from "@projelio/shared";

export const HESAP_KILIT_AMACI = "hesap-kilit";

/** typ, aynı imza anahtarını kullanan oturum doğrulayıcısının bu yükü reddetmesini sağlar. */
export function hesapKilitPayload(userId: string, method: ServiceUnlockMethod) {
  return { sub: userId, typ: HESAP_KILIT_AMACI, amac: HESAP_KILIT_AMACI, method };
}
