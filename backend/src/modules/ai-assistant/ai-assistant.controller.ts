import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { AiAssistantService, ChatMessageInput } from "./ai-assistant.service";

@Controller("ai")
@UseGuards(AuthGuard("jwt"))
export class AiAssistantController {
  constructor(private aiAssistantService: AiAssistantService) {}

  // Sohbet geçmişini (düz metin) alır, gerekirse araçları kullanarak yanıt üretir.
  // Kritik bir işlem tetiklenirse çalıştırmadan önce { type: "confirmation", ... } döner.
  @Post("chat")
  chat(@Req() req: any, @Body() body: { messages?: ChatMessageInput[] }) {
    return this.aiAssistantService.chat(req.user.userId, req.user.role, body.messages ?? []);
  }

  // Kritik bir işlemi kullanıcı onayından sonra (ya da vazgeçildiğinde) sonuçlandırır.
  @Post("confirm")
  confirm(@Req() req: any, @Body() body: { actionId: string; confirmed: boolean }) {
    return this.aiAssistantService.confirmAction(body.actionId, req.user.userId, !!body.confirmed);
  }
}
