import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { getJwtSecret } from "../../common/config/env";
import { isSessionPayload, type SessionJwtPayload } from "./session-payload";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(),
    });
  }

  async validate(payload: SessionJwtPayload) {
    // Aynı sırla imzalanmış ama oturum için üretilmemiş jetonlar buradan geçmemeli
    // — gerekçe session-payload.ts'te.
    if (!isSessionPayload(payload)) {
      throw new UnauthorizedException("Bu jeton oturum için geçerli değil");
    }

    return { userId: payload.sub, email: payload.email, role: payload.role, loginAt: payload.loginAt, agent: payload.agent };
  }
}
