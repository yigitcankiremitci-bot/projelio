import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AI_PANEL_WIDTH, Z } from "../lib/layout";
import { useNavigate } from "react-router-dom";
import { useThemeColors } from "../theme/useThemeColors";
import { parseMessageLinks } from "../lib/messageLinks";
import { useT } from "../lib/i18n";
import { IconSparkle, IconX, IconPlus, IconTrash, IconSend, IconPaperclip, IconFile } from "./icons";
import { aiChat } from "../api/aiChat";
import { filesApi } from "../api/files";
import type { ProjectFile } from "@projelio/shared";
import FilePreviewModal from "./FilePreviewModal";
import type {
  AiActiveFile,
  AiAttachment,
  AiChatResult,
  AiContinuation,
  AiConversation,
  AiCredits,
  AiModelTier,
  AiMessageAttachment,
  AiModelTierInfo,
  AiStoredMessage,
} from "../api/aiChat";
import ConfirmDialog from "./ConfirmDialog";
import AiContinueDialog from "./AiContinueDialog";
import AiCloudPickerModal from "./AiCloudPickerModal";
import { openGooglePicker } from "../lib/googlePicker";
import { useVoiceRecorder } from "../lib/useVoiceRecorder";
import { downscaleImage } from "../lib/downscaleImage";
// Sesli yanıt için tur anlatıcısının motoru yeniden kullanılıyor: Türkçe ses
// seçimi, uzun metni parçalama ve Chrome'un konuşma sentezi hatasına karşı
// "canlı tutma" numarası orada zaten çözülmüş (bkz. lib/tour/narrator.ts).
import {
  hasTurkishVoice,
  narrationAvailable,
  play as speak,
  sanitizeForSpeech,
  setPreferredVoice,
  stop as stopSpeaking,
  narrationVoices,
} from "../lib/tour/narrator";
import { IconMic, IconSpeaker } from "./icons";
import { useIsDesktop } from "../lib/useIsDesktop";

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * Panel açılırken otomatik gönderilecek mesaj (bkz. lib/askLio.ts).
   * Takvim'deki "Lio ile planla" gibi noktalar sohbeti hazır bir soruyla
   * başlatır; kullanıcı ayrıca "gönder"e basmak zorunda kalmaz.
   */
  initialMessage?: string | null;
  /**
   * false ise mesaj gönderilmez, yalnızca yazı kutusuna yazılır ve odak oraya
   * gider — kullanıcı okuyup düzenleyebilsin, göndermeye kendisi karar versin
   * (bkz. lib/askLio.ts askLioDraft). Kartlardaki Lio simgeleri böyle çalışır.
   */
  initialAutoSend?: boolean;
  /** Mesaj işlendikten sonra çağrılır; aksi halde her açılışta tekrar gelirdi. */
  onInitialMessageSent?: () => void;
}

interface PendingConfirmation {
  actionId: string;
  summary: string;
}

interface ViewMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  creditsCharged?: number;
  pending?: boolean;
  attachments?: AiMessageAttachment[];
  /**
   * Mesaj BU OTURUMDA mı geldi?
   *
   * Sesli yanıt yalnızca yeni gelen cevapları okur. Bu işaret olmadan, sohbet
   * geçmişinden eski bir konuşma açıldığında Lio en son yazdığı cümleyi
   * kendiliğinden okumaya başlıyordu.
   */
  fresh?: boolean;
}

/**
 * Yalnızca dosya gönderilip hiçbir şey yazılmadığında kullanılan istek.
 * Sunucudaki karşılığıyla (EMPTY_MESSAGE_WITH_FILE) aynı olmalı: yeniden
 * yüklendiğinde balonun metni değişmesin.
 */
const EMPTY_MESSAGE_WITH_FILE = "Bu dosyayı incele ve ne olduğunu özetle."; // dil:anahtar

/** Ek türlerinin balonda ve çipte gösterilen kısa adı. */
// dil:anahtar-baslangic
const ATTACHMENT_LABELS: Record<string, string> = {
  image: "Görsel",
  pdf: "PDF",
  document: "Word",
  sheet: "Tablo",
  text: "Metin",
  audio: "Ses",
};
// dil:anahtar-bitis

// dil:anahtar-baslangic
const SUGGESTIONS = [
  "Durumumu özetle",
  "Geciken görevlerim neler?",
  "Bu hafta neler teslim edilecek?",
  "Bana atanmış açık işleri listele",
];
// dil:anahtar-bitis

/** Seçilen model kademesi oturumlar arasında hatırlanır. */
const TIER_STORAGE_KEY = "projelio.lio.tier";
/** Sesli yanıt tercihi de hatırlanır; her açılışta yeniden açmak zorunda kalınmasın. */
const VOICE_STORAGE_KEY = "projelio.lio.voice";
/** Seçilen ses adı; cihazda birden fazla Türkçe ses olabiliyor. */
const VOICE_NAME_KEY = "projelio.lio.voiceName";
/** Hangi ses motoru: ücretsiz tarayıcı sentezi mi, ücretli doğal ses mi. */
const VOICE_ENGINE_KEY = "projelio.lio.voiceEngine";

type VoiceEngine = "browser" | "server";

/**
 * Doğal sesin kaba bedeli (100 karakter başına kredi).
 *
 * Sunucudaki fiyatla (TTS_USD_PER_MILLION_CHARS = 15 USD/1M karakter, +%20 komisyon)
 * aynı hesap: 100 × 15 / 1e6 × 1,2 / 0,0001 = 18. Yalnızca kullanıcıya önden bir
 * fikir vermek için; gerçek tutar her zaman sunucudan dönen sayıdır.
 */
const SERVER_VOICE_CREDITS_PER_100_CHARS = 18;
/** Seçilen doğal sesin adı. */
const SERVER_VOICE_KEY = "projelio.lio.serverVoice";
/**
 * Ses denemesinde okunan cümle.
 *
 * Kısa tutuldu çünkü deneme de ücretli: 46 karakter ≈ 9 kredi. Yine de gerekli,
 * altı sesi mesajları tekrar tekrar okutarak denemek çok daha pahalı olurdu.
 */
const VOICE_SAMPLE = "Merhaba, ben Lio. Sesim böyle duyuluyor."; // dil:anahtar

function readStoredTier(): AiModelTier {
  const raw = typeof localStorage !== "undefined" ? localStorage.getItem(TIER_STORAGE_KEY) : null;
  return raw === "smart" || raw === "max" ? raw : "fast";
}

// dil:anahtar-baslangic — modül düzeyi metinler; çeviri kullanım yerinde.
const GREETING =
  "Merhaba! Ben Lio. Projelerini, görevlerini ve bütçeni buradan yönetebilirsin — yazman yeterli.";
// dil:anahtar-bitis

