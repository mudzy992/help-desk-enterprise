import { BadRequestException } from '@nestjs/common';
import { IsString } from 'class-validator';
import { createGlobalValidationPipe } from './create-global-validation-pipe';

class SampleDto {
  @IsString()
  name!: string;
}

describe('createGlobalValidationPipe (review N6)', () => {
  const pipe = createGlobalValidationPipe();
  const metadata = { type: 'body' as const, metatype: SampleDto };

  it('rejects unknown properties and invalid values', async () => {
    await expect(pipe.transform({ name: 'a', extra: 1 }, metadata)).rejects.toBeInstanceOf(BadRequestException);
    await expect(pipe.transform({ name: 5 }, metadata)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('transforms valid bodies into the DTO class', async () => {
    await expect(pipe.transform({ name: 'a' }, metadata)).resolves.toBeInstanceOf(SampleDto);
  });
});
