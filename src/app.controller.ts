import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** Both routes are @Public: a monitor cannot present a Bearer token. */
  @Public()
  @Get()
  getApiInfo() {
    return this.appService.getApiInfo();
  }

  @Public()
  @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }
}
