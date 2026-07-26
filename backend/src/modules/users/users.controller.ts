import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { UsersService } from "./users.service";

@Controller("users")
@UseGuards(AuthGuard("jwt"))
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  // NOT: bu route ":id" ile çakışmaması için ondan önce tanımlanmalı.
  @Get("search")
  search(@Query("q") q: string) {
    return this.usersService.search(q ?? "");
  }

  @Patch("me/username")
  updateUsername(@Req() req: any, @Body("username") username: string) {
    return this.usersService.updateUsername(req.user.userId, username);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.usersService.findByIdPublic(id);
  }
}
