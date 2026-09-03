import { Injectable } from "@nestjs/common";
import { AiExportStore } from "./ai-export-builder";

/**
 * Lio'nun ürettiği rapor dosyaları — Nest tarafındaki kabuk.
 *
 * Asıl mantık (dosya üretimi, bellekteki depo, sahiplik ve süre) dekoratörsüz
 * olsun diye ai-export-builder.ts'te duruyor; oradaki sınıf testlerden
 * doğrudan kurulabiliyor.
 */
@Injectable()
export class AiExportsService extends AiExportStore {}
