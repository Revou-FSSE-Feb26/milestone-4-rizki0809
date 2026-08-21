import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { CATEGORY_TYPES } from '../../common/constants';
import type { CategoryType } from '../../common/constants';

/**
 * Body of POST /categories (admin-only).
 *
 * NOTE the enum here is income|expense only. transactions.type is a different
 * enum that also allows 'transfer'; a transfer is not a category of spending,
 * which is why the two must not be conflated.
 */
export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty({ message: 'name must not be empty' })
  @MaxLength(60, {
    message: 'name must be at most 60 characters (VARCHAR(60))',
  })
  name: string;

  @IsIn(CATEGORY_TYPES, {
    message: `type must be one of: ${CATEGORY_TYPES.join(', ')}`,
  })
  type: CategoryType;
}
