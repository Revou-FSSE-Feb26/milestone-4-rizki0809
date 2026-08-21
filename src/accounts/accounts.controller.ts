import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

/**
 * Every route here is behind the global JwtAuthGuard, and every :id route goes
 * through AccountsService.findOwned, which 403s when the account belongs to
 * someone else. Authentication alone is not enough: a logged-in user guessing
 * account ids must not reach another user's money.
 */
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Post()
  create(
    @Body() dto: CreateAccountDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.accounts.create(dto, actor);
  }

  @Get()
  findAll(@CurrentUser() actor: AuthenticatedUser) {
    return this.accounts.findAll(actor);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.accounts.findOne(id, actor);
  }

  /** The account with its transactions, each carrying its nested category. */
  @Get(':id/transactions')
  findTransactions(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.accounts.findTransactions(id, actor);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAccountDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.accounts.update(id, dto, actor);
  }

  /** Cascades to this account's transactions. */
  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.accounts.remove(id, actor);
  }

  /**
   * Admin-only maintenance action: rebuild the cached balance from the
   * transaction history and report the drift. 200 because it repairs an
   * existing resource rather than creating one.
   */
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @Post(':id/recalculate-balance')
  recalculate(@Param('id', ParseIntPipe) id: number) {
    return this.accounts.recalculateBalance(id);
  }
}
