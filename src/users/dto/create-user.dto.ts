import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ROLES, Role } from '../../common/enums/role.enum';

/**
 * Body of POST /users (admin-only).
 *
 * Public sign-up goes through RegisterDto instead, which is this class minus
 * `role` - so nobody can make themselves an admin by adding one field.
 */
export class CreateUserDto {
  @IsString()
  @IsNotEmpty({ message: 'name must not be empty' })
  @MaxLength(100, {
    message: 'name must be at most 100 characters (VARCHAR(100))',
  })
  name: string;

  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(255)
  email: string;

  /**
   * bcrypt only hashes the first 72 bytes of its input, so anything longer is
   * silently truncated. Capping the DTO there makes that explicit instead of
   * surprising.
   */
  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters long' })
  @MaxLength(72, { message: 'password must be at most 72 characters long' })
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'password must contain at least one lowercase letter, one uppercase letter and one digit',
  })
  password: string;

  @IsOptional()
  @IsIn(ROLES, { message: `role must be one of: ${ROLES.join(', ')}` })
  role?: Role;
}
