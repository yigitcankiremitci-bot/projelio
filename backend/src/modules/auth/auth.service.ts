import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { UsersService } from "../users/users.service";

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService
  ) {}

  async register(fullName: string, email: string, password: string, username: string) {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.usersService.create({ fullName, email, passwordHash, username });
    return this.signToken(user.id, user.email, user.role);
  }

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException("Geçersiz e-posta veya şifre");
    }
    return this.signToken(user.id, user.email, user.role);
  }

  private signToken(sub: string, email: string, role: string) {
    return { token: this.jwtService.sign({ sub, email, role }) };
  }

  async me(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) return null;
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      username: user.username,
      role: user.role,
      activeTaskId: user.activeTaskId,
    };
  }
}
