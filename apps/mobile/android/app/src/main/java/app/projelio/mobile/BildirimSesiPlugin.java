package app.projelio.mobile;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Kullanıcının seçtiği bildirim sesi (Ayarlar > Bildirimler).
 *
 * NEDEN HER SES AYRI KANAL: Android 8+ bildirim sesini kanaldan alır ve
 * kanalın sesi yalnızca İLK oluşturmada yazılır; sonradan setSound demek
 * hiçbir şeyi değiştirmez. Sesi değiştirmenin tek yolu başka bir kanala geçmek.
 * Sunucu bildirimi kullanıcının sesinin kanalına gönderir
 * (backend notifications/fcm.ts bildirimKanali).
 *
 * Kanal kimliği = res/raw dosya adı = "projelio_bildirim_<anahtar>"; anahtar
 * listesi packages/shared/src/bildirimSesleri.ts. Burada liste TUTULMUYOR:
 * kaynak adla aranıyor (getIdentifier), yani yeni ses = yeni dosya + ortak
 * listeye bir satır.
 *
 * Telefonun ayarlarında en çok iki kanal görünür: varsayılan ("projelio",
 * manifestin varsayılan kanalı — HİÇ silinmez, çünkü sunucunun gönderdiği kanal
 * telefonda yoksa FCM oraya düşüyor) ve seçili olan. Seçim değişince eskisi
 * silinir.
 *
 * Seçim SharedPreferences'ta da tutulur: uygulama açılırken web yüklenmeden
 * önce kanal hazır olsun (MainActivity.onCreate → kanallariHazirla).
 */
@CapacitorPlugin(name = "BildirimSesi")
public class BildirimSesiPlugin extends Plugin {
    private static final String ONEK = "projelio_bildirim_";
    private static final String VARSAYILAN = "projelio";
    private static final String TERCIH_DOSYASI = "projelio_bildirim_sesi";
    private static final String TERCIH_ANAHTARI = "secili";
    /** 1.4.0 öncesi kanallar: tek sabit sesli kanal (v1, v2) ve 1.4.0 test sürümünün deneme kanalları. */
    private static final String[] ESKI_KANALLAR = { "projelio_bildirimler", "projelio_bildirimler_v2" };
    private static final String ESKI_DENEME_ONEKI = "projelio_ses_deneme_";

    private MediaPlayer oynatici;

    /** Anahtar → res/raw kaynağı; yoksa 0. Anahtar yalnızca küçük harf/rakam olabilir. */
    private static int kaynak(Context ctx, String ses) {
        if (ses == null || !ses.matches("[a-z0-9]{1,32}")) return 0;
        return ctx.getResources().getIdentifier(ONEK + ses, "raw", ctx.getPackageName());
    }

