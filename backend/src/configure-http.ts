import type { INestApplication } from '@nestjs/common';

export function configureHttp(app: INestApplication): void {
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'HEAD', 'OPTIONS'],
  });
  app.getHttpAdapter().getInstance().disable('x-powered-by');
}
