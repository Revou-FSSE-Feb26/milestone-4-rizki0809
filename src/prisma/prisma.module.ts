import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * @Global so every feature module gets the same PrismaService without having
 * to import PrismaModule itself. This is the seam the Week 20 in-memory stores
 * were replaced through: controllers, DTOs and status codes did not change,
 * only what the services talk to.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
