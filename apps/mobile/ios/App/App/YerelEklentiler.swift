import UIKit
import Capacitor
import AuthenticationServices
import CryptoKit

/**
 * Uygulamanın kendi yerel eklentilerini kaydeden ana görünüm.
 *
 * NEDEN: npm paketinden gelmeyen (uygulamanın içinde yazılan) eklentileri
 * Capacitor kendiliğinden bulmaz; burada elle kaydedilir. SceneDelegate
 * CAPBridgeViewController yerine bunu açar. Android'deki karşılığı
 * MainActivity'deki registerPlugin çağrıları.
 */
class ProjelioBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AppleGirisPlugin())
    }
}

/**
 * "Apple ile giriş" — iPhone'un yerel penceresi (AuthenticationServices).
 *
 * Web tarafı: apps/web/src/lib/mobilKabuk.ts kabukAppleIleGiris.
 * Sunucu: backend/src/modules/apple (jetonun imzasını Apple'ın anahtarıyla
 * doğrular, nonce özetini karşılaştırır).
 *
 * Hazır topluluk eklentisi bilerek kullanılmadı: tek bir çağrı için bağımlılık,
 * üstelik Capacitor 8 sürümü yayımlanmamıştı.
 */
@objc(AppleGirisPlugin)
public class AppleGirisPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "AppleGirisPlugin"
    public let jsName = "AppleGiris"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "giris", returnType: CAPPluginReturnPromise)
    ]

    /// Aynı anda tek pencere: ikinci dokunuş öncekinin yanıtını ezmesin.
    private var bekleyen: CAPPluginCall?

    @objc func giris(_ call: CAPPluginCall) {
        guard let nonce = call.getString("nonce"), !nonce.isEmpty else {
            call.reject("nonce gerekli")
            return
        }
        if bekleyen != nil {
            call.reject("Apple ile giriş zaten açık.", "MESGUL")
            return
        }
        bekleyen = call

        let istek = ASAuthorizationAppleIDProvider().createRequest()
        istek.requestedScopes = [.fullName, .email]
        // Apple'a ham değer değil ÖZETİ verilir; sunucu aynı özeti hesaplar
        // (küçük harf hex, apple-kimlik.ts nonceOzeti).
        istek.nonce = SHA256.hash(data: Data(nonce.utf8)).map { String(format: "%02x", $0) }.joined()

        DispatchQueue.main.async {
            let pencere = ASAuthorizationController(authorizationRequests: [istek])
            pencere.delegate = self
            pencere.presentationContextProvider = self
            pencere.performRequests()
        }
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return bridge?.webView?.window ?? ASPresentationAnchor()
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = bekleyen else { return }
        bekleyen = nil
        guard
            let kimlik = authorization.credential as? ASAuthorizationAppleIDCredential,
            let veri = kimlik.identityToken,
            let jeton = String(data: veri, encoding: .utf8)
        else {
            call.reject("Apple giriş jetonu vermedi.")
            return
        }
        // Ad YALNIZCA ilk yetkilendirmede gelir; sonraki girişlerde boş.
        let ad = [kimlik.fullName?.givenName, kimlik.fullName?.familyName]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
        call.resolve(["identityToken": jeton, "adSoyad": ad])
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard let call = bekleyen else { return }
        bekleyen = nil
        if let hata = error as? ASAuthorizationError, hata.code == .canceled {
            // Vazgeçmek hata değil; web tarafı sessizce geri döner.
            call.reject("Vazgeçildi", "IPTAL")
            return
        }
        call.reject(error.localizedDescription, "HATA")
    }
}
