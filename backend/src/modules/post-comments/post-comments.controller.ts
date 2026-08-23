import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { PostCommentsService } from "./post-comments.service";
import { AccessService } from "../../common/access/access.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class PostCommentsController {
  constructor(
    private postCommentsService: PostCommentsService,
    private access: AccessService
  ) {}

  // Yorum, bağlı olduğu paylaşımın görünürlüğünü devralır: paylaşımı göremeyen
  // kişi yorumlarını da göremez, oraya yazamaz, beğenemez.
  @Get("posts/:postId/comments")
  async findByPost(@Param("postId") postId: string, @Req() req: any) {
    await this.access.assertCanViewPost(postId, req.user.userId);
    return this.postCommentsService.findByPost(postId, req.user.userId);
  }

  @Post("posts/:postId/comments")
  async create(@Param("postId") postId: string, @Req() req: any, @Body("body") body: string) {
    await this.access.assertCanViewPost(postId, req.user.userId);
    return this.postCommentsService.create(postId, req.user.userId, body);
  }

  @Post("comments/:commentId/like")
  async toggleLike(@Param("commentId") commentId: string, @Req() req: any) {
    await this.access.assertCanViewPostComment(commentId, req.user.userId);
    return this.postCommentsService.toggleLike(commentId, req.user.userId);
  }
}