export default function AiAssistantPanel({
  open,
  onClose,
  initialMessage,
  initialAutoSend = true,
  onInitialMessageSent,
}: Props) {
  const c = useThemeColors();
  const t = useT();
  const isDesktop = useIsDesktop();
  const navigate = useNavigate();

  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ViewMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [credits, setCredits] = useState<AiCredits | null>(null);
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null);
  const [continuation, setContinuation] = useState<AiContinuation | null>(null);
  const [attachments, setAttachments] = useState<AiAttachment[]>([]);
  /** Okunmayı bekleyen dosya adları — yükleme sürerken çip olarak görünür. */
  const [attaching, setAttaching] = useState<string[]>([]);
  const [attachMenu, setAttachMenu] = useState(false);
  const [cloudPicker, setCloudPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /**
   * Kamera için AYRI bir alan.
   *
   * `capture` özniteliği telefonda dosya seçici yerine doğrudan kamerayı açıyor;
   * aynı alana koyup her seferinde değiştirmek yerine ikinci bir alan tutmak
   * daha basit. Masaüstünde tarayıcılar `capture`'ı yok sayıp dosya seçici
   * açtığı için menü öğesi orada hiç gösterilmiyor (bkz. cameraSupported).
   */
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  /** Lio'nun verdiği bir dosya adına tıklanınca açılan önizleme. */
  const [filePreview, setFilePreview] = useState<ProjectFile | null>(null);
  /**
   * Hata kredi yetersizliğinden mi kaynaklandı (HTTP 402)?
   *
   * Ayrı tutuluyor çünkü bu hatada kullanıcıya yapacak bir şey sunulmalı:
   * uyarının içine kredi sayfasına giden düğme konuyor. Diğer hatalarda
   * gösterilecek bir eylem yok.
   */
  const [creditsBlocked, setCreditsBlocked] = useState(false);
  /**
   * Sohbette açık duran dosyalar.
   *
   * Görünür olmaları önemli: sabit dosya her turda modele gidiyor, yani her tur
   * kredi yakıyor. Kullanıcı neyin taşındığını bilmeli ve iş bitince kaldırabilmeli.
   */
  const [activeFiles, setActiveFiles] = useState<AiActiveFile[]>([]);

  /**
   * Sesli yanıt açık mı?
   *
   * Tarayıcının konuşma sentezi kullanılıyor — kredi harcamıyor. Tercih
   * saklanıyor ama tarayıcı desteklemiyorsa düğme hiç gösterilmiyor.
   */
  /**
   * Yeni yanıtları kendiliğinden okusun mu?
   *
   * Artık ana etkileşim bu DEĞİL: her yanıtın yanında kendi hoparlörü var ve
   * kullanıcı hangisini duymak istiyorsa ona basıyor. Bu yalnızca "hepsini
   * otomatik oku" isteyenler için, varsayılanı kapalı — özellikle doğal seste
   * her yanıt kredi harcadığı için sessiz varsayılan doğru olan.
   */
  const [autoSpeak, setAutoSpeak] = useState(() => {
    try {
      return localStorage.getItem(VOICE_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  /** Ses ayarları penceresi (motor, ses, otomatik okuma). */
  const [voiceMenu, setVoiceMenu] = useState(false);
  /** Şu an okunan mesaj — düğme "durdur"a döner. */
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  /** Doğal seste ses üretilirken bekleyen mesaj. */
  const [preparingId, setPreparingId] = useState<string | null>(null);
  const voiceSupported = useMemo(() => narrationAvailable(), []);
  // Dokunmatik cihazlarda `capture` gerçekten kamerayı açıyor; masaüstünde
  // yalnızca dosya seçici çıkacağı için "Fotoğraf çek" sözü yalan olurdu.
  const cameraSupported = useMemo(
    () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true,
    []
  );
  // Cihazda Türkçe ses yoksa okunuş bozuk olur; düğmenin ipucunda söylenir.
  const turkishVoiceMissing = useMemo(() => voiceSupported && !hasTurkishVoice(), [voiceSupported]);

  /**
   * Cihazdaki Türkçe sesler.
   *
   * Chrome sesleri eşzamansız yüklüyor: ilk okumada liste boş dönebiliyor, bu
   * yüzden panel açıldığında bir kez daha bakılıyor. Seçim yapılmamışsa
   * narrator'ın kendi otomatik seçimi geçerli kalır.
   */
  const [voiceList, setVoiceList] = useState<{ name: string; lang: string }[]>([]);
  const [voiceEngine, setVoiceEngine] = useState<VoiceEngine>(() => {
    try {
      return localStorage.getItem(VOICE_ENGINE_KEY) === "server" ? "server" : "browser";
    } catch {
      return "browser";
    }
  });

  const chooseVoiceEngine = (engine: VoiceEngine) => {
    setVoiceEngine(engine);
    silence();
    try {
      localStorage.setItem(VOICE_ENGINE_KEY, engine);
    } catch {
      // Depolama kapalıysa seçim yalnızca bu oturumda geçerli olur.
    }
  };

  /** Doğal ses seçenekleri sunucudan gelir (hangi seslerin geçerli olduğu orada tanımlı). */
  const [serverVoices, setServerVoices] = useState<
    { id: string; label: string; description: string }[]
  >([]);
  const [serverVoice, setServerVoice] = useState<string>(() => {
    try {
      return localStorage.getItem(SERVER_VOICE_KEY) ?? "";
    } catch {
      return "";
    }
  });
  /** Ses denemesi sürerken düğme beklemeye geçer. */
  const [samplingVoice, setSamplingVoice] = useState(false);

  useEffect(() => {
    if (!voiceMenu || serverVoices.length > 0) return;
    aiChat
      .getVoices()
      .then((res) => {
        setServerVoices(res.voices);
        setServerVoice((prev) => prev || res.defaultVoice);
      })
      .catch(() => {});
  }, [voiceMenu, serverVoices.length]);

  const chooseServerVoice = (id: string) => {
    setServerVoice(id);
    silence();
    try {
      localStorage.setItem(SERVER_VOICE_KEY, id);
    } catch {
      // Depolama kapalıysa seçim yalnızca bu oturumda geçerli olur.
    }
  };

  /** Seçili sesi kısa bir cümleyle dinletir. */
  const sampleVoice = async () => {
    silence();
    setSamplingVoice(true);
    setError(null);
    try {
      const res = await aiChat.speak(VOICE_SAMPLE, activeId ?? undefined, serverVoice);
      setCredits((prev) => (prev ? { ...prev, balance: res.balance } : prev));
      speak({ text: VOICE_SAMPLE, audioUrl: `data:${res.mimeType};base64,${res.audioBase64}` });
    } catch (err: any) {
      if (err?.status === 402) setCreditsBlocked(true);
      setError(String(err?.message ?? "Ses denemesi yapılamadı."));
    } finally {
      setSamplingVoice(false);
    }
  };

  const [voiceName, setVoiceName] = useState<string>(() => {
    try {
      return localStorage.getItem(VOICE_NAME_KEY) ?? "";
    } catch {
      return "";
    }
  });

  useEffect(() => {
    if (!open || !voiceSupported) return;
    const read = () => setVoiceList(narrationVoices());
    read();
    // Liste boş geldiyse sesler henüz yüklenmemiştir; kısa bir süre sonra tekrar bak.
    const timer = setTimeout(read, 600);
    return () => clearTimeout(timer);
  }, [open, voiceSupported]);

  useEffect(() => {
    if (voiceName) setPreferredVoice(voiceName);
  }, [voiceName]);

  const chooseVoiceName = (name: string) => {
    setVoiceName(name);
    setPreferredVoice(name || null);
    try {
      localStorage.setItem(VOICE_NAME_KEY, name);
    } catch {
      // Depolama kapalıysa seçim yalnızca bu oturumda geçerli olur.
    }
  };
  const recorder = useVoiceRecorder();
  /** Sesli komut çözümlenirken düğme beklemeye geçer. */
  const [transcribing, setTranscribing] = useState(false);

  const [showHistory, setShowHistory] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const refreshCredits = useCallback(() => {
    aiChat
      .getCredits()
      .then(setCredits)
      .catch(() => {});
  }, []);

  // Panel her açıldığında sohbet listesi ve bakiye tazelenir.
  useEffect(() => {
    if (!open) return;
    refreshCredits();
    aiChat
      .listConversations()
      .then((list) => {
        setConversations(list);
        // KALDIĞI YERDEN DEVAM. Panel her açılışta boş bir sohbetle başlıyordu;
        // mesajlar veritabanında duruyor olsa da kullanıcı için Lio "her şeyi
        // unutmuş" görünüyordu (özellikle sayfa yenilendikten sonra, çünkü
        // panelin state'i bellekte).
        //
        // Yalnızca ortada bir şey YOKKEN yapılır: açık bir sohbet ya da
        // yazılmış mesajlar varsa onların üstüne yazmak, kullanıcının o an
        // baktığı konuşmayı elinden almak olurdu. Bekleyen bir açılış mesajı
        // varsa da karışılmaz — o akış sohbeti kendisi kuruyor (aşağıya bkz.).
        if (activeId || messages.length > 0 || initialMessage || list.length === 0) return;
        void openConversation(list[0].id);
      })
      .catch(() => {});
    setTimeout(() => inputRef.current?.focus(), 80);
  }, [open, refreshCredits]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending, confirmation, continuation]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !confirmation) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, confirmation]);

  const openConversation = async (id: string) => {
    setActiveId(id);
    setShowHistory(false);
    setLoadingHistory(true);
    setError(null);
    aiChat
      .getActiveFiles(id)
      .then((res) => setActiveFiles(res.files))
      .catch(() => setActiveFiles([]));
    try {
      const stored: AiStoredMessage[] = await aiChat.getMessages(id);
      setMessages(
        stored.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          creditsCharged: m.creditsCharged || undefined,
          attachments: m.attachments,
        }))
      );
    } catch {
      setError(t("Sohbet yüklenemedi."));
    } finally {
      setLoadingHistory(false);
    }
  };

  const startNewConversation = () => {
    setActiveId(null);
    setMessages([]);
    setActiveFiles([]);
    setError(null);
    setShowHistory(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await aiChat.deleteConversation(id);
      setConversations((prev) => prev.filter((conv) => conv.id !== id));
      if (activeId === id) startNewConversation();
    } catch {
      setError("Sohbet silinemedi.");
    }
  };

  /**
   * Lio'nun verdiği dosya adına tıklandığında önizlemeyi açar.
   *
   * Sohbette yalnızca dosya KİMLİĞİ taşınıyor (bkz. lib/messageLinks); pencerenin
   * ihtiyaç duyduğu künye buradan çekiliyor. Yetki sunucuda: kullanıcının
   * göremeyeceği bir dosyanın kimliği elinde olsa bile istek 403 döner.
   */
  const openFilePreview = async (fileId: string) => {
    setError(null);
    try {
      setFilePreview(await filesApi.getById(fileId));
    } catch (err: any) {
      setError(String(err?.message ?? "Dosya açılamadı."));
    }
  };

  /**
   * Dosyayı mesajdan ÖNCE okutur.
   *
   * Neden hemen: ses çözümleme ücretli bir işlem ve kullanıcı göndermeye karar
   * vermeden önce dosyadan ne okunduğunu (kaç sayfa, kaç satır) ve varsa ne kadar
   * kredi gittiğini görmeli. Sunucu okunan içeriği kısa süre bellekte tutar;
   * mesajla birlikte yalnızca ek kimliği gider.
   */
  const addAttachment = async (label: string, run: () => Promise<AiAttachment>) => {
    setError(null);
    setAttaching((prev) => [...prev, label]);
    try {
      const attachment = await run();
      setAttachments((prev) => [...prev, attachment]);
      // Ses çözümleme bakiyeyi hemen düşürür; başlıktaki sayı yanlış kalmasın.
      if (attachment.creditsCharged > 0) refreshCredits();
    } catch (err: any) {
      // Ses çözümleme ücretli; bakiye yetmiyorsa buradan da 402 gelebilir.
      if (err?.status === 402) setCreditsBlocked(true);
      setError(String(err?.message ?? "Dosya okunamadı."));
    } finally {
      setAttaching((prev) => {
        const index = prev.indexOf(label);
        if (index < 0) return prev;
        const next = [...prev];
        next.splice(index, 1);
        return next;
      });
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    // Aynı dosya arka arkaya seçilebilsin diye alan sıfırlanır.
    e.target.value = "";
    setAttachMenu(false);
    for (const file of files) {
      // Fotoğraflar yüklemeden önce küçültülür: telefon kamerası sunucudaki
      // 5 MB sınırını rahat aşıyor (bkz. downscaleImage).
      const prepared = await downscaleImage(file);
      await addAttachment(prepared.name, () => aiChat.uploadAttachment(prepared, activeId ?? undefined));
    }
  };

  /**
   * Bulut seçici. Google'da tarayıcıdaki resmi Picker açılır (dar `drive.file`
   * kapsamı Drive'ın tamamını listelemeye izin vermiyor), OneDrive'da ise kendi
   * gezinme penceremiz.
   */
  const handleCloudPick = async () => {
    setAttachMenu(false);
    setError(null);
    try {
      const { provider } = await aiChat.attachmentSource();
      if (!provider) {
        setError(t("Bağlı bir Google Drive ya da OneDrive hesabın yok. Ayarlardan bir hesap bağlayabilirsin."));
        return;
      }
      if (provider === "microsoft") {
        setCloudPicker(true);
        return;
      }
      await openGooglePicker((picked) => {
        void addAttachment(picked.name, () => aiChat.attachCloudFile(picked.id, activeId ?? undefined));
      });
    } catch (err: any) {
      setError(String(err?.message ?? "Drive açılamadı."));
    }
  };

  /** Kredi yükleme henüz ayrı bir sayfa değil; bakiye ve hareketler burada. */
  const goToCredits = () => {
    onClose();
    navigate("/settings/ai-credits");
  };

  /**
   * Lio'nun son yanıtını seslendirir.
   *
   * `applyResult` içinden değil buradan çağrılıyor: seslendirilecek şey ekrana
   * BASILAN metin, dolayısıyla tek kaynak mesaj listesinin sonu. Onay/duraklatma
   * gibi ara durumlarda da doğru cümle okunmuş olur.
   */
  const silence = useCallback(() => {
    stopSpeaking();
    setSpeakingId(null);
    setPreparingId(null);
  }, []);

  /**
   * Tek bir mesajı seslendirir; aynı mesaja tekrar basılırsa durdurur.
   *
   * Neden mesaj bazlı: tek bir genel aç/kapa, kullanıcıyı ya her yanıtı dinlemeye
   * ya da hiçbirini dinlememeye zorluyordu. Oysa istenen genelde tek bir cevabı
   * duymak — üstelik doğal seste her okuma kredi harcadığı için "hangisini
   * duyacağıma ben karar vereyim" doğru olan.
   */
  const playMessage = useCallback(
    async (message: ViewMessage) => {
      if (speakingId === message.id || preparingId === message.id) {
        silence();
        return;
      }
      silence();

      // Markdown/emoji temizliği her iki motorda da yapılır. Doğal seste ayrıca
      // PARA kazandırıyor: ücret karakter başına, temizlenen her işaret eksi bedel.
      const text = sanitizeForSpeech(message.content);
      if (!text) return;

      const startBrowser = () => {
        setSpeakingId(message.id);
        speak({ text, onEnd: () => setSpeakingId(null) });
      };

      if (voiceEngine === "browser") {
        startBrowser();
        return;
      }

      setPreparingId(message.id);
      try {
        const res = await aiChat.speak(text, activeId ?? undefined, serverVoice);
        setCredits((prev) => (prev ? { ...prev, balance: res.balance } : prev));
        setPreparingId(null);
        setSpeakingId(message.id);
        // Ses `audioUrl` olarak veriliyor: anlatıcı çalamazsa kendiliğinden
        // tarayıcı sentezine düşüyor, kullanıcı sessiz kalmıyor.
        speak({
          text,
          audioUrl: `data:${res.mimeType};base64,${res.audioBase64}`,
          onEnd: () => setSpeakingId(null),
        });
      } catch (err: any) {
        setPreparingId(null);
        if (err?.status === 402) setCreditsBlocked(true);
        setError(String(err?.message ?? "Doğal ses üretilemedi, tarayıcı sesine düşüldü."));
        startBrowser();
      }
    },
    [speakingId, preparingId, silence, voiceEngine, activeId, serverVoice]
  );

  // "Hepsini otomatik oku" açıksa yeni gelen yanıt kendiliğinden okunur.
  const lastSpokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!autoSpeak || !open) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || !last.content || !last.fresh) return;
    if (lastSpokenRef.current === last.id) return;
    lastSpokenRef.current = last.id;
    void playMessage(last);
    // playMessage her render'da yeniden oluşuyor; bağımlılığa eklemek döngü yapar.
  }, [messages, autoSpeak, open]);

  // Panel kapanınca konuşma kesilir; arka planda devam eden bir ses kullanıcıyı
  // en çok rahatsız eden şey olurdu.
  useEffect(() => {
    if (!open) silence();
  }, [open, silence]);

  const toggleAutoSpeak = () => {
    setAutoSpeak((prev) => {
      const next = !prev;
      if (!next) silence();
      try {
        localStorage.setItem(VOICE_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Depolama kapalıysa tercih yalnızca bu oturumda geçerli olur.
      }
      return next;
    });
  };

  /**
   * Mikrofon düğmesi: basınca kaydı başlatır, tekrar basınca bitirip yazıya çevirir.
   *
   * Çözümlenen metin DOĞRUDAN GÖNDERİLMEZ, yazı kutusuna konur. Sesli tanıma
   * hata yapabiliyor ve yanlış anlaşılmış bir komut hem kredi harcar hem yanlış
   * kayıt oluşturur; kullanıcı göndermeden önce görsün.
   */
  const toggleRecording = async () => {
    if (transcribing) return;

    if (!recorder.recording) {
      silence();
      await recorder.start();
      return;
    }

    const file = await recorder.stop();
    if (!file) {
      setError(t("Kayıt çok kısa, bir şey duyamadım."));
      return;
    }

    setTranscribing(true);
    setError(null);
    try {
      const result = await aiChat.transcribe(file, activeId ?? undefined);
      setInput((prev) => (prev ? `${prev} ${result.text}` : result.text));
      setCredits((prev) => (prev ? { ...prev, balance: result.balance } : prev));
      inputRef.current?.focus();
    } catch (err: any) {
      if (err?.status === 402) setCreditsBlocked(true);
      setError(String(err?.message ?? "Ses çözümlenemedi."));
    } finally {
      setTranscribing(false);
    }
  };

  /** Sohbetteki sabit dosyaları bırakır: bundan sonra modele gönderilmezler. */
  const clearActiveFiles = () => {
    if (!activeId) return;
    setActiveFiles([]);
    aiChat.clearActiveFiles(activeId).catch(() => {});
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    aiChat.removeAttachment(id).catch(() => {});
  };

  const send = async (text: string) => {
    const trimmed = text.trim();
    const sentAttachments = attachments;
    // Yalnızca dosya göndermek geçerli bir istek: sunucu o durumda varsayılan
    // bir soru koyuyor ("bu dosyayı incele ve özetle").
    if ((!trimmed && sentAttachments.length === 0) || sending) return;

    // Kullanıcı yeni bir şey söylüyorsa önceki cevabı okumayı bırak.
    silence();
    setError(null);
    setCreditsBlocked(false);
    setInput("");
    setAttachments([]);
    setMessages((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}`,
        role: "user",
        content: trimmed || EMPTY_MESSAGE_WITH_FILE,
        attachments: sentAttachments.map((a) => ({ name: a.name, kind: a.kind, detail: a.detail })),
      },
    ]);
    setSending(true);

    try {
      const result = await aiChat.send(
        trimmed,
        activeId ?? undefined,
        sentAttachments.map((a) => a.id)
      );

      // Yeni sohbet açıldıysa listeyi tazele ki başlık görünsün.
      if (!activeId) {
        setActiveId(result.conversationId);
        aiChat.listConversations().then(setConversations).catch(() => {});
      }

      applyResult(result);
    } catch (err: any) {
      const message = String(err?.message ?? "bilinmeyen hata");
      // 402: kredi yetersiz — kullanıcıyı bilgilendir, hata balonu yerine uyarı göster.
      if (err?.status === 402) setCreditsBlocked(true);
      setError(message);
      // Ekler sunucuda hâlâ duruyor (kısa ömürlü). Geri konmazsa kullanıcı aynı
      // dosyayı yeniden yüklemek zorunda kalır — sesli dosyada bu ikinci kez ücret demek.
      setAttachments(sentAttachments);
      refreshCredits();
    } finally {
      setSending(false);
    }
  };

  /**
   * Dışarıdan gelen açılış mesajını işler (bkz. lib/askLio.ts).
   *
   * İki kip var: gönder (Takvim'in "Lio ile planla"sı gibi niyeti net düğmeler)
   * ve taslak (kartlardaki Lio simgeleri — cümle kutuya yazılır, kullanıcı
   * düzenleyip gönderir).
   *
   * `sentInitialRef` React 18'in geliştirme modundaki çift render'ına karşı:
   * o olmadan aynı mesaj iki kez gidip kullanıcıdan iki kez kredi düşerdi.
   */
  const sentInitialRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open || !initialMessage || sending) return;
    if (sentInitialRef.current === initialMessage) return;
    sentInitialRef.current = initialMessage;
    if (initialAutoSend) {
      // GÖNDER kipi temiz bir sohbette başlar: takvim planlaması, yarım kalmış
      // bir bütçe konuşmasının altına eklenmemeli.
      setActiveId(null);
      setMessages([]);
      void send(initialMessage);
    } else {
      // TASLAK kipinde sohbet SIFIRLANMAZ. Burada henüz bir şey gönderilmiyor,
      // yalnızca kutuya cümle yazılıyor; açık konuşmayı silmek, kullanıcının
      // bir karttaki Lio simgesine dokunmasının bedelini "o ana kadarki
      // sohbeti kaybetmek" yapardı. Konu değiştirmek isteyen zaten "Yeni
      // sohbet"e basabiliyor.
      setInput(initialMessage);
      // Odak kutuya: kullanıcı cümleyi hemen düzenlemeye başlayabilsin. Panel
      // açılış animasyonu bitmeden odaklamak bazı tarayıcılarda çalışmıyor.
      setTimeout(() => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }, 80);
    }
    onInitialMessageSent?.();
    // `send` her render'da yeniden oluşuyor; bağımlılığa eklemek döngü yapar.
  }, [open, initialMessage]);

  /**
   * Duraklatılmış koşuyu sürdürür. Sonuç yine duraklatma olabilir (iş hâlâ
   * bitmediyse) — o yüzden akış aynı yerden yeniden kurulur.
   */
  /**
   * Sunucudan gelen her sohbet sonucunu ekrana yansıtır.
   *
   * Gönderme, "devam et" ve onay akışlarının üçü de aynı sonuç tipini döndürüyor —
   * onay verildikten sonra istek kaldığı yerden sürdüğü için oradan da yeni bir
   * onay, duraklatma ya da kredi uyarısı gelebiliyor. Üç yerde ayrı ayrı ele almak
   * bu durumların birinde eksik kalmayı garanti ederdi.
   */
  const applyResult = (result: AiChatResult) => {
    setCredits((prev) => (prev ? { ...prev, balance: result.usage.balance } : prev));
    setActiveFiles(result.activeFiles ?? []);

    const pushBubble = (text: string) =>
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}-${prev.length}`,
          role: "assistant",
          content: text,
          creditsCharged: result.usage.creditsCharged,
          fresh: true,
        },
      ]);

    if (result.type === "confirmation") {
      if (result.text) pushBubble(result.text);
      setConfirmation({ actionId: result.actionId, summary: result.summary });
      return;
    }

    pushBubble(result.text);
    if (result.type === "continuation") setContinuation(result);
    if (result.type === "out_of_credits") setCreditsBlocked(true);
  };

  const handleContinueRun = async (approveAll: boolean) => {
    const pending = continuation;
    if (!pending) return;
    setContinuation(null);
    setSending(true);
    setError(null);
    try {
      // Kademe yükseltme seçeneği yok: model kararı yöneticide.
      applyResult(await aiChat.continueRun(pending.runId, true, approveAll));
    } catch (err: any) {
      if (err?.status === 402) setCreditsBlocked(true);
      setError(String(err?.message ?? "Devam edilemedi."));
      refreshCredits();
    } finally {
      setSending(false);
    }
  };

  const handleStopRun = () => {
    const pending = continuation;
    setContinuation(null);
    if (!pending) return;
    aiChat
      .continueRun(pending.runId, false)
      .then((res) =>
        setMessages((prev) => [
          ...prev,
          // Durdurma her zaman düz bir mesajla döner; tip birleşimi yüzünden yine de daraltılıyor.
          { id: `c-${Date.now()}`, role: "assistant", content: res.type === "message" ? res.text : "Durduruldu." },
        ])
      )
      .catch(() => {});
  };

  /**
   * Onay verildikten sonra istek KALDIĞI YERDEN devam ediyor; bu yüzden yanıt
   * gelene kadar "düşünüyor" durumunda kalınır ve sonuç normal akıştan geçer.
   */
  const runConfirmation = async (actionId: string, confirmed: boolean) => {
    setConfirmation(null);
    setSending(true);
    setError(null);
    try {
      applyResult(await aiChat.confirm(actionId, confirmed));
    } catch (err: any) {
      if (err?.status === 402) setCreditsBlocked(true);
      setError(String(err?.message ?? "İşlem tamamlanamadı."));
      refreshCredits();
    } finally {
      setSending(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmation) return;
    await runConfirmation(confirmation.actionId, true);
  };

  const handleCancelAction = () => {
    if (!confirmation) return;
    void runConfirmation(confirmation.actionId, false);
  };

  const lowBalance = useMemo(
    () => !!credits && credits.balance < (credits.minBalanceToStart || 20),
    [credits]
  );

  // Genişlik layout.ts'ten: Lio'nun bildirim şeridi panel açıkken bu değerin
  // soluna konumlanıyor (bkz. lioActivityAnchor).
  const panelWidth = isDesktop ? AI_PANEL_WIDTH : undefined;

  /**
   * Yazma kutusunun içine oturan yuvarlak düğmeler.
   *
   * Alta hizalı: kutu yazdıkça büyüyor, düğmeler ortada dursaydı metinle
   * birlikte kayarlardı. Kenarlıksız duruyorlar — kutunun kendi çerçevesi
   * zaten bir sınır çiziyor, ikinci bir çerçeve kalabalık görünüyordu.
   */
  const boxIconStyle: React.CSSProperties = {
    position: "absolute",
    bottom: 7,
    width: 32,
    height: 32,
    borderRadius: 10,
    border: "none",
    background: "transparent",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  };

  return (
    <>
      {/* Arka plan karartması */}
      {open && (
        <div
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(26,31,41,0.35)",
            zIndex: Z.aiPanelScrim,
            animation: "projelioAiFade .18s ease",
          }}
        />
      )}

      <style>{`
        @keyframes projelioAiFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes projelioAiSlide { from { transform: translateX(24px); opacity: .4 } to { transform: translateX(0); opacity: 1 } }
        @keyframes projelioAiPulse { 0%,100% { opacity: .35 } 50% { opacity: 1 } }
      `}</style>

      <aside
        aria-hidden={!open}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: panelWidth ?? "100%",
          maxWidth: "100vw",
          background: c.surface,
          borderLeft: `1px solid ${c.border}`,
          boxShadow: "-8px 0 32px rgba(26,31,41,0.16)",
          zIndex: Z.aiPanel,
          display: open ? "flex" : "none",
          flexDirection: "column",
          animation: "projelioAiSlide .22s ease",
        }}
      >
        {/* Başlık */}
        <header
          style={{
            padding: "16px 18px",
            background: c.primaryDark,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            <img src="/lio-open.png" alt="Lio" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.2 }}>{t("Lio")}</div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              {credits ? `${formatCredits(credits.balance)} kredi` : "Yükleniyor…"}
            </div>
          </div>

          {voiceSupported && (
            <HeaderButton title={t("Ses ayarları")} onClick={() => setVoiceMenu((v) => !v)} active={voiceMenu}>
              <IconSpeaker size={17} color="#fff" muted={!autoSpeak} />
            </HeaderButton>
          )}
          <HeaderButton title={t("Sohbet geçmişi")} onClick={() => setShowHistory((v) => !v)} active={showHistory}>
            <IconMessagesGlyph color="#fff" />
          </HeaderButton>
          <HeaderButton title="Yeni sohbet" onClick={startNewConversation}>
            <IconPlus size={17} color="#fff" />
          </HeaderButton>
          <HeaderButton title="Kapat" onClick={onClose}>
            <IconX size={17} color="#fff" />
          </HeaderButton>
        </header>

        {/* Ses ayarları. Başlıktaki hoparlöre basınca açılır; asıl seslendirme
            artık buradan değil, her yanıtın kendi düğmesinden yapılıyor. */}
        {voiceMenu && (
          <div
            style={{
              borderBottom: `1px solid ${c.border}`,
              background: c.background,
              padding: "12px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              flexShrink: 0,
            }}
          >
            <div style={{ fontSize: 12, color: c.textSecondary }}>
              {t("Her yanıtın yanındaki hoparlöre basarak dinleyebilirsin.")}
            </div>

            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: c.textSecondary }}>
              {t("Ses kaynağı")}
              <select
                value={voiceEngine}
                onChange={(e) => chooseVoiceEngine(e.target.value as VoiceEngine)}
                style={{
                  fontSize: 13,
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: `1px solid ${voiceEngine === "server" ? c.warning : c.border}`,
                  background: c.surface,
                  color: c.textPrimary,
                }}
              >
                <option value="browser">{t("Tarayıcı sesi · ücretsiz")}</option>
                <option value="server">
                  Doğal ses · ~{SERVER_VOICE_CREDITS_PER_100_CHARS} kredi/100 karakter
                </option>
              </select>
            </label>

            {/* Doğal sesin hangi ses olacağı. Seçenekler sunucudan geliyor:
                hangi seslerin geçerli olduğu kullanılan TTS modeline bağlı ve
                bu bilgi orada duruyor. */}
            {voiceEngine === "server" && serverVoices.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: c.textSecondary }}>
                  {t("Doğal ses")}
                  <select
                    value={serverVoice}
                    onChange={(e) => chooseServerVoice(e.target.value)}
                    style={{
                      fontSize: 13,
                      padding: "6px 8px",
                      borderRadius: 8,
                      border: `1px solid ${c.border}`,
                      background: c.surface,
                      color: c.textPrimary,
                    }}
                  >
                    {serverVoices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label} — {v.description}
                      </option>
                    ))}
                  </select>
                </label>

                {/* Denemeden seçmek zor; kısa bir örnek cümle okutuluyor.
                    Bedeli etikette yazılı, çünkü deneme de ücretli. */}
                <button
                  type="button"
                  onClick={() => void sampleVoice()}
                  disabled={samplingVoice}
                  style={{
                    alignSelf: "flex-start",
                    padding: "5px 10px",
                    borderRadius: 8,
                    border: `1px solid ${c.border}`,
                    background: "transparent",
                    color: c.textPrimary,
                    fontSize: 12,
                    cursor: samplingVoice ? "default" : "pointer",
                    opacity: samplingVoice ? 0.6 : 1,
                  }}
                >
                  {samplingVoice
                    ? "Hazırlanıyor…"
                    : `Bu sesi dene (~${Math.ceil(
                        (VOICE_SAMPLE.length / 100) * SERVER_VOICE_CREDITS_PER_100_CHARS
                      )} kredi)`}
                </button>
              </div>
            )}

            {/* Ses adı yalnızca tarayıcı sentezinde anlamlı. */}
            {voiceEngine === "browser" && voiceList.length > 1 && (
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: c.textSecondary }}>
                {t("Okuma sesi")}
                <select
                  value={voiceName}
                  onChange={(e) => chooseVoiceName(e.target.value)}
                  style={{
                    fontSize: 13,
                    padding: "6px 8px",
                    borderRadius: 8,
                    border: `1px solid ${c.border}`,
                    background: c.surface,
                    color: c.textPrimary,
                  }}
                >
                  <option value="">{t("Otomatik")}</option>
                  {voiceList.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {voiceEngine === "browser" && turkishVoiceMissing && (
              <div style={{ fontSize: 11.5, color: c.warning, lineHeight: 1.4 }}>
                Cihazında Türkçe ses yok; okunuş bozuk olabilir. Sistem ayarlarından Türkçe bir ses
                yükleyebilir ya da "Doğal ses"e geçebilirsin.
              </div>
            )}

            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: c.textPrimary, cursor: "pointer" }}>
              <input type="checkbox" checked={autoSpeak} onChange={toggleAutoSpeak} />
              Yeni yanıtları kendiliğinden oku
              {voiceEngine === "server" && (
                <span style={{ color: c.warning, fontSize: 11 }}>{t("(her yanıt kredi harcar)")}</span>
              )}
            </label>
          </div>
        )}

        {/* Sohbet geçmişi çekmecesi */}
        {showHistory && (
          <div
            style={{
              borderBottom: `1px solid ${c.border}`,
              background: c.background,
              maxHeight: 220,
              overflowY: "auto",
              flexShrink: 0,
            }}
          >
            {conversations.length === 0 ? (
              <p style={{ padding: 16, margin: 0, fontSize: 13, color: c.textSecondary }}>{t("Henüz sohbet yok.")}</p>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => openConversation(conv.id)}
                  style={{
                    padding: "10px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer",
                    background: conv.id === activeId ? c.surface : "transparent",
                    borderBottom: `1px solid ${c.border}`,
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      fontSize: 13,
                      color: c.textPrimary,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {conv.title}
                  </span>
                  <button
                    onClick={(e) => handleDeleteConversation(conv.id, e)}
                    aria-label="Sohbeti sil"
                    style={{ background: "transparent", border: "none", padding: 4, display: "flex", cursor: "pointer" }}
                  >
                    <IconTrash size={14} color={c.textSecondary} />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* Sohbette açık dosyalar. Her turda modele gittikleri için görünür
            olmaları gerekiyor: kullanıcı neyin ücretlendirildiğini bilmeli. */}
        {activeFiles.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 14px",
              borderBottom: `1px solid ${c.border}`,
              background: c.background,
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 11.5, color: c.textSecondary, flexShrink: 0 }}>{t("Sohbette açık:")}</span>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", flex: 1, minWidth: 0 }}>
              {activeFiles.map((file) => (
                <span
                  key={file.id}
                  title={`${file.detail} — iş bitene kadar her turda Lio'ya gönderiliyor`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "3px 8px",
                    borderRadius: 999,
                    border: `1px solid ${c.accent}`,
                    fontSize: 11.5,
                    color: c.textPrimary,
                    maxWidth: 180,
                  }}
                >
                  <IconFile size={12} color={c.accent} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {file.name}
                  </span>
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={clearActiveFiles}
              title={t("Dosyaları bırak")}
              style={{
                background: "transparent",
                border: "none",
                padding: 4,
                display: "flex",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <IconX size={13} color={c.textSecondary} />
            </button>
          </div>
        )}

        {/* Mesajlar */}
        <div
          ref={scrollRef}
          style={{ flex: 1, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 12 }}
        >
          {messages.length === 0 && !loadingHistory && (
            <>
              <Bubble role="assistant" text={t(GREETING)} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                {/* Çipte ÇEVRİLMİŞ metin görünür ama Lio'ya gönderilen metin,
                    kullanıcının kendi dilinde olmalı: t(s) gönderilir. */}
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => void send(t(s))}
                    disabled={sending}
                    style={{
                      padding: "7px 12px",
                      borderRadius: 999,
                      border: `1px solid ${c.border}`,
                      background: c.background,
                      color: c.textPrimary,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    {t(s)}
                  </button>
                ))}
              </div>
            </>
          )}

          {loadingHistory && <p style={{ fontSize: 13, color: c.textSecondary }}>{t("Sohbet yükleniyor…")}</p>}

          {messages.map((m) => (
            <Bubble
              key={m.id}
              role={m.role}
              text={m.content}
              credits={m.creditsCharged}
              attachments={m.attachments}
              canSpeak={voiceSupported && m.role === "assistant" && !!m.content}
              speaking={speakingId === m.id}
              preparing={preparingId === m.id}
              onSpeak={() => void playMessage(m)}
              onOpenFile={(fileId) => void openFilePreview(fileId)}
            />
          ))}

          {sending && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: c.textSecondary, fontSize: 13 }}>
              <span style={{ animation: "projelioAiPulse 1.2s ease infinite" }}>
                <IconSparkle size={15} color={c.accent} />
              </span>
              {t("Düşünüyor…")}
            </div>
          )}
        </div>

        {/* Hata / kredi uyarısı */}
        {(error || lowBalance || creditsBlocked) && (
          <div
            style={{
              margin: "0 14px 10px",
              padding: "10px 12px",
              borderRadius: 10,
              background: error ? "rgba(193,52,52,0.08)" : "rgba(192,129,63,0.10)",
              border: `1px solid ${error ? c.danger : c.warning}`,
              color: error ? c.danger : c.accentDark,
              fontSize: 13,
              lineHeight: 1.45,
            }}
          >
            {error ??
              (creditsBlocked
                ? "AI kredin bu isteği tamamlamaya yetmedi."
                : "AI krediniz azaldı. Kesintisiz kullanım için kredi yükleyin.")}
            {(creditsBlocked || lowBalance) && (
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  onClick={goToCredits}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "none",
                    background: c.accent,
                    color: "#fff",
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {t("Kredi yükle")}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Yazma alanı */}
        <div style={{ padding: 14, borderTop: `1px solid ${c.border}`, flexShrink: 0, position: "relative" }}>
          {/* İliştirilmiş dosyalar. Okunanlar dökümüyle, okunmayı bekleyenler soluk görünür. */}
          {(attachments.length > 0 || attaching.length > 0) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {attachments.map((attachment) => (
                <span
                  key={attachment.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 8px",
                    borderRadius: 8,
                    border: `1px solid ${c.border}`,
                    background: c.background,
                    fontSize: 12,
                    maxWidth: "100%",
                  }}
                >
                  <IconFile size={13} color={c.accent} />
                  <span
                    style={{
                      color: c.textPrimary,
                      maxWidth: 150,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {attachment.name}
                  </span>
                  <span style={{ color: c.textSecondary }}>{attachment.detail}</span>
                  {attachment.creditsCharged > 0 && (
                    <span style={{ color: c.warning }}>−{Math.round(attachment.creditsCharged)} kredi</span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAttachment(attachment.id)}
                    aria-label={t("Dosyayı çıkar")}
                    style={{ background: "transparent", border: "none", padding: 0, display: "flex", cursor: "pointer" }}
                  >
                    <IconX size={12} color={c.textSecondary} />
                  </button>
                </span>
              ))}
              {attaching.map((name, index) => (
                <span
                  key={`${name}-${index}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 8px",
                    borderRadius: 8,
                    border: `1px dashed ${c.border}`,
                    fontSize: 12,
                    color: c.textSecondary,
                  }}
                >
                  {name} · okunuyor…
                </span>
              ))}
            </div>
          )}

          {/* Ataç menüsü */}
          {attachMenu && (
            <>
              <div onClick={() => setAttachMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 1 }} />
              <div
                style={{
                  // Ataç artık kutunun içinde ve altta; menü tam onun üstünde
                  // açılıyor: 14 (dolgu) + 30 (kademe şeridi) + 7 (düğme boşluğu)
                  // + 32 (düğme) + 9 (aralık).
                  position: "absolute",
                  bottom: 92,
                  left: 14,
                  zIndex: 2,
                  background: c.surface,
                  border: `1px solid ${c.border}`,
                  borderRadius: 10,
                  boxShadow: "0 8px 24px rgba(26,31,41,0.16)",
                  overflow: "hidden",
                  minWidth: 190,
                }}
              >
                {cameraSupported && (
                  <MenuItem onClick={() => cameraInputRef.current?.click()}>{t("Fotoğraf çek")}</MenuItem>
                )}
                <MenuItem onClick={() => fileInputRef.current?.click()}>{t("Bilgisayardan yükle")}</MenuItem>
                <MenuItem onClick={() => void handleCloudPick()}>{t("Drive / OneDrive'dan seç")}</MenuItem>
              </div>
            </>
          )}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            accept=".pdf,.docx,.xlsx,.xlsm,.csv,.txt,.md,.json,image/*,audio/*"
            onChange={(e) => void handleFileInput(e)}
          />

          {/* Kamera: elle yazılmış not/liste fotoğrafını doğrudan çekmek için.
              `environment` arka kamerayı seçer — ön kamera kâğıt okumaya uygun değil. */}
          <input
            ref={cameraInputRef}
            type="file"
            hidden
            accept="image/*"
            capture="environment"
            onChange={(e) => void handleFileInput(e)}
          />

          {(recorder.recording || transcribing || recorder.error) && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
                fontSize: 12,
                color: recorder.error ? c.danger : c.textSecondary,
              }}
            >
              {recorder.error ? (
                recorder.error
              ) : recorder.recording ? (
                <>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: c.danger,
                      animation: "projelioAiPulse 1.2s ease infinite",
                    }}
                  />
                  Dinliyorum… {recorder.seconds} sn — bitirmek için mikrofona tekrar bas
                  <button
                    type="button"
                    onClick={recorder.cancel}
                    style={{
                      marginLeft: "auto",
                      background: "transparent",
                      border: "none",
                      color: c.textSecondary,
                      fontSize: 12,
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    {t("Vazgeç")}
                  </button>
                </>
              ) : (
                "Ses yazıya çevriliyor…"
              )}
            </div>
          )}



          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            {/* Yükseklik JS ile ölçülmüyor: sarmalayıcı bir ızgara ve metnin
                görünmez bir kopyası textarea ile aynı gözü paylaşıyor
                (bkz. index.css .autogrow / .autogrow-chat). Kutu üç satır
                yüksekliğinde başlar, yazdıkça büyür, tavana varınca kaydırır. */}
            {/* Ataç ve mikrofon kutunun İÇİNDE: solda ekleme, sağda ses.
                Sarmalayıcı .autogrow'un DIŞINDA duruyor — o ızgara bir
                `overflow: hidden` taşıyor ve içine konan mutlak konumlu
                düğmeler kırpılabilirdi. */}
            <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
              <div className="autogrow autogrow-chat autogrow-chat--icons" data-replica={input} style={{ fontSize: 14 }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter gönderir, Shift+Enter yeni satır açar — mesaj kutusu
                    // olduğu için satır atlamak gerçekten gerekiyor.
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send(input);
                    }
                  }}
                  rows={1}
                  placeholder="Ne yapmak istersin?"
                  disabled={sending}
                  style={{ color: c.textPrimary }}
                />
              </div>

              <button
                type="button"
                onClick={() => setAttachMenu((v) => !v)}
                disabled={sending}
                aria-label="Dosya ekle"
                title="Dosya ekle"
                style={{ ...boxIconStyle, left: 7, opacity: sending ? 0.4 : 1 }}
              >
                <IconPaperclip size={18} color={c.textSecondary} />
              </button>

              {recorder.supported && (
                <button
                  type="button"
                  onClick={() => void toggleRecording()}
                  disabled={sending || transcribing}
                  aria-label={recorder.recording ? "Kaydı bitir" : "Sesli komut"}
                  title={
                    recorder.recording
                      ? "Kaydı bitir ve yazıya çevir"
                      : "Sesli komut ver (ses çözümleme kredi harcar)"
                  }
                  style={{
                    ...boxIconStyle,
                    right: 7,
                    background: recorder.recording ? "rgba(193,52,52,0.12)" : "transparent",
                    opacity: sending || transcribing ? 0.4 : 1,
                  }}
                >
                  <IconMic size={18} color={recorder.recording ? c.danger : c.textSecondary} />
                </button>
              )}
            </div>
            <button
              onClick={() => void send(input)}
              disabled={sending || (!input.trim() && attachments.length === 0)}
              aria-label={t("Gönder")}
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                border: "none",
                background: c.accent,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                cursor: sending || (!input.trim() && attachments.length === 0) ? "default" : "pointer",
                opacity: sending || (!input.trim() && attachments.length === 0) ? 0.5 : 1,
              }}
            >
              <IconSend size={19} color="#fff" />
            </button>
          </div>
          {/* Kademe/model seçici KALDIRILDI: hangi modelin çalışacağı bir maliyet
              kararıdır ve yönetici belirler (Admin paneli > AI sağlayıcıları).
              Kullanıcıya seçenek göstermek, seçemediği bir şeyi göstermek olurdu. */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "8px 2px 0", flexWrap: "wrap" }}>
            <span style={{ marginLeft: "auto", fontSize: 11, color: c.textSecondary }}>
              {t("Lio hata yapabilir.")}
            </span>
          </div>
        </div>
      </aside>

      {cloudPicker && (
        <AiCloudPickerModal
          conversationId={activeId ?? undefined}
          onClose={() => setCloudPicker(false)}
          onPicked={(attachment) => setAttachments((prev) => [...prev, attachment])}
        />
      )}

      {continuation && (
        <AiContinueDialog
          continuation={continuation}
          onContinue={handleContinueRun}
          onStop={handleStopRun}
        />
      )}

      {confirmation && (
        <ConfirmDialog
          title="Onay gerekiyor"
          message={confirmation.summary}
          confirmLabel="Onayla"
          cancelLabel={t("Vazgeç")}
          danger
          onConfirm={handleConfirmAction}
          onCancel={handleCancelAction}
        />
      )}

      {/* Dosya önizlemesi: kendi portalını kuruyor ve zIndex'i (110) sohbet
          panelinin (61) üstünde, yani panel açıkken de görünüyor. Dosya
          ekranlarındakiyle AYNI pencere — indirme ve "Drive'da düzenle"
          düğmeleri onun içinde. */}
      {filePreview && <FilePreviewModal file={filePreview} onClose={() => setFilePreview(null)} />}
    </>
  );
}

function formatCredits(value: number): string {
  return Math.round(value).toLocaleString("tr-TR");
}

function HeaderButton({
  children,
  onClick,
  title,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        border: "none",
        background: active ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.10)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

function IconMessagesGlyph({ color = "currentColor" }: { color?: string }) {
  return (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h13v9H8l-4 3V5z" />
      <path d="M20 9v11l-3-2.5" />
    </svg>
  );
}

function MenuItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  const c = useThemeColors();
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        padding: "10px 14px",
        background: "transparent",
        border: "none",
        borderBottom: `1px solid ${c.border}`,
        color: c.textPrimary,
        fontSize: 13,
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function Bubble({
  role,
  text,
  credits,
  attachments,
  canSpeak,
  speaking,
  preparing,
  onSpeak,
  onOpenFile,
}: {
  role: "user" | "assistant";
  text: string;
  credits?: number;
  attachments?: AiMessageAttachment[];
  canSpeak?: boolean;
  speaking?: boolean;
  preparing?: boolean;
  onSpeak?: () => void;
  /** Lio'nun verdiği dosya adına tıklanınca önizleme penceresini açar. */
  onOpenFile?: (fileId: string) => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const isUser = role === "user";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start" }}>
      {/* Dosya künyeleri balonun üstünde durur: içeriğin tamamı burada gösterilmez,
          yalnızca ne gönderildiği görünür (çıkarılan metin arayüze hiç gelmiyor). */}
      {!!attachments?.length && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 5,
            marginBottom: 5,
            justifyContent: isUser ? "flex-end" : "flex-start",
            maxWidth: "88%",
          }}
        >
          {attachments.map((attachment, index) => (
            <span
              key={`${attachment.name}-${index}`}
              title={attachment.detail}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "4px 8px",
                borderRadius: 8,
                border: `1px solid ${c.border}`,
                background: c.surface,
                fontSize: 11.5,
                color: c.textSecondary,
              }}
            >
              <IconFile size={12} color={c.accent} />
              <span
                style={{
                  color: c.textPrimary,
                  maxWidth: 140,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {attachment.name}
              </span>
              <span>{t(ATTACHMENT_LABELS[attachment.kind] ?? "Dosya")}</span>
            </span>
          ))}
        </div>
      )}

      {!!text && (
        <div
          style={{
            maxWidth: "88%",
            padding: "10px 13px",
            borderRadius: 14,
            borderBottomRightRadius: isUser ? 4 : 14,
            borderBottomLeftRadius: isUser ? 14 : 4,
            background: isUser ? c.primaryDark : c.background,
            color: isUser ? "#fff" : c.textPrimary,
            fontSize: 14,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {/* Bağlantılar tıklanabilir çizilir; gerisi düz metin kalır
              (bkz. lib/messageLinks — markdown motoru yok, HTML üretilmiyor). */}
          {parseMessageLinks(text).map((segment, i) => {
            // Bağlantı da dosya da aynı görünür: satırın geri kalanından ayırt
            // edilebilmeli, renk tek başına yetmiyor — altı da çizili.
            const linkStyle = {
              color: isUser ? "#fff" : c.accentDark,
              textDecoration: "underline",
              fontWeight: 500,
            } as const;

            if (segment.type === "file") {
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => onOpenFile?.(segment.fileId)}
                  title={t("Dosyayı önizle")}
                  style={{
                    ...linkStyle,
                    // Balonun içinde metnin AKIŞINDA durmalı: varsayılan düğme
                    // kutusu satırı bozuyor ve kendi yazı tipini getiriyordu.
                    display: "inline",
                    background: "none",
                    border: "none",
                    padding: 0,
                    font: "inherit",
                    cursor: "pointer",
                  }}
                >
                  {segment.label}
                </button>
              );
            }

            if (segment.type === "export") {
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    // Rapor sunucuda 30 dakika duruyor; süresi dolmuşsa sunucu
                    // ne olduğunu söylüyor, o cümleyi olduğu gibi gösteriyoruz.
                    aiChat
                      .downloadExport(segment.exportId, segment.label)
                      .catch((e) => alert(e instanceof Error ? e.message : "Rapor indirilemedi."));
                  }}
                  title="Raporu indir"
                  style={{
                    ...linkStyle,
                    display: "inline",
                    background: "none",
                    border: "none",
                    padding: 0,
                    font: "inherit",
                    cursor: "pointer",
                  }}
                >
                  {segment.label}
                </button>
              );
            }

            if (segment.type === "link") {
              return (
                <a key={i} href={segment.href} target="_blank" rel="noreferrer" style={linkStyle}>
                  {segment.label}
                </a>
              );
            }

            return <span key={i}>{segment.value}</span>;
          })}
        </div>
      )}
      {/* Alt satır: kredi bilgisi ve bu yanıtı dinleme düğmesi. Hoparlör her
          yanıtın kendi altında duruyor — kullanıcı hangisini duymak istiyorsa
          ona basıyor, hepsini birden açmak zorunda kalmıyor. */}
      {!isUser && (canSpeak || !!credits) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "3px 4px 0" }}>
          {!!credits && (
            <span style={{ fontSize: 10.5, color: c.textSecondary }}>{Math.round(credits)} kredi</span>
          )}
          {canSpeak && (
            <button
              type="button"
              onClick={onSpeak}
              disabled={preparing}
              aria-label={speaking ? "Okumayı durdur" : "Bu yanıtı dinle"}
              title={preparing ? "Ses hazırlanıyor…" : speaking ? "Okumayı durdur" : "Bu yanıtı dinle"}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                background: "transparent",
                border: "none",
                padding: 0,
                fontSize: 10.5,
                color: speaking ? c.accent : c.textSecondary,
                cursor: preparing ? "default" : "pointer",
                opacity: preparing ? 0.6 : 1,
              }}
            >
              <IconSpeaker size={13} color={speaking ? c.accent : c.textSecondary} muted={false} />
              {preparing ? "hazırlanıyor…" : speaking ? "durdur" : "dinle"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
