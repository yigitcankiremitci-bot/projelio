package app.projelio.mobile;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ContentResolver;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;

import androidx.activity.EdgeToEdge;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /**
     * Edge-to-edge (uygulamanın durum ve gezinme çubuklarının ALTINA da
     * çizmesi) Android 15'ten beri zaten zorunlu ve targetSdk 36'da devre dışı
     * bırakılamıyor. Burada açıkça etkinleştirilmesinin sebebi
     * @capacitor-community/safe-area eklentisi: eklenti güvenli alan
     * paylarını ancak bu modda doğru hesaplıyor.
     *
     * Payı web tarafı `env(safe-area-inset-*)` ile kullanıyor
     * (bkz. apps/web/src/lib/layout.ts SAFE_TOP). Düzeltmenin webde olmasının
     * sebebi: üst şeritteki her şey position:fixed, yani kabuğun WebView'e
     * dolgu vermesi onları kurtarmıyor.
     *
     * DENENDİ VE OLMADI — saat/pil/gezinme çizgisinin rengi buradan
     * ayarlanamıyor. Üçü de denendi, üçü de etkisiz kaldı (emülatörde
     * ölçüldü): EdgeToEdge.enable'a SystemBarStyle.dark vermek, eklentinin
     * SafeArea.statusBarStyle ayarı ve temadaki windowLightStatusBar. Renk
     * CİHAZIN karanlık/aydınlık moduna göre belirleniyor. Cihaz aydınlık
     * moddayken uygulamanın koyu teması üzerinde simgeler siyah kalıyor.
     * Çözümü eklentinin çalışma anı API'si (SystemBars.setStyle) ama o,
     * apps/web'e Capacitor'a özel bir dallanma koymayı gerektiriyor —
     * karar verilmeden eklenmedi.
     */
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        EdgeToEdge.enable(this);
        bildirimKanaliniOlustur();
    }

    /**
     * Bildirim kanalı — Android 8+ kanalsız bildirimi göstermez ya da
     * "Diğer" adlı düşük öncelikli bir kanala atar: ses yok, ekranın üstünde
     * açılan uyarı (heads-up) yok. Kullanıcıların "bildirim geliyor ama fark
     * etmiyorum" şikâyetinin kaynağı bu.
     *
     * NEDEN BURADA, web'de değil: kanal ilk bildirim GELMEDEN var olmalı.
     * Uygulama kapalıyken gelen bildirimi Android kendisi çizer ve o anda
     * hiçbir JavaScript çalışmaz; kanal yoksa manifestteki varsayılan kimlik
     * boşa düşer.
     *
     * IMPORTANCE_HIGH yalnızca İLK oluşturmada geçerli: kanal bir kez
     * yaratıldıktan sonra önemini yalnızca kullanıcı değiştirebilir ve tekrar
     * çağırmak onun ayarını ezmez. Yani bunu her açılışta çağırmak güvenli.
     *
     * SES: kanalın sesi de önemi gibi yalnızca İLK oluşturmada yazılır. Projelio
     * sesi (res/raw/projelio_bildirim) eklendiğinde eski kanal varsayılan sesle
     * zaten yaratılmıştı; üstüne setSound demek hiçbir şeyi değiştirmezdi. Bu
     * yüzden kimlik değişti (strings.xml, sonuna _v2) ve eski kanal silinir ki
     * ayarlarda iki "Bildirimler" görünmesin. Sesi bir daha değiştirmek = yine
     * yeni kimlik; sunucudaki BILDIRIM_KANALI de birlikte değişmeli.
     */
    private void bildirimKanaliniOlustur() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager yonetici = getSystemService(NotificationManager.class);
        if (yonetici == null) return;
        NotificationChannel kanal = new NotificationChannel(
            getString(R.string.bildirim_kanali_kimligi),
            getString(R.string.bildirim_kanali_adi),
            NotificationManager.IMPORTANCE_HIGH
        );
        kanal.setDescription(getString(R.string.bildirim_kanali_aciklamasi));
        Uri ses = Uri.parse(
            ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + getPackageName() + "/" + R.raw.projelio_bildirim
        );
        kanal.setSound(
            ses,
            new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
        );
        kanal.enableVibration(true);
        kanal.setShowBadge(true);
        yonetici.createNotificationChannel(kanal);
        // 1.2.0 ve öncesinin kanalı (varsayılan sesli).
        yonetici.deleteNotificationChannel("projelio_bildirimler");
    }
}
