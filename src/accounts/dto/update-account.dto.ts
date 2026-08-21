import { PartialType } from '@nestjs/mapped-types';
import { CreateAccountDto } from './create-account.dto';

/** PATCH /accounts/:id - rename an account or change its type. */
export class UpdateAccountDto extends PartialType(CreateAccountDto) {}
