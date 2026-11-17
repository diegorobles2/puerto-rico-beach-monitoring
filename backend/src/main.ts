import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { IngestionScheduler } from './ingestion/ingestion.scheduler';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.enableCors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' });
  const config = new DocumentBuilder().setTitle('Puerto Rico Beach Monitoring API').setDescription('Beach safety, condition, and report endpoints.').setVersion('0.1.0').build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  await app.listen(Number(process.env.PORT) || 3000);
  app.get(IngestionScheduler).start();
}
void bootstrap();
