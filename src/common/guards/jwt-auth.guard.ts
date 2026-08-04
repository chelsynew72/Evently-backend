import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Standard "must be logged in" guard. Delegates to JwtStrategy, which
 * validates the access token and attaches the user to the request.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
