/**
 * Injection tokens for the two custom providers.
 *
 * These exist because the things behind them are *contracts*, not classes.
 * Consumers depend on the token (and its interface), never on the concrete
 * implementation, so swapping bcrypt for argon2 - or changing what a
 * 'transfer' does to a balance - is a one-line edit in CoreModule and touches
 * no service, and a unit test can inject a stub without a container.
 *
 * A TypeScript interface does not exist at runtime, so it cannot be a DI token
 * on its own. A string token is the standard way to close that gap.
 */

export const BALANCE_CALCULATOR = 'BALANCE_CALCULATOR';
export const PASSWORD_HASHER = 'PASSWORD_HASHER';
