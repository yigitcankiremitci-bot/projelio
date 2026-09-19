import type { Locale } from "@projelio/shared";
import { cevirmen } from "../../common/i18n";

/**
 * Örnek işin İÇERİĞİ — yeni üyenin hesabına açılan eğitici kartlar (bkz.
 * migration 118, ornek-is.service.ts).
 *
 * Trello'nun örnek panosundaki fikir: kullanıcıya boş bir ekran ve bir
 * kılavuz vermek yerine, KENDİSİ kurcalayabileceği gerçek kayıtlar vermek.
 * Her kartın başlığı bir eylem ("Beni tamamlandı olarak işaretle"),
 * açıklaması o eylemin neyi öğrettiği. Kayıtlar gerçek iş/proje/görev/rutin
 * satırları; yani öğrenilen şey, kullanıcının kendi işinde kullanacağı
 * ekranın ta kendisi.
 *
 * NEDEN SAF DOSYA: içerik, tarihler kullanıcının "bugün"üne göre dağıtılıyor
 * ve metinler dile göre çevriliyor. İkisi de veritabanına dokunmadan test
 * edilebilir olmalı — bir tarih kaydığında örnek görevlerin hepsi "gecikmiş"
 * görünür ve yeni üyenin ilk gördüğü şey kırmızı bir liste olur.
 *
 * TARİHLER "bugün + N gün": kartlar ilk girişte bugün, yarın ve önümüzdeki
 * günlere yayılıyor ki Yapılacaklar, takvim ve sabah özeti boş görünmesin.
 */

export interface OrnekGorev {
  baslik: string;
  aciklama: string;
  durum: "todo" | "in_progress" | "completed";
  /** Bugünden kaç gün sonra biter (0 = bugün). */
  gunSonra: number;
  /** "10:00" — saatli görev örneği için. */
  saat?: string;
  altGorevler?: { baslik: string; durum: "todo" | "completed" }[];
}

export interface OrnekRutin {
  baslik: string;
  aciklama: string;
  freq: "weekly" | "monthly";
  /** Haftalık için 0=Pazar..6=Cumartesi. */
  byWeekday?: number[];
  /** Aylık için ayın günü. */
  byMonthDay?: number[];
  dueTime: string;
}

export interface OrnekIcerik {
  is: { baslik: string; aciklama: string };
  proje: { baslik: string; aciklama: string; gunSonra: number };
  gorevler: OrnekGorev[];
  rutinProgrami: { baslik: string; aciklama: string };
  rutinler: OrnekRutin[];
}

/**
 * Hangi örnek: hesap tipine göre anlatılan şey değişiyor.
 *   bireysel — serbest çalışan ve şirket çalışanı: iş → proje → görev
 *   sirket   — şirket/işletme ve holding sahibi: departman, kadro, kademeli bütçe
 *   taseron  — bir şirkete hizmet veren: kendisine açılan modül ve görevler
 */
export type OrnekTur = "bireysel" | "sirket" | "taseron";

export function ornekTuru(hesapTipi: string | null | undefined): OrnekTur {
  if (hesapTipi === "organization_owner" || hesapTipi === "group_owner") return "sirket";
  if (hesapTipi === "subcontractor") return "taseron";
  return "bireysel";
}

