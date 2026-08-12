import { Link } from "react-router-dom";
import { colors } from "../theme/colors";

/**
 * Herkese açık gizlilik politikası sayfası — giriş gerektirmez.
 *
 * App.tsx içinde `isAuthScreen` listesine dahil edilmiştir; bu sayede
 * token olmadan da görüntülenebilir. Meta (WhatsApp Business Platform)
 * app yayınlarken herkese açık bir gizlilik politikası URL'i zorunlu
 * tuttuğu için bu sayfa gereklidir.
 */
export default function Privacy() {
  const c = colors.light;

  const h2 = {
    color: c.textPrimary,
    fontSize: 19,
    fontWeight: 600,
    margin: "28px 0 8px",
  } as const;

  const p = {
    color: c.textSecondary,
    fontSize: 15.5,
    lineHeight: 1.65,
    margin: "0 0 10px",
  } as const;

  const li = { ...p, margin: "0 0 6px" } as const;

  return (
    <div style={{ minHeight: "100vh", background: c.background, padding: "40px 24px 64px" }}>
      <div
        style={{
          width: "100%",
          maxWidth: 720,
          margin: "0 auto",
          background: c.surface,
          border: `1px solid ${c.border}`,
          borderRadius: 14,
          padding: "40px 36px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <img src="/logo.png" alt="Projelio" style={{ width: 40, height: 40 }} />
          <h1 style={{ color: c.textPrimary, fontSize: 26, fontWeight: 600, margin: 0 }}>
            Gizlilik Politikası
          </h1>
        </div>
        <p style={{ ...p, marginBottom: 0 }}>Son güncelleme: 10 Ağustos 2026</p>

        <h2 style={h2}>1. Kimiz?</h2>
        <p style={p}>
          Projelio, ekiplerin proje ve görevlerini yönetmesini sağlayan bir yazılım hizmetidir.
          Bu politika, Projelio web ve mobil uygulamalarını ve Projelio'nun WhatsApp
          entegrasyonunu kapsar. Veri sorumlusu Projelio'dur; bize{" "}
          <a href="mailto:info@projelio.app" style={{ color: c.primary }}>
            info@projelio.app
          </a>{" "}
          adresinden ulaşabilirsiniz.
        </p>

        <h2 style={h2}>2. Hangi verileri işliyoruz?</h2>
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          <li style={li}>
            <strong>Hesap bilgileri:</strong> ad, soyad, e-posta adresi, şifrenizin geri
            döndürülemez şekilde şifrelenmiş özeti, profil fotoğrafı.
          </li>
          <li style={li}>
            <strong>İçerik verileri:</strong> oluşturduğunuz projeler, görevler, yorumlar,
            dosyalar, takvim kayıtları ve organizasyon/ekip yapınız.
          </li>
          <li style={li}>
            <strong>Kullanım verileri:</strong> oturum açma zamanları, cihaz ve tarayıcı bilgisi,
            IP adresi, hata kayıtları.
          </li>
          <li style={li}>
            <strong>WhatsApp verileri:</strong> entegrasyonu etkinleştirirseniz telefon
            numaranız, bize gönderdiğiniz mesajların içeriği ve mesaj zaman damgaları.
          </li>
        </ul>

        <h2 style={h2}>3. WhatsApp entegrasyonu</h2>
        <p style={p}>
          Projelio'nun asistanı Lio'yu WhatsApp üzerinden kullanmayı seçerseniz, telefon
          numaranız Projelio hesabınıza yalnızca uygulama içinde ürettiğiniz doğrulama koduyla
          bağlanır. Bağlantı kurulmadan hiçbir hesap verinize erişilmez.
        </p>
        <p style={p}>
          Bize WhatsApp'tan gönderdiğiniz mesajları yalnızca talebinizi yerine getirmek için
          işleriz (örneğin görev listenizi göstermek veya bir görevi tamamlandı olarak
          işaretlemek). Lio yalnızca sizin Projelio hesabınızın yetkili olduğu verilere erişir.
          Bağlantıyı istediğiniz zaman uygulama ayarlarından kaldırabilirsiniz.
        </p>
        <p style={p}>
          Mesajlar WhatsApp altyapısı üzerinden iletilir; bu iletim Meta Platforms, Inc.'in
          kendi koşullarına tabidir.
        </p>

        <h2 style={h2}>4. Verileri neden işliyoruz?</h2>
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          <li style={li}>Hizmeti size sunmak ve hesabınızı yönetmek (sözleşmenin ifası).</li>
          <li style={li}>Güvenliği sağlamak, kötüye kullanımı ve dolandırıcılığı önlemek.</li>
          <li style={li}>Hizmeti iyileştirmek, hataları tespit edip gidermek.</li>
          <li style={li}>Yasal yükümlülüklerimizi yerine getirmek.</li>
        </ul>
        <p style={p}>
          Verilerinizi reklam amacıyla kullanmıyor, üçüncü taraflara satmıyoruz.
        </p>

        <h2 style={h2}>5. Kimlerle paylaşıyoruz?</h2>
        <p style={p}>
          Verileri yalnızca hizmeti çalıştırmak için gereken hizmet sağlayıcılarla paylaşırız:
          bulut barındırma ve veritabanı sağlayıcıları, e-posta gönderim servisi, WhatsApp
          mesajlaşması için Meta Platforms, Inc. ve yapay zekâ özellikleri için Anthropic, PBC.
          Bu sağlayıcılar verileri yalnızca bizim adımıza ve talimatlarımız doğrultusunda işler.
          Yasal bir zorunluluk hâlinde yetkili makamlarla paylaşım yapılabilir.
        </p>

        <h2 style={h2}>6. Ne kadar süre saklıyoruz?</h2>
        <p style={p}>
          Hesap ve içerik verilerinizi hesabınız aktif olduğu sürece saklarız. Hesabınızı
          sildiğinizde verileriniz en geç 30 gün içinde kalıcı olarak silinir; yedeklerden
          temizlenmesi 90 günü bulabilir. WhatsApp konuşma kayıtları en fazla 90 gün saklanır.
          Yasal saklama yükümlülüğü bulunan kayıtlar ilgili süre boyunca tutulur.
        </p>

        <h2 style={h2}>7. Haklarınız</h2>
        <p style={p}>
          KVKK ve GDPR kapsamında; verilerinize erişme, düzeltilmesini veya silinmesini isteme,
          işlenmesini kısıtlama, verilerinizi taşınabilir bir formatta alma ve işlemeye itiraz
          etme haklarına sahipsiniz. Taleplerinizi{" "}
          <a href="mailto:info@projelio.app" style={{ color: c.primary }}>
            info@projelio.app
          </a>{" "}
          adresine iletebilirsiniz; en geç 30 gün içinde yanıtlarız.
        </p>

        <h2 style={h2}>8. Güvenlik</h2>
        <p style={p}>
          Veriler aktarım sırasında TLS ile şifrelenir. Şifreler geri döndürülemez şekilde
          saklanır. Erişim yetkileri en az ayrıcalık ilkesine göre sınırlandırılır. Hiçbir
          sistem %100 güvenli değildir; bir veri ihlali durumunda sizi ve yetkili makamları
          mevzuatın öngördüğü süre içinde bilgilendiririz.
        </p>

        <h2 style={h2}>9. Çerezler</h2>
        <p style={p}>
          Oturumunuzu açık tutmak ve tercihlerinizi hatırlamak için tarayıcınızın yerel
          depolamasını kullanırız. Bu veriler reklam veya profilleme amacıyla kullanılmaz.
        </p>

        <h2 style={h2}>10. Çocukların gizliliği</h2>
        <p style={p}>
          Projelio 18 yaşın altındaki kişilere yönelik değildir ve bilerek çocuklardan veri
          toplamayız.
        </p>

        <h2 style={h2}>11. Değişiklikler</h2>
        <p style={p}>
          Bu politikayı güncelleyebiliriz. Önemli değişikliklerde sizi e-posta ile veya
          uygulama içinden bilgilendiririz. Güncel sürüm her zaman bu sayfada yayımlanır.
        </p>

        <div style={{ marginTop: 36, paddingTop: 20, borderTop: `1px solid ${c.border}` }}>
          <Link to="/login" style={{ fontSize: 15.5, color: c.primary }}>
            ← Giriş sayfasına dön
          </Link>
        </div>
      </div>
    </div>
  );
}
