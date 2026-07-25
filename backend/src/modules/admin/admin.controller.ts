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

  @Get("users")
  getUsers() {
    return this.usersService.findAll();
  }
}
