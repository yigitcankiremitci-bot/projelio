import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { PostCommentsService } from "./post-comments.service";

@Controller()
@UseGuards(AuthGuard("jwt"))
export class PostCommentsController {
  constructor(private postCommentsService: PostCommentsService) {}

  @Get("posts/:postId/comments")
  findByPost(@Param("postId") postId: string, @Req() req: any) {
    return this.postCommentsService.findByPost(postId, req.user.userId);
  }

  @Post("posts/:postId/comments")
  create(@Param("postId") postId: string, @Req() req: any, @Body("body") body: string) {
    return this.postCommentsService.create(postId, req.user.userId, body);
  }

  @Post("comments/:commentId/like")
  toggleLike(@Param("commentId") commentId: string, @Req() req: any) {
    return this.postCommentsService.toggleLike(commentId, req.user.userId);
  }
}
