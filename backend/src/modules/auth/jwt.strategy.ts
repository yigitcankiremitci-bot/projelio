import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { getJwtSecret } from "../../common/config/env";
import { isSessionPayload, type SessionJwtPayload } from "./session-payload";
import { HesapDurumuService } from "../../common/hesap-durumu/hesap-durumu.service";
import { OTURUM_KARARI_MESAJI } from "../../common/hesap-durumu/oturum-engeli";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private hesapDurumu: HesapDurumuService) {
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

    // İmza geçerli olsa da hesap askıya alınmış ya da oturumları yönetici
    // tarafından iptal edilmiş olabilir. Karar bellekten veriliyor, istek başına
    // veritabanına gidilmiyor (bkz. HesapDurumuService). 401 dönülüyor ki
    // istemci oturumu tek merkezden kapatsın (bkz. apps/web/src/api/client.ts).
    const karar = await this.hesapDurumu.karar(payload.sub, payload.loginAt);
    if (karar !== "gecerli") {
      throw new UnauthorizedException(OTURUM_KARARI_MESAJI[karar]);
    }

    return { userId: payload.sub, email: payload.email, role: payload.role, loginAt: payload.loginAt, agent: payload.agent };
  }
}
