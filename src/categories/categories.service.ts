import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isPrismaError, PrismaErrorCode } from '../common/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

/**
 * Categories are a shared lookup table, not per-user data, so there is no
 * ownership check here. Instead the write paths are admin-only (see
 * CategoriesController) - one shared taxonomy that any user can read and only
 * an admin can change.
 */
@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoryDto) {
    try {
      return await this.prisma.category.create({ data: dto });
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.UNIQUE_VIOLATION)) {
        throw new ConflictException(
          `Category "${dto.name}" already exists as ${dto.type}`,
        );
      }
      throw error;
    }
  }

  async findAll() {
    const categories = await this.prisma.category.findMany({
      include: { _count: { select: { transactions: true } } },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });

    return categories.map(({ _count, ...category }) => ({
      ...category,
      transaction_count: _count.transactions,
    }));
  }

  async findOne(id: number) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { transactions: true } } },
    });

    if (!category) {
      throw new NotFoundException(`Category with id ${id} not found`);
    }

    const { _count, ...rest } = category;
    return { ...rest, transaction_count: _count.transactions };
  }

  async update(id: number, dto: UpdateCategoryDto) {
    await this.assertExists(id);

    try {
      return await this.prisma.category.update({ where: { id }, data: dto });
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.UNIQUE_VIOLATION)) {
        throw new ConflictException(
          `Category "${dto.name}" already exists as ${dto.type}`,
        );
      }
      throw error;
    }
  }

  /**
   * transactions_category_id_fkey is ON DELETE RESTRICT, so deleting a category
   * that history still points at fails at the database rather than orphaning
   * rows. Prisma reports that as P2003; a 409 says "this is a conflict with
   * existing data", which is more useful to a client than a 500.
   */
  async remove(id: number) {
    await this.assertExists(id);

    try {
      return await this.prisma.category.delete({ where: { id } });
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.FOREIGN_KEY_VIOLATION)) {
        throw new ConflictException(
          `Category with id ${id} is still used by existing transactions and cannot be deleted`,
        );
      }
      throw error;
    }
  }

  private async assertExists(id: number): Promise<void> {
    const exists = await this.prisma.category.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException(`Category with id ${id} not found`);
    }
  }
}
