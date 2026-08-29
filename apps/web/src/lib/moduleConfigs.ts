// Modül alan tanımları packages/shared'a taşındı.
//
// Sebebi: tanımları yalnızca web biliyordu, backend bilmiyordu. Lio'nun modül
// kaydı ekleyip düzenleyebilmesi için alanların (anahtar, tip, seçenekler)
// backend tarafında da okunabilir olması gerekiyor — iki yerde ayrı ayrı
// tanımlamak yerine tek kaynak paylaşılan pakete alındı.
//
// Yeni bir modül tanımı eklerken:
//   packages/shared/src/moduleConfigs/<departman>.ts  — tanımı yaz
//   packages/shared/src/moduleConfigs/index.ts        — MODULE_RECORD_CONFIGS'e ekle
//
// Bu dosya eski import yolunu ("../lib/moduleConfigs") bozmamak için duruyor.
export * from "@projelio/shared";
