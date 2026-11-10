import { kapakOdagiYaz, type KapakOdagi } from "@projelio/shared";
import { api } from "../api/client";
import { resizeCoverImage } from "./imageProcessing";

/**
 * Kapak fotoğrafını yükler ve kullanıcının seçtiği odak noktasını kaydeder.
 *
 * İki adım, çünkü fotoğrafın adresini ancak sunucu yükleme sonrasında veriyor;
 * odak o adresin parçası (bkz. packages/shared kapakOdagi). Odak ortadaysa
 * ikinci istek hiç atılmaz.
 *
 * `kayitYolu` kaydın kendi ucu ("/jobs/<id>"): yükleme `<yol>/cover`'a,
 * odak `PATCH <yol>`'a gider. İş, proje, rutin, şirket ve grup aynı deseni
 * kullanıyor; departmanın ucu farklı (bkz. DepartmentSettingsModal).
 */
export async function kapakYukle(kayitYolu: string, dosya: File, odak?: KapakOdagi): Promise<void> {
  const kucuk = await resizeCoverImage(dosya);
  const formData = new FormData();
  formData.append("file", kucuk);
  const kayit = await api.uploadFile<{ coverImageUrl?: string } | undefined>(`${kayitYolu}/cover`, formData);
  const adres = kayit?.coverImageUrl;
  if (!adres || !odak) return;
  const odakli = kapakOdagiYaz(adres, odak);
  if (odakli !== adres) await api.patch(kayitYolu, { coverImageUrl: odakli });
}
