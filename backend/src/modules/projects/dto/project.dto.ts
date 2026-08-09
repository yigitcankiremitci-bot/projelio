import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";

const PROJECT_STATUSES = ["active", "completed", "archived"] as const;

// NOT: Tüm alanlar bilinçli olarak geniş tutuluyor (ör. tarihler için katı ISO
// formatı zorlanmıyor) — amaç, frontend'in zaten gönderdiği alanları kısıtlamak
// değil, en sık karşılaşılan hatalı girdileri (boş başlık, negatif bütçe,
// DB CHECK kısıtına takılıp anlamsız 500 döndüren geçersiz status değeri)
// oluşma anında, anlamlı bir mesajla engellemek.
export class CreateProjectDto {
  @IsString()
  @IsNotEmpty({ message: "Proje başlığı boş olamaz" })
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  jobId?: string;

  @IsOptional()
  @IsNumber({}, { message: "Bütçe bir sayı olmalı" })
  @Min(0, { message: "Bütçe negatif olamaz" })
  totalBudget?: number;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  deadline?: string;

  @IsOptional()
  @IsIn(PROJECT_STATUSES, { message: `status şunlardan biri olmalı: ${PROJECT_STATUSES.join(", ")}` })
  status?: (typeof PROJECT_STATUSES)[number];
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: "Proje başlığı boş olamaz" })
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber({}, { message: "Bütçe bir sayı olmalı" })
  @Min(0, { message: "Bütçe negatif olamaz" })
  totalBudget?: number;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  deadline?: string;

  @IsOptional()
  @IsIn(PROJECT_STATUSES, { message: `status şunlardan biri olmalı: ${PROJECT_STATUSES.join(", ")}` })
  status?: (typeof PROJECT_STATUSES)[number];

  @IsOptional()
  @IsString()
  coverImageUrl?: string;
}
