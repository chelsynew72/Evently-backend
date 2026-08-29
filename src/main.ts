import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap() {
  // rawBody: true is required so the Stripe webhook controller can verify
  // signatures against the exact bytes Stripe sent, while every other
  // route still gets normal parsed JSON automatically.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  const configService = app.get(ConfigService);

  app.use(helmet());

  // CORS_ORIGIN may be a single origin or a comma-separated list. Splitting
  // into an array lets enableCors accept multiple allowed origins; the
  // config default is a concrete localhost origin (never '*').
  const corsOrigin = (configService.get<string>("cors.origin") ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strips properties not defined in the DTO
      forbidNonWhitelisted: true, // rejects requests with unexpected fields
      transform: true, // turns query/param strings into numbers, dates, etc.
    }),
  );

  app.setGlobalPrefix("api/v1");

  const port = configService.get<number>("port") ?? 3000;
  await app.listen(port, "0.0.0.0");
  // eslint-disable-next-line no-console
  console.log(`Evently API running on http://0.0.0.0:${port}/api/v1`);
}

bootstrap();
