/**
 * E-posta modülünün sabitleri.
 *
 * Sosyal medyadan farkı: kayıt tanımı DURUYOR. `pd_email` hâlâ module_records
 * kullanıyor (kampanya kayıtları); modüle yalnızca ikinci bir yüzey — canlı
 * gelen kutusu — eklendi. Bu yüzden modül MODULE_RECORD_CONFIGS'ten çıkarılmadı.
 * Bkz. EmailModulePanel.
 */
export const MAIL_MODULE_KEY = "pd_email";

export function isMailModule(moduleKey: string): boolean {
  return moduleKey === MAIL_MODULE_KEY;
}
