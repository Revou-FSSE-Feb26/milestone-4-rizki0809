import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { TransactionsService } from './transactions.service';

/**
 * Protected by the global JwtAuthGuard. Ownership is inherited: a transaction
 * belongs to whoever owns transactions.account_id -> accounts.user_id, and
 * every route below resolves that before touching a row.
 *
 * Balance recalculation happens in TransactionsService, never here. A
 * controller's job is HTTP; the money rule is domain logic.
 */
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Post()
  create(
    @Body() dto: CreateTransactionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.transactions.create(dto, actor);
  }

  /** Optional filters: account_id, category_id, type, from, to. */
  @Get()
  findAll(
    @Query() query: QueryTransactionsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.transactions.findAll(query, actor);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.transactions.findOne(id, actor);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTransactionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.transactions.update(id, dto, actor);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.transactions.remove(id, actor);
  }
}
