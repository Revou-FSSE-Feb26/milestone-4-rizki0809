import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BalanceCalculatorService } from './providers/balance-calculator.service';
import { BcryptPasswordHasher } from './providers/password-hasher';
import { BALANCE_CALCULATOR, PASSWORD_HASHER } from './providers/tokens';

/**
 * The custom dependency-injection providers required by Part 4.
 *
 * Both go beyond a plain `providers: [SomeService]` registration:
 *
 *  1. BALANCE_CALCULATOR - a `useFactory` provider. BalanceCalculatorService
 *     takes a plain `number` (the decimal scale) that Nest's type-based
 *     resolution cannot supply, so the factory reads it from configuration and
 *     constructs the instance itself. Consumers inject the token, which means
 *     the balance rule can be replaced wholesale - say, once transfers gain a
 *     destination account - without editing a single service.
 *
 *  2. PASSWORD_HASHER - a `useClass` provider bound to an interface token, so
 *     AuthService never imports bcrypt directly and a test can inject a fake
 *     hasher instead of burning real bcrypt rounds.
 *
 * @Global because both are cross-cutting: transactions, accounts, auth and
 * users would otherwise each have to import the same module.
 */
@Global()
@Module({
  providers: [
    {
      provide: BALANCE_CALCULATOR,
      useFactory: (config: ConfigService) =>
        new BalanceCalculatorService(
          Number(config.get<string>('MONEY_DECIMAL_PLACES') ?? 2),
        ),
      inject: [ConfigService],
    },
    {
      provide: PASSWORD_HASHER,
      useClass: BcryptPasswordHasher,
    },
  ],
  exports: [BALANCE_CALCULATOR, PASSWORD_HASHER],
})
export class CoreModule {}