    private static Uri sesAdresi(Context ctx, int kaynak) {
        return Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + ctx.getPackageName() + "/" + kaynak);
    }

    /** Telefonun bildirim ses düzeyi uygulanır (medya düzeyi değil). */
    private static AudioAttributes bildirimSesTuru() {
        return new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
    }

    /**
     * Kanalı açar. Zaten varsa createNotificationChannel hiçbir şeyi
     * değiştirmez (kullanıcının önem/titreşim ayarı korunur) — her açılışta
     * çağırmak güvenli.
     */
    private static void kanalAc(Context ctx, NotificationManager yonetici, String ses, String ad) {
        int k = kaynak(ctx, ses);
        if (k == 0) return;
        NotificationChannel kanal = new NotificationChannel(ONEK + ses, ad, NotificationManager.IMPORTANCE_HIGH);
        kanal.setDescription(ctx.getString(R.string.bildirim_kanali_aciklamasi));
        kanal.setSound(sesAdresi(ctx, k), bildirimSesTuru());
        kanal.enableVibration(true);
        kanal.setShowBadge(true);
        yonetici.createNotificationChannel(kanal);
    }

    private static String kayitliSecim(Context ctx) {
        String s = ctx.getSharedPreferences(TERCIH_DOSYASI, Context.MODE_PRIVATE).getString(TERCIH_ANAHTARI, VARSAYILAN);
        return kaynak(ctx, s) == 0 ? VARSAYILAN : s;
    }

    /**
     * Uygulama açılışında (MainActivity): varsayılan + kayıtlı seçimin kanalı
     * hazır olsun, eskiler silinsin. Kanal ilk bildirim GELMEDEN var olmalı —
     * uygulama kapalıyken bildirimi Android çizer ve o anda JavaScript yok.
     */
    static void kanallariHazirla(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager yonetici = ctx.getSystemService(NotificationManager.class);
        if (yonetici == null) return;
        kanalAc(ctx, yonetici, VARSAYILAN, ctx.getString(R.string.bildirim_kanali_adi));
        String secili = kayitliSecim(ctx);
        // Yalnızca YOKSA: var olan kanalı yeniden açmak adını ezerdi (ad
        // güncellenebilen tek alan) — `sec`in verdiği "Bildirimler · Çan" gibi.
        if (!VARSAYILAN.equals(secili) && yonetici.getNotificationChannel(ONEK + secili) == null) {
            kanalAc(ctx, yonetici, secili, ctx.getString(R.string.bildirim_kanali_adi));
        }
        for (String eski : ESKI_KANALLAR) yonetici.deleteNotificationChannel(eski);
        for (NotificationChannel k : yonetici.getNotificationChannels()) {
            String id = k.getId();
            if (id.startsWith(ESKI_DENEME_ONEKI)) yonetici.deleteNotificationChannel(id);
            else if (id.startsWith(ONEK) && !id.equals(ONEK + VARSAYILAN) && !id.equals(ONEK + secili)) {
                yonetici.deleteNotificationChannel(id);
            }
        }
    }

    /**
     * Seçimi uygular: kanalı açar, öncekini siler, hatırlar. Web her açılışta
     * hesaptaki seçimle çağırır — ses başka bir cihazdan değiştirildiyse bu
     * telefon da böylece eşitlenir.
     */
    @PluginMethod
    public void sec(PluginCall call) {
        Context ctx = getContext();
        String ses = call.getString("ses");
        if (kaynak(ctx, ses) == 0) {
            call.reject("Bilinmeyen ses.");
            return;
        }
        ctx.getSharedPreferences(TERCIH_DOSYASI, Context.MODE_PRIVATE).edit().putString(TERCIH_ANAHTARI, ses).apply();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager yonetici = ctx.getSystemService(NotificationManager.class);
            if (yonetici != null && !VARSAYILAN.equals(ses)) {
                String ad = call.getString("ad");
                String kanalAdi = ctx.getString(R.string.bildirim_kanali_adi) + (ad == null || ad.isEmpty() ? "" : " · " + ad);
                kanalAc(ctx, yonetici, ses, kanalAdi);
            }
            kanallariHazirla(ctx);
        }
        call.resolve();
    }

    /** Sesi bildirim ses düzeyinde hemen çalar (Ayarlar'daki "Dinle"). */
    @PluginMethod
    public void cal(PluginCall call) {
        Context ctx = getContext();
        int k = kaynak(ctx, call.getString("ses"));
        if (k == 0) {
            call.reject("Bilinmeyen ses.");
            return;
        }
        try {
            if (oynatici != null) oynatici.release();
            MediaPlayer mp = new MediaPlayer();
            mp.setAudioAttributes(bildirimSesTuru());
            mp.setDataSource(ctx, sesAdresi(ctx, k));
            mp.prepare();
            mp.start();
            oynatici = mp;
            call.resolve();
        } catch (Exception e) {
            call.reject("Ses çalınamadı.");
        }
    }

    /**
     * Seçili sesin kanalından bir deneme bildirimi gösterir — kullanıcı sesi
     * gerçek bildirim olarak (telefonun bildirim ayarlarıyla) duysun.
     */
    @PluginMethod
    public void denemeBildirimi(PluginCall call) {
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            call.reject("Bildirim izni kapalı.");
            return;
        }
        NotificationManager yonetici = ctx.getSystemService(NotificationManager.class);
        if (yonetici == null) {
            call.reject("Bildirim gösterilemedi.");
            return;
        }
        String ses = kayitliSecim(ctx);
        kanallariHazirla(ctx);

        Intent ac = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        PendingIntent dokunus = ac == null ? null : PendingIntent.getActivity(
            ctx, 0, ac, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, ONEK + ses)
            .setSmallIcon(R.drawable.ic_stat_projelio)
            .setColor(Color.parseColor("#C0813F"))
            .setContentTitle(call.getString("baslik", "Projelio"))
            .setContentText(call.getString("metin", ""))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            // Android 8 öncesi kanalsız cihazlar için.
            .setSound(sesAdresi(ctx, kaynak(ctx, ses)));
        if (dokunus != null) b.setContentIntent(dokunus);
        // Her deneme ayrı kimlik: aynı kimlik "güncelleme" sayılır ve bazı
        // telefonlar güncellenen bildirimde sesi tekrar çalmıyor.
        yonetici.notify((int) (System.currentTimeMillis() % Integer.MAX_VALUE), b.build());
        call.resolve();
    }
}
