import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { AdminService } from "./admin.service";
import { UsersService } from "../users/users.service";

@Controller("admin")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles("admin")
export class AdminController {
  constructor(
    private adminService: AdminService,
    private usersService: UsersService
  ) {}

  @Get("stats")
  getStats() {
    return this.adminService.getSystemStats();
  }

  // Admin'e özel görünüm: rol zaten @Roles("admin") ile korunuyor, bu yüzden
  // genel /users uç noktasındaki (tüm giriş yapmış kullanıcılara açık) daha
  // sıkı varsayılan üst sınır yerine daha yüksek bir tavan kullanılır.
  @Get("users")
  getUsers() {
    return this.usersService.findAll(1000);
  }
}
