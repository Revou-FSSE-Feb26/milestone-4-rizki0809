import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';

/**
 * PATCH /users/:id - every field optional, same rules when present.
 *
 * PartialType re-applies each validator from CreateUserDto behind
 * @IsOptional, so the rules cannot drift apart between create and update.
 * `role` is present here but UsersService drops it unless the caller is an
 * admin, so a user cannot promote themselves by PATCHing their own record.
 */
export class UpdateUserDto extends PartialType(CreateUserDto) {}