// dil:anahtar-baslangic — örnek iş metinleri: çeviri içerik üretilirken yapılıyor.
const BIREYSEL: OrnekIcerik = {
  is: {
    baslik: "🎓 Projelio'yu tanı (örnek)",
    aciklama:
      "Bu örnek iş, Projelio'nun nasıl çalıştığını göstermek için hazırlandı. İçindeki proje, görevler ve rutin gerçek kayıtlar: aç, düzenle, tamamla, taşı — hiçbir şey bozulmaz. İşin bitince bu sayfadaki \"Örnekleri sil\" düğmesiyle hepsini tek tıkla kaldırabilirsin.",
  },
  proje: {
    baslik: "Örnek proje: Web sitesi yenileme",
    aciklama:
      "Proje, başı ve sonu olan bir çalışmadır: bir teslim tarihi, bir bütçesi ve bir görev listesi vardır. Bir işin altında istediğin kadar proje açabilirsin. Görevleri sırayla aç ve açıklamalarındaki adımları dene.",
    gunSonra: 14,
  },
  gorevler: [
    {
      baslik: "1 · Buradan başla: bu bir görev kartı",
      aciklama:
        "Projelio'da her şey bir katman düzeninde durur: İŞ (müşteri, şirket ya da girişimin) → PROJE (başı sonu olan çalışma) → GÖREV (yapılacak tek bir şey) → ALT GÖREV (görevin parçaları).\n\nŞu an bir görevin içindesin. Başlığı, açıklamayı, tarihi değiştirebilirsin. Sonraki kartlara geç ve her birinde yazanı dene.",
      durum: "in_progress",
      gunSonra: 0,
    },
    {
      baslik: "2 · Beni tamamlandı olarak işaretle",
      aciklama:
        "Bir görevi bitirdiğinde tamamlandı olarak işaretle. Tamamlanan görevler listeden ayrılır ama kaybolmaz; projenin ilerlemesi de buna göre güncellenir.\n\nHadi dene: bu görevi şimdi tamamla.",
      durum: "todo",
      gunSonra: 0,
    },
    {
      baslik: "3 · Büyük işi alt görevlere böl",
      aciklama:
        "Bu görevin içinde üç alt görev var; biri zaten tamamlanmış. Alt görevler, büyük bir işi başlanabilir parçalara bölmenin yolu. Kalan ikisini de tamamla ya da kendi alt görevini ekle.",
      durum: "todo",
      gunSonra: 2,
      altGorevler: [
        { baslik: "Sayfa metinlerini topla", durum: "completed" },
        { baslik: "Görselleri seç", durum: "todo" },
        { baslik: "Yayına hazırla", durum: "todo" },
      ],
    },
    {
      baslik: "4 · Bitiş tarihi ve saat ver",
      aciklama:
        "Bu görevin yarın saat 10:00'da bitmesi gerekiyor. Saatli görevlere vaktinden önce hatırlatma kurabilirsin.\n\nTarihi olan görevler Yapılacaklar sayfasında, takvimde ve her sabah gelen özet e-postasında görünür. Tarihi değiştirip nereye taşındığına bak.",
      durum: "todo",
      gunSonra: 1,
      saat: "10:00", // dil:atla
    },
    {
      baslik: "5 · Görevi birine ata",
      aciklama:
        "Bu görev sana atanmış. Gerçek bir işte, işe ekip arkadaşlarını ekleyip görevleri onlara atayabilirsin; atadığın kişiye bildirim gider ve görev onun Yapılacaklar listesine düşer.\n\nBir görevin birden fazla kişiye atanması da mümkün.",
      durum: "todo",
      gunSonra: 3,
    },
    {
      baslik: "6 · Lio'ya bir şey yaptır",
      aciklama:
        "Sağ alttaki Lio, Projelio'nun yapay zekâ yardımcısı. Ona düz cümlelerle yaz: \"Örnek projeye 'iletişim formunu test et' diye bir görev ekle\" ya da \"bu hafta neler var?\".\n\nLio'yu Cmd/Ctrl + K ile de açabilirsin.",
      durum: "todo",
      gunSonra: 4,
    },
    {
      baslik: "7 · Yaptım'a bugün ne yaptığını yaz",
      aciklama:
        "Yaptım, kişisel iş günlüğün: planlı görevlerin dışında kalan işleri de kaydetmenin yeri. Menüden Yaptım'ı aç ve bugün yaptığın bir işi yaz; istersen kronometreyle süresini tut.",
      durum: "todo",
      gunSonra: 5,
    },
    {
      baslik: "Örnek: tamamlanmış bir görev",
      aciklama:
        "Tamamlanan görevler böyle görünür. Yanlışlıkla tamamladıysan geri açabilirsin.",
      durum: "completed",
      gunSonra: 0,
    },
    {
      baslik: "Son adım · Örnekleri sil ve kendi işini aç",
      aciklama:
        "Hepsi bu kadar! Artık kendi işini açmaya hazırsın.\n\nBu işin sayfasındaki \"Örnekleri sil\" düğmesi bu işi, projeyi, görevleri ve rutini birlikte kaldırır. Kendi açtığın işlere dokunmaz. Örnekleri daha sonra yeniden görmek istersen Ayarlar > Yardımcılar'dan tekrar ekleyebilirsin.",
      durum: "todo",
      gunSonra: 7,
    },
  ],
  rutinProgrami: {
    baslik: "Örnek rutin: Haftalık düzen",
    aciklama:
      "Rutin, bitiş tarihi olmayan, tekrar eden işlerin yeridir: haftalık rapor, aylık fatura kontrolü gibi. Kuralı bir kez yazarsın; Projelio görevleri vakti gelince kendisi açar ve hangilerini kaçırdığını gösterir.",
  },
  rutinler: [
    {
      baslik: "Haftalık durum raporu hazırla",
      aciklama: "Her pazartesi saat 10:00'da açılan örnek bir rutin görevi. Tekrar kuralını değiştirmeyi dene.",
      freq: "weekly",
      byWeekday: [1],
      dueTime: "10:00", // dil:atla
    },
    {
      baslik: "Aylık faturaları kontrol et",
      aciklama: "Her ayın 1'inde açılan örnek bir rutin görevi.",
      freq: "monthly",
      byMonthDay: [1],
      dueTime: "11:00", // dil:atla
    },
  ],
};

