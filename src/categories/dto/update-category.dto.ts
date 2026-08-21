import { PartialType } from '@nestjs/mapped-types';
import { CreateCategoryDto } from './create-category.dto';

/** PATCH /categories/:id (admin-only). */
export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}
