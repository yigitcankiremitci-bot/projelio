// Modül alan tanımları artık departman bazlı dosyalara bölündü:
//   lib/moduleConfigs/shared.ts              — tipler ve yardımcılar
//   lib/moduleConfigs/finans.ts, hukuk.ts …  — departmanın modülleri
//   lib/moduleConfigs/index.ts               — MODULE_RECORD_CONFIGS kayıt defteri
//
// Bu dosya eski import yolunu bozmamak için duruyor. Yeni bir modül tanımı
// eklerken ilgili departman dosyasına yaz, sonra index.ts'teki kayıt defterine
// module_catalog.key ile ekle.
export * from "./moduleConfigs";