const SIRKET: OrnekIcerik = {
  is: {
    baslik: "🎓 Projelio'yu tanı: şirket (örnek)",
    aciklama:
      "Bu örnek iş, şirketini Projelio'da nasıl yöneteceğini göstermek için hazırlandı ve şirketine bağlı. İçindeki proje, görevler ve rutin gerçek kayıtlar: aç, düzenle, tamamla — hiçbir şey bozulmaz. İşin bitince bu sayfadaki \"Örnekleri sil\" düğmesiyle hepsini tek tıkla kaldırabilirsin.",
  },
  proje: {
    baslik: "Örnek proje: Yeni dönem hazırlığı",
    aciklama:
      "Şirketindeki her çalışma bir İŞ altında toplanır, işin içinde projeler ve görevler olur. İşler şirkete bağlandığı için şirket sayfasından hepsini birlikte görürsün. Görevleri sırayla aç ve açıklamalarındaki adımları dene.",
    gunSonra: 21,
  },
  gorevler: [
    {
      baslik: "1 · Buradan başla: şirketin katmanları",
      aciklama:
        "Projelio'da şirketin şöyle durur: ŞİRKET → DEPARTMANLAR (her birinin kadrosu, görevleri ve modülleri) ve ŞİRKETE BAĞLI İŞLER → PROJELER → GÖREVLER.\n\nBirden fazla şirketin varsa hepsi bir holding (grup) altında toplanabilir. Menüden Organizasyonlar'ı açıp şirketinin sayfasına bir göz at.",
      durum: "in_progress",
      gunSonra: 0,
    },
    {
      baslik: "2 · Departmanlarını gözden geçir",
      aciklama:
        "Şirket sayfasında departmanların listelenir. Her departmanın kendi kadrosu, görev panosu ve modülleri (ör. satış, muhasebe) vardır.\n\nEksik bir departman varsa şirket sayfasından ekle; kullanmadığını kaldırabilirsin.",
      durum: "todo",
      gunSonra: 0,
    },
    {
      baslik: "3 · Ekibini davet et",
      aciklama:
        "Bu görevin alt görevleri, ekibini içeri almanın adımları. Çalışanlarını departmanların kadrosuna davet et; davet ettiğin kişi kabul edince departmanın görevlerini ve modüllerini görür.\n\nDışarıdan hizmet aldığın biri varsa onu TAŞERON olarak ekle: taşeron yalnızca kendisine açılan modülü ve görevleri görür, şirketinin geri kalanını ve bütçesini görmez.",
      durum: "todo",
      gunSonra: 2,
      altGorevler: [
        { baslik: "Departman yöneticilerini belirle", durum: "completed" },
        { baslik: "Çalışanları kadroya davet et", durum: "todo" },
        { baslik: "Taşeronları ilgili modüle bağla", durum: "todo" },
      ],
    },
    {
      baslik: "4 · Görevleri dağıt ve takip et",
      aciklama:
        "Görevleri departman panosuna ya da bir işin projesine yazıp kişilere ata. Atanan kişi bildirim alır, görev onun Yapılacaklar listesine düşer; tamamlandığında sen haberdar olursun.\n\nBu görevin yarın saat 10:00'da bitmesi gerekiyor — saatli görevlerde hatırlatma kurabilirsin.",
      durum: "todo",
      gunSonra: 1,
      saat: "10:00", // dil:atla
    },
    {
      baslik: "5 · Şirket bütçesini tek defterde tut",
      aciklama:
        "Bütçe kademe kademe toplanır: görev → proje → iş → departman → şirket (varsa holding). Bir gider hangi kademeye aitse oraya yazılır; üstteki rakam kendiliğinden toplanır, hiçbir şey iki kez sayılmaz.\n\nFarklı para birimleri birbirine karışmaz; her biri kendi toplamıyla görünür.",
      durum: "todo",
      gunSonra: 3,
    },
    {
      baslik: "6 · Şirketin künyesini doldur",
      aciklama:
        "Şirket sayfasındaki bilgi kartı, şirketinin künyesini (unvan, vergi bilgileri, adresler) ve önemli belgelerini tek yerde tutar. Bir kez doldur; ihtiyaç olduğunda aramak zorunda kalma.",
      durum: "todo",
      gunSonra: 4,
    },
    {
      baslik: "7 · Lio'ya şirketini sor",
      aciklama:
        "Sağ alttaki Lio, Projelio'nun yapay zekâ yardımcısı. Ona düz cümlelerle yaz: \"bu hafta hangi görevler gecikti?\" ya da \"satış departmanına yarın için üç görev ekle\".\n\nLio'yu Cmd/Ctrl + K ile de açabilirsin.",
      durum: "todo",
      gunSonra: 5,
    },
    {
      baslik: "Örnek: tamamlanmış bir görev",
      aciklama: "Tamamlanan görevler böyle görünür. Yanlışlıkla tamamladıysan geri açabilirsin.",
      durum: "completed",
      gunSonra: 0,
    },
    {
      baslik: "Son adım · Örnekleri sil ve ilk gerçek işini aç",
      aciklama:
        "Hepsi bu kadar! Artık şirketin için ilk gerçek işini açmaya hazırsın.\n\nBu işin sayfasındaki \"Örnekleri sil\" düğmesi bu işi, projeyi, görevleri ve rutini birlikte kaldırır. Şirketine, departmanlarına ve kendi açtığın işlere dokunmaz. Örnekleri daha sonra yeniden görmek istersen Ayarlar > Yardımcılar'dan tekrar ekleyebilirsin.",
      durum: "todo",
      gunSonra: 7,
    },
  ],
  rutinProgrami: {
    baslik: "Örnek rutin: Yönetim düzeni",
    aciklama:
      "Rutin, bitiş tarihi olmayan, tekrar eden işlerin yeridir: haftalık toplantı, aylık bütçe kontrolü gibi. Kuralı bir kez yazarsın; Projelio görevleri vakti gelince kendisi açar ve hangilerinin kaçırıldığını gösterir.",
  },
  rutinler: [
    {
      baslik: "Haftalık yönetim toplantısı",
      aciklama: "Her pazartesi saat 10:00'da açılan örnek bir rutin görevi. Tekrar kuralını değiştirmeyi dene.",
      freq: "weekly",
      byWeekday: [1],
      dueTime: "10:00", // dil:atla
    },
    {
      baslik: "Aylık bütçe kontrolü",
      aciklama: "Her ayın 1'inde açılan örnek bir rutin görevi.",
      freq: "monthly",
      byMonthDay: [1],
      dueTime: "11:00", // dil:atla
    },
  ],
};

