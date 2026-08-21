import { OmitType } from '@nestjs/mapped-types';
import { CreateUserDto } from '../../users/dto/create-user.dto';

/**
 * Body of POST /auth/register.
 *
 * Structurally CreateUserDto minus `role`. Dropping the field rather than
 * ignoring it means that with forbidNonWhitelisted enabled, a request that
 * tries to self-register as an admin is rejected with 400 and a message naming
 * the offending property - instead of succeeding while silently doing
 * something different from what was asked.
 *
 * Every user created here gets role 'user' from the database default.
 */
export class RegisterDto extends OmitType(CreateUserDto, ['role'] as const) {}
