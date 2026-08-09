import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";
import type { TaskPriority } from "@projelio/shared";

const TASK_STATUSES = ["todo", "in_progress", "completed"] as const;
const DURATION_UNITS = ["hours", "days"] as const;

// NOT: projects/dto/project.dto.ts'teki ile aynı felsefe — alanlar geniş tutulur,
// yalnızca en sık karşılaşılan hatalı girdiler (boş başlık, negatif bütçe,
// DB CHECK'ine takılıp anlamsız 500 döndüren geçersiz status) engellenir.
export class CreateTaskDto {
  @IsString()
  @IsNotEmpty({ message: "Görev başlığı boş olamaz" })
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  deadline?: string;

  @IsOptional()
  @IsIn(TASK_STATUSES, { message: `status şunlardan biri olmalı: ${TASK_STATUSES.join(", ")}` })
  status?: (typeof TASK_STATUSES)[number];

  @IsOptional()
  @IsString()
  outputId?: string;

  @IsOptional()
  @IsString()
  assignedTo?: string;

  @IsOptional()
  @IsString()
  parentTaskId?: string;

  @IsOptional()
  @IsNumber({}, { message: "Bütçe bir sayı olmalı" })
  @Min(0, { message: "Bütçe negatif olamaz" })
  budget?: number;

  @IsOptional()
  @IsNumber()
  weekNumber?: number;

  @IsOptional()
  @IsNumber()
  estimatedDurationValue?: number;

  @IsOptional()
  @IsIn(DURATION_UNITS)
  estimatedDurationUnit?: (typeof DURATION_UNITS)[number];
}

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: "Görev başlığı boş olamaz" })
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  deadline?: string;

  @IsOptional()
  @IsString()
  assignedTo?: string;

  @IsOptional()
  @IsNumber({}, { message: "Bütçe bir sayı olmalı" })
  @Min(0, { message: "Bütçe negatif olamaz" })
  budget?: number;

  @IsOptional()
  @IsNumber()
  weekNumber?: number;

  @IsOptional()
  @IsString()
  outputId?: string;

  @IsOptional()
  @IsNumber()
  priority?: TaskPriority;

  @IsOptional()
  @IsNumber()
  estimatedDurationValue?: number;

  @IsOptional()
  @IsIn(DURATION_UNITS)
  estimatedDurationUnit?: (typeof DURATION_UNITS)[number];
}
