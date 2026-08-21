import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  // Exported so AuthModule can reuse the same creation and lookup rules
  // instead of writing a second, slightly different user-creation path.
  exports: [UsersService],
})
export class UsersModule {}
