import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

/**
 * Body of POST /auth/login.
 *
 * No length or complexity rules on the password here. Login must not tell an
 * attacker anything about the shape of the stored credential - and a legacy
 * password that no longer satisfies the current policy still has to be able to
 * log in.
 */
export class LoginDto {
  @IsEmail({}, { message: 'email must be a valid email address' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'password must not be empty' })
  password: string;
}
