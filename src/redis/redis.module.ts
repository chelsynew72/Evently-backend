import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

// @Global so any module can inject RedisService without re-importing this
// module everywhere — same pattern as PrismaModule.
@Global()
@Module({
  providers: [
    {
      provide: RedisService,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        new RedisService(configService.get<string>('redis.url')!),
    },
  ],
  exports: [RedisService],
})
export class RedisModule {}
