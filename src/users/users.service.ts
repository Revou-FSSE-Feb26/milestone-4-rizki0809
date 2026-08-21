import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { USER_SAFE_SELECT } from '../common/constants';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { isPrismaError, PrismaErrorCode } from '../common/prisma-errors';
import type { PasswordHasher } from '../common/providers/password-hasher';
import { PASSWORD_HASHER } from '../common/providers/tokens';
import { toMoney } from '../common/serialization';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
  ) {}

  /**
   * Creates a user with a bcrypt-hashed password.
   *
   * Every read path in this service passes USER_SAFE_SELECT to Prisma, so the
   * password column is never even loaded - the hash cannot leak from a response
   * it was never fetched into.
   */
  async create(dto: CreateUserDto) {
    try {
      return await this.prisma.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          password: await this.hasher.hash(dto.password),
          role: dto.role ?? Role.USER,
        },
        select: USER_SAFE_SELECT,
      });
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.UNIQUE_VIOLATION)) {
        throw new ConflictException(`Email ${dto.email} is already registered`);
      }
      throw error;
    }
  }

  findAll() {
    return this.prisma.user.findMany({
      select: USER_SAFE_SELECT,
      orderBy: { id: 'asc' },
    });
  }

  /**
   * GET /users/:id - the relational read.
   *
   * One query, three levels deep: the user, their accounts, and a per-account
   * transaction count aggregated by Prisma's `_count`. Doing this with `include`
   * is what keeps it a single round trip instead of one query per account.
   */
  async findOne(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...USER_SAFE_SELECT,
        accounts: {
          select: {
            id: true,
            name: true,
            type: true,
            balance: true,
            created_at: true,
            _count: { select: { transactions: true } },
          },
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    const accounts = user.accounts.map(({ _count, balance, ...account }) => ({
      ...account,
      balance: toMoney(balance),
      transaction_count: _count.transactions,
    }));

    return {
      ...user,
      accounts,
      total_balance: toMoney(
        accounts.reduce((sum, account) => sum + account.balance, 0),
      ),
    };
  }

  /** Used by AuthService only. The one place the password hash is read. */
  findByEmailWithPassword(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async update(id: number, dto: UpdateUserDto, actor: AuthenticatedUser) {
    await this.assertExists(id);

    // Role changes are an admin action. A user PATCHing their own record with
    // {"role":"admin"} gets a 403 rather than a silent no-op, so the attempt is
    // visible in the logs instead of looking like it worked.
    if (dto.role !== undefined && actor.role !== Role.ADMIN) {
      throw new ForbiddenException('Only an admin can change a user role');
    }

    try {
      return await this.prisma.user.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.email !== undefined && { email: dto.email }),
          ...(dto.role !== undefined && { role: dto.role }),
          ...(dto.password !== undefined && {
            password: await this.hasher.hash(dto.password),
          }),
        },
        select: USER_SAFE_SELECT,
      });
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.UNIQUE_VIOLATION)) {
        throw new ConflictException(`Email ${dto.email} is already registered`);
      }
      throw error;
    }
  }

  /**
   * Deleting a user cascades to their accounts and, through those, to their
   * transactions - the ON DELETE CASCADE chain declared in db/schema.sql.
   */
  async remove(id: number) {
    await this.assertExists(id);
    return this.prisma.user.delete({ where: { id }, select: USER_SAFE_SELECT });
  }

  /**
   * A user may read or change their own record; an admin may do it for anyone.
   * Called by the controller before every :id operation.
   */
  assertSelfOrAdmin(targetUserId: number, actor: AuthenticatedUser): void {
    if (actor.role !== Role.ADMIN && actor.id !== targetUserId) {
      throw new ForbiddenException('You may only access your own user record');
    }
  }

  private async assertExists(id: number): Promise<void> {
    const exists = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
  }
}
