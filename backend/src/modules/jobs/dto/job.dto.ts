import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

// Bu uç eskiden `body: any` alıyordu: ValidationPipe'ın whitelist'i DTO olmayınca
// çalışmıyor, sınırsız uzunlukta metin doğrudan veritabanına yazılabiliyordu.
export class CreateJobDto {
  @IsString()
  @IsNotEmpty({ message: "İş başlığı boş olamaz" })
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  description?: string;

  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;
}
