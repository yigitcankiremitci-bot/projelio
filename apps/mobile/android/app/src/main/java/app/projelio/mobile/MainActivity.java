package app.projelio.mobile;

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
        // Uygulamanın kendi eklentileri super.onCreate'ten ÖNCE kaydedilmeli:
        // köprü orada kuruluyor, sonra eklenen eklentiyi web tarafı görmez.
        registerPlugin(BildirimSesiPlugin.class);
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
     * 1.4.0'dan beri kanal kullanıcının seçtiği SESE göre (her ses ayrı kanal,
     * çünkü kanalın sesi sonradan değişmiyor) — ayrıntı BildirimSesiPlugin'de.
     * Eski tek kanal (projelio_bildirimler_v2) ve sesi orada siliniyor: o ses
     * telefon hoparlöründe cızırdıyordu.
     */
    private void bildirimKanaliniOlustur() {
        BildirimSesiPlugin.kanallariHazirla(this);
    }
}
