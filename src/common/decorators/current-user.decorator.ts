import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Pulls the authenticated user (attached by JwtAuthGuard) straight into a
 * controller method param: `@CurrentUser() user: AuthUser`.
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
