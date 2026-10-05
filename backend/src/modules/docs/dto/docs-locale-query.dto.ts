import { IsIn, IsOptional } from 'class-validator';

/**
 * Faza 3 dopuna (val 5): jezik sadržaja. `en` vraća prevod kad postoji, a inače
 * bosanski tekst uz `translated: false`; nepoznata vrijednost je 400.
 */
export class DocsLocaleQueryDto {
  @IsOptional()
  @IsIn(['bs', 'en'])
  locale?: string;
}
