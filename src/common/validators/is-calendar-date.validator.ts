import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'isCalendarDate', async: false })
class IsCalendarDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }

    // Round-trip through Date to reject dates that match the shape but do not
    // exist. JS silently rolls 2026-02-30 forward to 2026-03-02, so comparing
    // the parsed date back to the input is what actually catches it.
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a real calendar date in YYYY-MM-DD format`;
  }
}

/**
 * Validates a plain calendar date, e.g. "2026-07-15".
 *
 * transaction_date is a DATE column, not a timestamp - it is the day the money
 * moved, with no time and no timezone. @IsDateString would also accept
 * "2026-07-15T09:00:00+07:00", which is the shape that produces off-by-one-day
 * bugs once a client in another timezone posts it, and its regex still lets
 * impossible dates like 2026-02-30 through.
 */
export function IsCalendarDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsCalendarDateConstraint,
    });
  };
}
