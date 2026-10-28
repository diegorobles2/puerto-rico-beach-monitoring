import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { NwsMappingService } from './nws-mapping.service';

async function run(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const result = await app.get(NwsMappingService).refresh();
    console.log(`NWS mapping complete: ${result.automatic} automatic, ${result.verifiedFallbacks} verified fallbacks, `
      + `${result.preserved} preserved, ${result.unresolved} unresolved, ${result.lookupFailures} lookup failures`);
  } finally {
    await app.close();
  }
}

void run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'NWS mapping failed');
  process.exitCode = 1;
});
