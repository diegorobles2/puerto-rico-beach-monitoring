import { Injectable } from '@nestjs/common';
import type { Beach } from '../types/domain';
@Injectable()
export class BeachesService { findAll(): Beach[] { return []; } }
