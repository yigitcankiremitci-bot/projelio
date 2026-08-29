// Modül alan tanımları packages/shared/src/moduleConfigs/ altında:
//   shared.ts              — tipler ve yardımcılar
//   finans.ts, hukuk.ts …  — departmanın modülleri
//   index.ts               — MODULE_RECORD_CONFIGS kayıt defteri
//
// Tanımlar web'den paylaşılan pakete taşındı ki backend de okuyabilsin
// (Lio'nun modül kaydı ekleyip düzenlemesi için) — bkz. lib/moduleConfigs.ts.
//
// Bu dosya eski import yolunu bozmamak için duruyor. Yeni bir modül tanımı
// eklerken ilgili departman dosyasına yaz, sonra index.ts'teki kayıt defterine
// module_catalog.key ile ekle.
export * from "./moduleConfigs";
