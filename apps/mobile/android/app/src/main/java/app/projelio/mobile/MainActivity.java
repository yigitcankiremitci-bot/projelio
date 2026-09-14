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
        super.onCreate(savedInstanceState);
        EdgeToEdge.enable(this);
    }
}