const TASERON: OrnekIcerik = {
  is: {
    baslik: "🎓 Projelio'yu tanı: taşeron (örnek)",
    aciklama:
      "Bu örnek iş, bir şirkete hizmet verirken Projelio'yu nasıl kullanacağını göstermek için hazırlandı. İçindeki proje, görevler ve rutin gerçek kayıtlar: aç, düzenle, tamamla — hiçbir şey bozulmaz. İşin bitince bu sayfadaki \"Örnekleri sil\" düğmesiyle hepsini tek tıkla kaldırabilirsin.",
  },
  proje: {
    baslik: "Örnek proje: Müşteriye verilen hizmet",
    aciklama:
      "Taşeron olarak seni davet eden şirketin yalnızca sana açılan bölümünü görürsün: bağlandığın departmanın ilgili modülü ve sana atanan görevler. Şirketin diğer işlerini ve bütçesini görmezsin. Görevleri sırayla aç ve açıklamalarındaki adımları dene.",
    gunSonra: 14,
  },
  gorevler: [
    {
      baslik: "1 · Buradan başla: taşeron olarak ne görürsün",
      aciklama:
        "Bir şirket seni taşeron olarak davet ettiğinde, o şirketin sana açtığı modülü ve sana atanan görevleri görürsün. Davet bildirimini kabul etmeyi unutma.\n\nŞu an bir görevin içindesin. Başlığı, açıklamayı, tarihi değiştirebilirsin. Sonraki kartlara geç ve her birinde yazanı dene.",
      durum: "in_progress",
      gunSonra: 0,
    },
    {
      baslik: "2 · Sana atanan görevleri Yapılacaklar'da takip et",
      aciklama:
        "Hangi şirketten gelirse gelsin, sana atanan bütün görevler Yapılacaklar sayfasında toplanır. Güne oradan başla: bugün ne var, ne gecikti.\n\nHer sabah gelen özet e-postası da aynı listeyi gelen kutuna getirir.",
      durum: "todo",
      gunSonra: 0,
    },
    {
      baslik: "3 · İşi bitir, iş verenin haberdar olsun",
      aciklama:
        "Bu görevin alt görevleri var; biri zaten tamamlanmış. Kalanları tamamla. Bir görevi tamamlandı olarak işaretlediğinde görevi sana veren kişi bunu görür — ayrıca haber vermene gerek kalmaz.",
      durum: "todo",
      gunSonra: 2,
      altGorevler: [
        { baslik: "İşin kapsamını netleştir", durum: "completed" },
        { baslik: "İşi teslim et", durum: "todo" },
        { baslik: "Görevi tamamlandı olarak işaretle", durum: "todo" },
      ],
    },
    {
      baslik: "4 · Sana açılan modülde kayıt tut",
      aciklama:
        "Şirket seni bir departman modülüne (ör. satış ya da muhasebe) bağladıysa, o modülün kayıtlarını ekleyip güncelleyebilirsin. Menüde sana açılan modülü bul ve kayıtlarına göz at.",
      durum: "todo",
      gunSonra: 3,
    },
    {
      baslik: "5 · Bitiş saatine dikkat et",
      aciklama:
        "Bu görevin yarın saat 10:00'da bitmesi gerekiyor. Saatli görevlere vaktinden önce hatırlatma kurabilirsin; böylece teslim saatini kaçırmazsın.",
      durum: "todo",
      gunSonra: 1,
      saat: "10:00", // dil:atla
    },
    {
      baslik: "6 · Yaptım'a yaptığın işi yaz",
      aciklama:
        "Yaptım, kişisel iş günlüğün. Gün içinde yaptığın işleri kısaca yaz, istersen kronometreyle süresini tut. Ne kadar çalıştığını iş verenine gösterirken işine yarar.",
      durum: "todo",
      gunSonra: 4,
    },
    {
      baslik: "Örnek: tamamlanmış bir görev",
      aciklama: "Tamamlanan görevler böyle görünür. Yanlışlıkla tamamladıysan geri açabilirsin.",
      durum: "completed",
      gunSonra: 0,
    },
    {
      baslik: "Son adım · Örnekleri sil",
      aciklama:
        "Hepsi bu kadar! Bu işin sayfasındaki \"Örnekleri sil\" düğmesi bu işi, projeyi, görevleri ve rutini birlikte kaldırır. Bağlı olduğun şirketin kayıtlarına dokunmaz. Örnekleri daha sonra yeniden görmek istersen Ayarlar > Yardımcılar'dan tekrar ekleyebilirsin.",
      durum: "todo",
      gunSonra: 7,
    },
  ],
  rutinProgrami: {
    baslik: "Örnek rutin: Haftalık rapor",
    aciklama:
      "Rutin, bitiş tarihi olmayan, tekrar eden işlerin yeridir. Kuralı bir kez yazarsın; Projelio görevleri vakti gelince kendisi açar ve hangilerinin kaçırıldığını gösterir.",
  },
  rutinler: [
    {
      baslik: "Haftalık iş raporunu gönder",
      aciklama: "Her cuma saat 16:00'da açılan örnek bir rutin görevi. Tekrar kuralını değiştirmeyi dene.",
      freq: "weekly",
      byWeekday: [5],
      dueTime: "16:00", // dil:atla
    },
  ],
};
// dil:anahtar-bitis

