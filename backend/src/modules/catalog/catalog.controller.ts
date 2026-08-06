import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CatalogService } from "./catalog.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class CatalogController {
  constructor(private catalogService: CatalogService) {}

  @Get("department-catalog")
  findDepartments() {
    return this.catalogService.findDepartments();
  }

  @Get("module-catalog")
  findModules(@Query("departmentKey") departmentKey?: string, @Query("freelancer") freelancer?: string) {
    return this.catalogService.findModules({ departmentKey, freelancerOnly: freelancer === "true" });
  }
}
