import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class BeachIdPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    const id = Number(value);
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(id)) {
      throw new BadRequestException('Beach identifier must be a positive safe integer.');
    }
    return id;
  }
}
