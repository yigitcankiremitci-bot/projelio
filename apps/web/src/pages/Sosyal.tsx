import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { ArkadasAramaSonucu, ArkadasKisi, ArkadaslikDurumu, ArkadasOnerisi, ArkadasOzeti, SosyalProfil } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useCurrentUser } from "../lib/useCurrentUser";
import FeedPanel from "../components/panels/FeedPanel";
import ConfirmDialog from "../components/ConfirmDialog";
import { IconUser } from "../components/icons";

/**
 * Sosyal: arkadaşlar ve kişisel duvarlar (bkz. migration 134).
 *
 * Arkadaşlık iş/şirket ilişkisinden bağımsız — aynı işte olmayan iki kişi de
 * arkadaş olabilir. Paylaşım/beğeni/yorum altyapısı proje ve şirket
 * akışlarıyla ORTAK (FeedPanel); burada yalnızca kapsam değişiyor.
 *
 *   /sosyal           → benim + arkadaşlarımın duvarları, arkadaş yönetimi
 *   /sosyal/:userId   → bir kişinin profili ve duvarı (yalnızca arkadaşa açık)
 */
export default function Sosyal() {
  const { userId } = useParams<{ userId?: string }>();
  const { user } = useCurrentUser();
  const c = useThemeColors();
  const isDesktop = useIsDesktop();

  return (
    <div
      style={{
        minHeight: "100vh",
        background: c.background,
        padding: isDesktop ? "28px 28px 40px" : "16px 16px 40px",
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      <div style={{ width: "100%", maxWidth: 720, display: "flex", flexDirection: "column", gap: 18 }}>
        {!user ? null : userId && userId !== user.id ? (
          <KisiSayfasi key={userId} userId={userId} />
        ) : userId ? (
          <KisiSayfasi key={userId} userId={userId} kendim />
        ) : (
          <SosyalAnasayfa benimId={user.id} />
        )}
      </div>
    </div>
  );
}

type Sekme = "akis" | "arkadaslar" | "istekler" | "bul";

function SosyalAnasayfa({ benimId }: { benimId: string }) {
  const c = useThemeColors();
  const t = useT();
  const [params, setParams] = useSearchParams();
  const sekme = (["akis", "arkadaslar", "istekler", "bul"] as const).includes(params.get("sekme") as Sekme)
    ? (params.get("sekme") as Sekme)
    : "akis";
  const [ozet, setOzet] = useState<ArkadasOzeti | null>(null);

  const yukle = useCallback(() => {
    api
      .get<ArkadasOzeti>("/arkadaslar")
      .then(setOzet)
      .catch(() => setOzet({ arkadaslar: [], gelenIstekler: [], gidenIstekler: [] }));
  }, []);
  useEffect(yukle, [yukle]);

  const sekmeler: { anahtar: Sekme; etiket: string; sayi?: number }[] = [
    { anahtar: "akis", etiket: t("Akış") },
    { anahtar: "arkadaslar", etiket: t("Arkadaşlar"), sayi: ozet?.arkadaslar.length },
    { anahtar: "istekler", etiket: t("İstekler"), sayi: ozet?.gelenIstekler.length || undefined },
    { anahtar: "bul", etiket: t("Kişi bul") },
  ];

  return (
    <>
      <div>
        <h1 style={{ margin: 0, fontSize: 26, color: c.textPrimary }}>{t("Sosyal")}</h1>
        <p style={{ margin: "6px 0 0", fontSize: 14, color: c.textSecondary, lineHeight: 1.5 }}>
          {t("Aynı işte olmasanız da arkadaş ekleyebilir, birbirinizin duvarına yazabilirsiniz. Paylaşımları yalnızca arkadaşlar görür.")}
        </p>
      </div>

      <div role="tablist" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {sekmeler.map((s) => {
          const aktif = s.anahtar === sekme;
          return (
            <button
              key={s.anahtar}
              role="tab"
              aria-selected={aktif}
              onClick={() => setParams(s.anahtar === "akis" ? {} : { sekme: s.anahtar }, { replace: true })}
              style={{
                padding: "7px 14px",
                borderRadius: 20,
                border: `1px solid ${aktif ? c.primary : c.border}`,
                background: aktif ? c.primary : c.surface,
                color: aktif ? c.onPrimary : c.textPrimary,
                fontSize: 14,
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {s.etiket}
              {s.sayi !== undefined && s.sayi > 0 && (
                <span
                  style={{
                    fontSize: 12,
                    minWidth: 18,
                    padding: "0 5px",
                    borderRadius: 9,
                    background: s.anahtar === "istekler" ? c.accent : aktif ? c.onPrimary : c.border,
                    color: s.anahtar === "istekler" ? "#fff" : aktif ? c.primary : c.textPrimary,
                  }}
                >
                  {s.sayi}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {sekme === "akis" && (
        <>
          {/* Arkadaşı az olana akışın üstünde birkaç öneri: boş bir akış, kişiyi
              "Kişi bul" sekmesini keşfetmeden sayfayı terk ettiriyordu. */}
          {ozet && ozet.arkadaslar.length < 5 && (
            <OneriListesi tavan={3} onDegisti={yukle} onTumu={() => setParams({ sekme: "bul" }, { replace: true })} />
          )}
          <FeedPanel socialFeed wallUserId={benimId} tasks={[]} />
        </>
      )}
      {sekme === "arkadaslar" && <ArkadasListesi ozet={ozet} onDegisti={yukle} />}
      {sekme === "istekler" && <IstekListesi ozet={ozet} onDegisti={yukle} />}
      {sekme === "bul" && <KisiBul onDegisti={yukle} />}
    </>
  );
}

function ArkadasListesi({ ozet, onDegisti }: { ozet: ArkadasOzeti | null; onDegisti: () => void }) {
  const c = useThemeColors();
  const t = useT();
  const [cikilacak, setCikilacak] = useState<ArkadasKisi | null>(null);

  if (!ozet) return <p style={{ fontSize: 15, color: c.textSecondary }}>{t("Yükleniyor…")}</p>;
  if (ozet.arkadaslar.length === 0) {
    return <BosDurum metin={t("Henüz arkadaşın yok. \"Kişi bul\" sekmesinden adıyla arayabilir ya da önerilere bakabilirsin.")} />;
  }
  return (
    <Liste>
      {ozet.arkadaslar.map((k) => (
        <KisiSatiri
          key={k.userId}
          kisi={k}
          sag={
            <IkincilDugme onClick={() => setCikilacak(k)}>{t("Arkadaşlıktan çık")}</IkincilDugme>
          }
        />
      ))}
      {cikilacak && (
        <ConfirmDialog
          title={t("Arkadaşlıktan çıkılsın mı?")}
          message={t("{ad} ile artık birbirinizin duvarını göremezsiniz. Eski paylaşımlar silinmez.", { ad: cikilacak.fullName })}
          confirmLabel={t("Arkadaşlıktan çık")}
          onCancel={() => setCikilacak(null)}
          onConfirm={async () => {
            await api.delete(`/arkadaslar/${cikilacak.userId}`);
            setCikilacak(null);
            onDegisti();
          }}
        />
      )}
    </Liste>
  );
}

function IstekListesi({ ozet, onDegisti }: { ozet: ArkadasOzeti | null; onDegisti: () => void }) {
  const c = useThemeColors();
  const t = useT();
  const [mesgul, setMesgul] = useState<string | null>(null);

  const yap = async (istekId: string, istek: () => Promise<unknown>) => {
    setMesgul(istekId);
    try {
      await istek();
    } catch {
      // Başarısızsa liste olduğu gibi kalır; kullanıcı tekrar deneyebilir.
    } finally {
      setMesgul(null);
      onDegisti();
    }
  };

  if (!ozet) return <p style={{ fontSize: 15, color: c.textSecondary }}>{t("Yükleniyor…")}</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <AltBaslik>{t("Gelen istekler")}</AltBaslik>
        {ozet.gelenIstekler.length === 0 ? (
          <BosDurum metin={t("Bekleyen arkadaşlık isteği yok.")} />
        ) : (
          <Liste>
            {ozet.gelenIstekler.map((k) => (
              <KisiSatiri
                key={k.istekId}
                kisi={k}
                sag={
                  <div style={{ display: "flex", gap: 6 }}>
                    <AnaDugme
                      disabled={mesgul === k.istekId}
                      onClick={() => yap(k.istekId, () => api.post(`/arkadaslar/istek/${k.istekId}/kabul`, {}))}
                    >
                      {t("Kabul et")}
                    </AnaDugme>
                    <IkincilDugme
                      disabled={mesgul === k.istekId}
                      onClick={() => yap(k.istekId, () => api.post(`/arkadaslar/istek/${k.istekId}/reddet`, {}))}
                    >
                      {t("Reddet")}
                    </IkincilDugme>
                  </div>
                }
              />
            ))}
          </Liste>
        )}
      </div>

      {ozet.gidenIstekler.length > 0 && (
        <div>
          <AltBaslik>{t("Gönderdiğin istekler")}</AltBaslik>
          <Liste>
            {ozet.gidenIstekler.map((k) => (
              <KisiSatiri
                key={k.istekId}
                kisi={k}
                sag={
                  <IkincilDugme
                    disabled={mesgul === k.istekId}
                    onClick={() => yap(k.istekId, () => api.delete(`/arkadaslar/istek/${k.istekId}`))}
                  >
                    {t("Geri çek")}
                  </IkincilDugme>
                }
              />
            ))}
          </Liste>
        </div>
      )}
    </div>
  );
}

function KisiBul({ onDegisti }: { onDegisti: () => void }) {
  const c = useThemeColors();
  const t = useT();
  const [sorgu, setSorgu] = useState("");
  const [sonuclar, setSonuclar] = useState<ArkadasAramaSonucu[] | null>(null);
  const [araniyor, setAraniyor] = useState(false);

  // Sorgu yeterli uzunlukta mı — sunucudaki aramaSorgusuCoz ile aynı eşik (2).
  const aktifSorgu = sorgu.trim().replace(/^@+/, "");
  const aramaVar = aktifSorgu.length >= 2;

  // Yazar yazmaz arar. Kısa bekleme her tuşta istek gitmesini önlüyor ama
  // hissedilmeyecek kadar kısa. Önceki sonuçlar yeni yanıt gelene kadar
  // ekranda kalır: her tuşta listenin boşalıp dolması göz yoruyordu.
  // AbortController: geç dönen eski yanıt yenisini ezmesin.
  useEffect(() => {
    if (!aramaVar) {
      setSonuclar(null);
      setAraniyor(false);
      return;
    }
    const ac = new AbortController();
    setAraniyor(true);
    const zamanlayici = window.setTimeout(() => {
      api
        .get<ArkadasAramaSonucu[]>(`/arkadaslar/ara?q=${encodeURIComponent(sorgu.trim())}`, ac.signal)
        .then((r) => {
          setSonuclar(r);
          setAraniyor(false);
        })
        .catch(() => {});
    }, 150);
    return () => {
      window.clearTimeout(zamanlayici);
      ac.abort();
    };
  }, [sorgu, aramaVar]);

  const durumDegisti = (userId: string, durum: ArkadaslikDurumu) => {
    setSonuclar((onceki) => (onceki ?? []).map((k) => (k.userId === userId ? { ...k, durum } : k)));
    onDegisti();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <input
        value={sorgu}
        onChange={(e) => setSorgu(e.target.value)}
        placeholder={t("Ad, kullanıcı adı ya da e-posta")}
        autoFocus
        type="search"
        style={{ fontSize: 16, padding: "10px 12px", borderRadius: 8 }}
      />
      {!aramaVar ? (
        <OneriListesi onDegisti={onDegisti} />
      ) : sonuclar === null ? (
        <p style={{ margin: 0, fontSize: 14, color: c.textSecondary }}>{t("Aranıyor…")}</p>
      ) : sonuclar.length === 0 ? (
        araniyor ? (
          <p style={{ margin: 0, fontSize: 14, color: c.textSecondary }}>{t("Aranıyor…")}</p>
        ) : (
          <BosDurum metin={t("Kimse bulunamadı.")} />
        )
      ) : (
        <div style={{ opacity: araniyor ? 0.6 : 1, transition: "opacity 120ms" }}>
          <Liste>
            {sonuclar.map((k) => (
              <KisiSatiri
                key={k.userId}
                kisi={k}
                sag={<ArkadaslikDugmesi userId={k.userId} durum={k.durum} onDegisti={(d) => durumDegisti(k.userId, d)} />}
              />
            ))}
          </Liste>
        </div>
      )}
    </div>
  );
}

/**
 * "Tanıyor olabileceğin kişiler": ortak arkadaşlar ve birlikte çalışılanlar
 * (bkz. ArkadaslarService.oneriler). Hiç öneri yoksa hiçbir şey çizmez —
 * boş bir "öneri yok" kutusu Akış'ın üstünde yalnızca gürültü olurdu.
 */
function OneriListesi({ tavan, onDegisti, onTumu }: { tavan?: number; onDegisti: () => void; onTumu?: () => void }) {
  const t = useT();
  const [oneriler, setOneriler] = useState<ArkadasOnerisi[] | null>(null);
  // İstek gönderilen öneri listeden düşmez, düğmesi "İstek gönderildi" olur:
  // satırın aniden kaybolması neye tıklandığını belirsizleştiriyordu.
  const [durumlar, setDurumlar] = useState<Record<string, ArkadaslikDurumu>>({});

  useEffect(() => {
    const ac = new AbortController();
    api
      .get<ArkadasOnerisi[]>("/arkadaslar/oneriler", ac.signal)
      .then(setOneriler)
      .catch(() => {});
    return () => ac.abort();
  }, []);

  if (!oneriler || oneriler.length === 0) return null;
  const gosterilen = tavan ? oneriler.slice(0, tavan) : oneriler;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <AltBaslik>{t("Tanıyor olabileceğin kişiler")}</AltBaslik>
        {onTumu && oneriler.length > gosterilen.length && (
          <button onClick={onTumu} style={{ background: "transparent", border: "none", padding: 0, fontSize: 14, color: "inherit", textDecoration: "underline" }}>
            {t("Tümünü gör")}
          </button>
        )}
      </div>
      <Liste>
        {gosterilen.map((k) => (
          <KisiSatiri
            key={k.userId}
            kisi={k}
            alt={oneriSebebi(k, t)}
            sag={
              <ArkadaslikDugmesi
                userId={k.userId}
                durum={durumlar[k.userId] ?? "yok"}
                onDegisti={(d) => {
                  setDurumlar((onceki) => ({ ...onceki, [k.userId]: d }));
                  onDegisti();
                }}
              />
            }
          />
        ))}
      </Liste>
    </div>
  );
}

function oneriSebebi(k: ArkadasOnerisi, t: ReturnType<typeof useT>): string {
  if (k.ortakArkadasSayisi > 0) return t("{n} ortak arkadaş", { n: k.ortakArkadasSayisi });
  return t("Birlikte çalışıyorsunuz");
}

function KisiSayfasi({ userId, kendim }: { userId: string; kendim?: boolean }) {
  const c = useThemeColors();
  const t = useT();
  const [profil, setProfil] = useState<SosyalProfil | null>(null);
  const [hata, setHata] = useState(false);
  const [cikiyor, setCikiyor] = useState(false);

  const yukle = useCallback(() => {
    api
      .get<SosyalProfil>(`/sosyal/profil/${userId}`)
      .then(setProfil)
      .catch(() => setHata(true));
  }, [userId]);
  useEffect(yukle, [yukle]);

  if (hata) return <BosDurum metin={t("Bu kullanıcı bulunamadı.")} />;
  if (!profil) return <p style={{ fontSize: 15, color: c.textSecondary }}>{t("Yükleniyor…")}</p>;

  return (
    <>
      <Link to="/sosyal" style={{ fontSize: 14, color: c.textSecondary }}>
        ← {t("Sosyal")}
      </Link>
      <div
        style={{
          background: c.surface,
          border: `1px solid ${c.border}`,
          borderRadius: 12,
          padding: 16,
          display: "flex",
          gap: 14,
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <Avatar kisi={profil} boyut={64} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <h1 style={{ margin: 0, fontSize: 22, color: c.textPrimary }}>{profil.fullName}</h1>
          <div style={{ fontSize: 14, color: c.textSecondary, marginTop: 2 }}>
            {[profil.username && `@${profil.username}`, profil.title].filter(Boolean).join(" · ")}
          </div>
          {profil.bio && <p style={{ margin: "8px 0 0", fontSize: 15, color: c.textPrimary, lineHeight: 1.45 }}>{profil.bio}</p>}
          {profil.duvariGorebilir && (
            <div style={{ fontSize: 13, color: c.textSecondary, marginTop: 8 }}>
              {t("{n} arkadaş", { n: profil.arkadasSayisi })}
            </div>
          )}
        </div>
        {!kendim && (
          <div style={{ display: "flex", gap: 6 }}>
            {profil.durum === "arkadas" ? (
              <IkincilDugme onClick={() => setCikiyor(true)}>{t("Arkadaşlıktan çık")}</IkincilDugme>
            ) : (
              <ArkadaslikDugmesi userId={profil.userId} durum={profil.durum} onDegisti={yukle} />
            )}
          </div>
        )}
      </div>

      {profil.duvariGorebilir ? (
        <FeedPanel wallUserId={profil.userId} tasks={[]} />
      ) : (
        <BosDurum metin={t("{ad} ile arkadaş olunca paylaşımlarını görebilir, duvarına yazabilirsin.", { ad: profil.fullName })} />
      )}

      {cikiyor && (
        <ConfirmDialog
          title={t("Arkadaşlıktan çıkılsın mı?")}
          message={t("{ad} ile artık birbirinizin duvarını göremezsiniz. Eski paylaşımlar silinmez.", { ad: profil.fullName })}
          confirmLabel={t("Arkadaşlıktan çık")}
          onCancel={() => setCikiyor(false)}
          onConfirm={async () => {
            await api.delete(`/arkadaslar/${profil.userId}`);
            setCikiyor(false);
            yukle();
          }}
        />
      )}
    </>
  );
}

/**
 * İlişkiye göre tek düğme. Gelen isteği kabul etmek de aynı uçtan geçer:
 * karşı taraf zaten istemişse "istek göndermek" kabul etmek demek (bkz.
 * arkadaslik-durumu.ts istekKarari). Reddetmek ve geri çekmek İstekler sekmesinde.
 */
function ArkadaslikDugmesi({
  userId,
  durum,
  onDegisti,
}: {
  userId: string;
  durum: ArkadaslikDurumu;
  onDegisti: (durum: ArkadaslikDurumu) => void;
}) {
  const t = useT();
  const [mesgul, setMesgul] = useState(false);

  if (durum === "kendisi") return null;
  if (durum === "arkadas") return <IkincilDugme disabled>{t("Arkadaşsınız")}</IkincilDugme>;
  if (durum === "giden_istek") return <IkincilDugme disabled>{t("İstek gönderildi")}</IkincilDugme>;

  const gonder = async () => {
    setMesgul(true);
    try {
      const sonuc = await api.post<{ durum: ArkadaslikDurumu }>("/arkadaslar/istek", { userId });
      onDegisti(sonuc.durum);
    } catch {
      // Gönderilemediyse düğme olduğu gibi kalır.
    } finally {
      setMesgul(false);
    }
  };

  return (
    <AnaDugme disabled={mesgul} onClick={gonder}>
      {durum === "gelen_istek" ? t("İsteği kabul et") : t("Arkadaş ekle")}
    </AnaDugme>
  );
}

// ------------------------------------------------------------ Küçük parçalar

function KisiSatiri({ kisi, sag, alt }: { kisi: ArkadasKisi; sag?: ReactNode; alt?: string }) {
  const c = useThemeColors();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: `1px solid ${c.border}` }}>
      <Link to={`/sosyal/${kisi.userId}`} style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
        <Avatar kisi={kisi} boyut={36} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {kisi.fullName}
          </div>
          <div style={{ fontSize: 13, color: c.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {[kisi.username && `@${kisi.username}`, kisi.title].filter(Boolean).join(" · ")}
          </div>
          {alt && <div style={{ fontSize: 12, color: c.accentDark, marginTop: 1 }}>{alt}</div>}
        </div>
      </Link>
      {sag}
    </div>
  );
}

function Avatar({ kisi, boyut }: { kisi: ArkadasKisi; boyut: number }) {
  const c = useThemeColors();
  return (
    <span
      style={{
        width: boyut,
        height: boyut,
        borderRadius: "50%",
        background: c.border,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        flexShrink: 0,
        position: "relative",
      }}
    >
      <IconUser size={Math.round(boyut * 0.5)} color={c.textSecondary} />
      {kisi.avatarUrl && (
        <img
          src={kisi.avatarUrl}
          // alt bilerek boş: ad hemen yanında yazıyor (bkz. ProfileCard'daki aynı gerekçe).
          alt=""
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}
    </span>
  );
}

function Liste({ children }: { children: ReactNode }) {
  const c = useThemeColors();
  return (
    <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 10, overflow: "hidden" }}>{children}</div>
  );
}

function AltBaslik({ children }: { children: ReactNode }) {
  const c = useThemeColors();
  return <h2 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600, color: c.textSecondary }}>{children}</h2>;
}

function BosDurum({ metin }: { metin: string }) {
  const c = useThemeColors();
  return (
    <p style={{ margin: 0, fontSize: 15, color: c.textSecondary, background: c.surface, border: `1px solid ${c.border}`, borderRadius: 10, padding: 14 }}>
      {metin}
    </p>
  );
}

function AnaDugme({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  const c = useThemeColors();
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ padding: "6px 12px", borderRadius: 7, border: "none", background: c.primary, color: c.onPrimary, fontSize: 14, fontWeight: 500, whiteSpace: "nowrap" }}
    >
      {children}
    </button>
  );
}

function IkincilDugme({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  const c = useThemeColors();
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "6px 12px",
        borderRadius: 7,
        border: `1px solid ${c.border}`,
        background: "transparent",
        color: disabled ? c.textSecondary : c.textPrimary,
        fontSize: 14,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}
