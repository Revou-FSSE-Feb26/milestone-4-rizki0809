import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

describe('AppController', () => {
  let controller: AppController;
  let queryRaw: jest.Mock;

  beforeEach(async () => {
    queryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: PrismaService, useValue: { $queryRaw: queryRaw } },
      ],
    }).compile();

    controller = moduleRef.get(AppController);
  });

  describe('GET /', () => {
    it('advertises the API and its endpoints', () => {
      const info = controller.getApiInfo();

      expect(info.name).toBe('FinTrack API');
      expect(info.endpoints.auth).toContain('POST /auth/login');
      expect(info.endpoints.accounts).toContain(
        'GET /accounts/:id/transactions',
      );
    });
  });

  describe('GET /health', () => {
    it('reports ok when the database answers', async () => {
      const health = await controller.getHealth();

      expect(queryRaw).toHaveBeenCalled();
      expect(health).toMatchObject({ status: 'ok', database: 'up' });
    });

    it('reports degraded rather than throwing when the database is unreachable', async () => {
      queryRaw.mockRejectedValueOnce(new Error('connection refused'));

      const health = await controller.getHealth();

      expect(health).toMatchObject({ status: 'degraded', database: 'down' });
    });
  });
});
