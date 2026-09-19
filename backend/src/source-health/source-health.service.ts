import { Injectable } from '@nestjs/common';
@Injectable()
export class SourceHealthService { getStatus() { return { nws: 'not-configured', drna: 'not-configured' }; } }
