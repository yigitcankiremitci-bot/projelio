import { Injectable } from "@nestjs/common";
import { UsersService } from "../users/users.service";

@Injectable()
export class AdminService {
  constructor(private usersService: UsersService) {}

  async getSystemStats() {
    const users = await this.usersService.findAll();
    // TODO: projects tablosundan aktif/tamamlanmış proje sayıları
    return {
      totalUsers: users.length,
      activeProjects: 0,
      completedProjects: 0,
    };
  }
}
