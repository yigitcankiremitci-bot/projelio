import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { User } from "@projelio/shared";
import { resolveUserTitle } from "@projelio/shared";
import { api } from "../api/client";
import { useT } from "../lib/i18n";
import { IconQr, IconUser } from "./icons";
import EditProfileModal from "./EditProfileModal";
import KartvizitModal from "./kartvizit/KartvizitModal";

/**
 * Kenar çubuğunun dibindeki küçük kişi satırı. Eski kişi kartı her anasayfanın
 * en görünür yerini kaplıyordu; oysa kart bir kimlik işareti, sürekli bakılan
 * bir bilgi değil. Karttaki iki iş (profili düzenle, kartvizit) burada duruyor.
 *
 * Pencereler portal ile açılıyor: kenar çubuğu kendi katmanını kuruyor (bkz.
 * lib/layout Z) ve içinde kalan bir pencere üst şeridin altına düşerdi.
 */
export default function SidebarKisi() {
  const t = useT();
  const [user, setUser] = useState<User | null>(null);
  const [duzenleniyor, setDuzenleniyor] = useState(false);
  const [kartvizit, setKartvizit] = useState(false);

  const yukle = () => {
    api.get<User>("/auth/me").then(setUser).catch(() => setUser(null));
  };
  useEffect(yukle, []);

  if (!user) return null;
  const unvan = resolveUserTitle(user);

  return (
    <>
      <div className="sidebar-kisi">
        <button
          type="button"
          className="sidebar-kisi-profil"
          onClick={() => setDuzenleniyor(true)}
          title={t("Profili düzenle")}
          aria-label={t("Profili düzenle")}
        >
          <span className="sidebar-kisi-foto">
            {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <IconUser size={15} color="currentColor" />}
          </span>
          <span className="sidebar-kisi-yazi">
            <span className="sidebar-kisi-ad">{user.fullName}</span>
            {unvan && <span className="sidebar-kisi-unvan">{unvan}</span>}
          </span>
        </button>
        <button
          type="button"
          className="sidebar-kisi-qr"
          onClick={() => setKartvizit(true)}
          title={t("Dijital kartvizit · QR")}
          aria-label={t("Dijital kartvizit")}
        >
          <IconQr size={15} color="currentColor" />
        </button>
      </div>

      {duzenleniyor &&
        createPortal(
          <EditProfileModal
            user={user}
            onClose={() => setDuzenleniyor(false)}
            onSaved={yukle}
            onKartvizit={() => {
              setDuzenleniyor(false);
              setKartvizit(true);
            }}
          />,
          document.body
        )}
      {kartvizit && createPortal(<KartvizitModal onClose={() => setKartvizit(false)} onProfilDegisti={yukle} />, document.body)}
    </>
  );
}
