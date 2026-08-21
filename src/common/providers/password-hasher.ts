import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

/**
 * Hashing contract AuthService and UsersService depend on.
 *
 * They import this interface and the PASSWORD_HASHER token - never `bcrypt`
 * itself. That keeps the choice of algorithm in one file, and lets tests inject
 * a trivial fake instead of paying for real bcrypt rounds on every test case.
 */
export interface PasswordHasher {
  hash(plaintext: string): Promise<string>;
  compare(plaintext: string, hash: string): Promise<boolean>;
}

@Injectable()
export class BcryptPasswordHasher implements PasswordHasher {
  private readonly saltRounds: number;

  constructor(config: ConfigService) {
    this.saltRounds = Number(config.get<string>('BCRYPT_SALT_ROUNDS') ?? 10);
  }

  hash(plaintext: string): Promise<string> {
    return bcrypt.hash(plaintext, this.saltRounds);
  }

  /**
   * bcrypt.compare is constant-time for a given hash, which is what stops an
   * attacker from learning the password one character at a time.
   */
  compare(plaintext: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plaintext, hash);
  }
}
