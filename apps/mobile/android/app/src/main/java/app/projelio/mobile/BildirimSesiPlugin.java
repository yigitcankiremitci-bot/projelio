package app.projelio.mobile;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bildirim sesi DENEMESİ — Admin > Bildirim sesi sekmesi (yalnızca yönetici).
 *
 * NEDEN VAR: 1.2.0 ile gelen ses bazı Android telefonlarda patlıyor/cızırdıyordu.
 * Düzeltilmiş iki aday (ses2, ses3) var ve hangisinin iyi olduğu ancak gerçek
 * bir telefonda, gerçek bir bildirim olarak duyularak anlaşılır — tarayıcıda
 * ya da bilgisayarda dinlemek hoparlör/ses yolu farklı olduğu için bir şey
 * kanıtlamıyor.
 *
 * NEDEN AYRI KANALLAR: Android 8+ bildirim sesini kanaldan alır ve kanalın sesi
 * yalnızca İLK oluşturmada yazılır (bkz. MainActivity.bildirimKanaliniOlustur).
 * Yani tek bir kanalda sesler arasında geçiş yapılamaz; her aday kendi kanalında.
 *
 * NEDEN BURADA OLUŞTURULUYOR, MainActivity'de değil: deneme kanalları yalnızca
 * yönetici "Bildirim olarak gönder"e bastığında açılıyor. Açılışta açılsalardı
 * HER kullanıcının telefon ayarlarında anlamsız "Ses denemesi" kanalları
 * görünürdü. `temizle` ile silinir.
 *
 * Bildirim sunucudan (FCM) değil, cihazın kendisinden atılır: sesi çalan yol
 * (kanal → sistem bildirim sesi) iki durumda da aynı, ama yerel bildirim
 * internete, FCM anahtarına ve sunucu değişikliğine bağımlı değil.
 *
 * Karar verilince: kazanan dosya res/raw/projelio_bildirim.mp3'ün yerine konur,
 * ana kanal kimliği bir artırılır (_v3) ve sunucudaki BILDIRIM_KANALI de
 * birlikte değişir. Bu eklenti ve deneme dosyaları o zaman kaldırılabilir.
 */
@CapacitorPlugin(name = "BildirimSesi")
public class BildirimSesiPlugin extends Plugin {
    private static final String KANAL_ONEKI = "projelio_ses_deneme_";
    private static final String[] SESLER = { "mevcut", "ses2", "ses3" };

    private MediaPlayer oynatici;

    /** Aday anahtarı → res/raw kaynağı. Bilinmeyen anahtar 0 döner. */
    private int kaynak(String ses) {
        if ("mevcut".equals(ses)) return R.raw.projelio_bildirim;
        if ("ses2".equals(ses)) return R.raw.projelio_bildirim_ses2;
        if ("ses3".equals(ses)) return R.raw.projelio_bildirim_ses3;
        return 0;
    }

    private Uri sesAdresi(int kaynak) {
        return Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + getContext().getPackageName() + "/" + kaynak);
    }

    /** Bildirim kanalının kullandığıyla aynı ses türü — telefonun bildirim ses düzeyi uygulanır. */
    private AudioAttributes bildirimSesTuru() {
        return new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
    }

    /**
     * Sesi bildirim akışında hemen çalar (bildirim göstermeden). Hızlı
     * karşılaştırma için; kesin karar `bildirimGonder` ile verilmeli.
     */
    @PluginMethod
    public void cal(PluginCall call) {
        int kaynak = kaynak(call.getString("ses"));
        if (kaynak == 0) {
            call.reject("Bilinmeyen ses.");
            return;
        }
        try {
            if (oynatici != null) {
                oynatici.release();
                oynatici = null;
            }
            MediaPlayer mp = new MediaPlayer();
            mp.setAudioAttributes(bildirimSesTuru());
            mp.setDataSource(getContext(), sesAdresi(kaynak));
            mp.setOnCompletionListener(MediaPlayer::release);
            mp.prepare();
            mp.start();
            oynatici = mp;
            call.resolve();
        } catch (Exception e) {
            call.reject("Ses çalınamadı: " + e.getMessage());
        }
    }

    /**
     * Seçilen sesin kanalından GERÇEK bir sistem bildirimi gösterir.
     * `gecikme` (saniye) verilirse o kadar sonra — ekranı kilitleyip ya da
     * uygulamayı arka plana alıp gerçek kullanımdaki gibi duymak için.
     */
    @PluginMethod
    public void bildirimGonder(PluginCall call) {
        String ses = call.getString("ses");
        int kaynak = kaynak(ses);
        if (kaynak == 0) {
            call.reject("Bilinmeyen ses.");
            return;
        }
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            call.reject("Bildirim izni kapalı. Telefon ayarlarından Projelio bildirimlerini açın.");
            return;
        }
        NotificationManager yonetici = ctx.getSystemService(NotificationManager.class);
        if (yonetici == null) {
            call.reject("Bildirim servisi yok.");
            return;
        }

        String kanalKimligi = KANAL_ONEKI + ses;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel kanal = new NotificationChannel(
                kanalKimligi,
                "Ses denemesi — " + ses,
                NotificationManager.IMPORTANCE_HIGH
            );
            kanal.setSound(sesAdresi(kaynak), bildirimSesTuru());
            kanal.enableVibration(true);
            // Zaten varsa hiçbir şeyi değiştirmez; ses dosyası her derlemede
            // aynı kaynak adında kaldığı için sorun değil.
            yonetici.createNotificationChannel(kanal);
        }

        Intent ac = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        PendingIntent dokunus = ac == null ? null : PendingIntent.getActivity(
            ctx, 0, ac, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder bildirim = new NotificationCompat.Builder(ctx, kanalKimligi)
            .setSmallIcon(R.drawable.ic_stat_projelio)
            .setColor(Color.parseColor("#C0813F"))
            .setContentTitle("Ses denemesi: " + ses)
            .setContentText("Bu bildirim " + ses + " sesiyle çalmalıydı.")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            // Android 8 öncesi kanalsız cihazlar için.
            .setSound(sesAdresi(kaynak));
        if (dokunus != null) bildirim.setContentIntent(dokunus);

        int gecikme = Math.max(0, Math.min(60, call.getInt("gecikme", 0)));
        // Her denemenin kimliği ayrı: aynı kimlik "güncelleme" sayılır ve bazı
        // telefonlar güncellenen bildirimde sesi tekrar çalmaz.
        int kimlik = (int) (System.currentTimeMillis() % Integer.MAX_VALUE);
        new Handler(Looper.getMainLooper()).postDelayed(() -> yonetici.notify(kimlik, bildirim.build()), gecikme * 1000L);
        call.resolve();
    }

    /** Deneme kanallarını telefon ayarlarından kaldırır. */
    @PluginMethod
    public void temizle(PluginCall call) {
        NotificationManager yonetici = getContext().getSystemService(NotificationManager.class);
        if (yonetici != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            for (String ses : SESLER) yonetici.deleteNotificationChannel(KANAL_ONEKI + ses);
        }
        call.resolve();
    }
}
