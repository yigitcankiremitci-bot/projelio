import { Injectable } from "@nestjs/common";
import { AiChatJobs } from "./ai-chat-jobs";

/** Lio turlarının arka plan iş deposu — mantık ve gerekçe ai-chat-jobs.ts'te. */
@Injectable()
export class AiChatJobsService extends AiChatJobs {}
