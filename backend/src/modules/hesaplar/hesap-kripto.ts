import { createTokenCrypto } from "../../common/crypto/token-crypto";

/**
 * Hesap giriş bilgilerinin şifreleme anahtarı.
 *
 * NEDEN KENDİ DOSYASINDA: iki servis de buna bakıyor — HesapKimlikService
 * şifreler/çözer, HesaplarService yalnızca "anahtar tanımlı mı" diye sorup
 * arayüze bildiriyor (anahtar yoksa şifre kaydedilemiyor ve bunun sebebi
 * ekranda yazılı olmalı). Servis dosyalarından birine koymak, ikisi arasında
 * döngüsel bir import demekti.
 *
 * SOSYAL MEDYANIN VE JETONLARIN ANAHTARLARINDAN AYRI (createTokenCrypto env
 * adı almasının sebebi bu): biri sızarsa diğeri etkilenmesin, ayrı ayrı
 * döndürülebilsin.
 */
export const hesapKimlikCrypto = createTokenCrypto("HESAP_KIMLIK_ENC_KEY");
