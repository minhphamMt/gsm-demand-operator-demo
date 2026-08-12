import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { SupabaseService } from '../supabase/supabase.service';
import { IS_PUBLIC_KEY, ROLES_KEY } from './auth.decorators';
import type { AppRole, AuthenticatedUser } from './auth.types';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: SupabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    if (!token) throw new UnauthorizedException('Missing bearer token');

    const { data, error } = await this.db.client.auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException('Invalid or expired access token');

    const { data: profile, error: profileError } = await this.db.client
      .from('profiles')
      .select('role,is_active')
      .eq('id', data.user.id)
      .maybeSingle();
    if (profileError || !profile?.is_active) throw new ForbiddenException('Inactive or missing profile');

    const appRole = profile.role as AppRole;
    const allowedRoles = this.reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowedRoles?.length && !allowedRoles.includes(appRole)) {
      throw new ForbiddenException('Insufficient role');
    }
    (request as Request & { user: AuthenticatedUser }).user = { ...data.user, appRole };
    return true;
  }
}