const ICERIKLER: Record<OrnekTur, OrnekIcerik> = { bireysel: BIREYSEL, sirket: SIRKET, taseron: TASERON };

/**
 * Kullanıcının diline çevrilmiş örnek içerik.
 *
 * Başlıktaki emoji sözlükte de aynen durmalı — İngilizce iş listesinde de
 * örnek işin tek bakışta ayırt edilmesini sağlıyor.
 */
export function ornekIcerik(locale: Locale, tur: OrnekTur = "bireysel"): OrnekIcerik {
  const t = cevirmen(locale);
  const HAM = ICERIKLER[tur];
  return {
    is: { baslik: t(HAM.is.baslik), aciklama: t(HAM.is.aciklama) },
    proje: { ...HAM.proje, baslik: t(HAM.proje.baslik), aciklama: t(HAM.proje.aciklama) },
    gorevler: HAM.gorevler.map((g) => ({
      ...g,
      baslik: t(g.baslik),
      aciklama: t(g.aciklama),
      altGorevler: g.altGorevler?.map((a) => ({ ...a, baslik: t(a.baslik) })),
    })),
    rutinProgrami: { baslik: t(HAM.rutinProgrami.baslik), aciklama: t(HAM.rutinProgrami.aciklama) },
    rutinler: HAM.rutinler.map((r) => ({ ...r, baslik: t(r.baslik), aciklama: t(r.aciklama) })),
  };
}

/**
 * "YYYY-MM-DD" gününe N gün ekler. UTC öğle saati üzerinden: yerel gece
 * yarısında yapılan hesap, yaz saati geçişinde günü kaydırabiliyordu.
 */
export function gunEkle(gun: string, n: number): string {
  const tarih = new Date(`${gun}T12:00:00Z`);
  tarih.setUTCDate(tarih.getUTCDate() + n);
  return tarih.toISOString().slice(0, 10);
}
