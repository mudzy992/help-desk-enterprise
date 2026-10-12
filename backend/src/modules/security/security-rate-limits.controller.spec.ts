import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { defaultSecurityRateLimitConfig, securityRateLimitBounds } from '../authentication/security/security-rate-limit-config';
import { UpdateSecurityRateLimitsDto } from './security-rate-limits.controller';

/*
  Review 2026-10-12 (CI run 38244860637, E2E spec 47): the documented body
  `{ config, reason }` never reached the service. `config` declared only
  `@Type()` — a class-transformer decorator, invisible to class-validator — so
  the controller's `whitelist` + `forbidNonWhitelisted` pipe treated it as an
  unknown property and answered
  `400 VALIDATION {"messages":["property config should not exist"]}`.

  Both the admin dialog and the E2E harness send exactly that body, so the whole
  "retune the login rate limits" path was dead on every deployment. These tests
  push real bodies through the *real* pipe and the *real* DTO, so the contract
  cannot break silently again — and they also pin the guard rails that must stay
  in place (bounds, required reason, unknown properties refused).
*/

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

/** A body the bounds accept, with the two values the E2E spec retunes. */
const validConfig = {
  ...defaultSecurityRateLimitConfig,
  ipMaxFailures: 12,
  ipWindowSeconds: 20,
};

async function transform(payload: unknown): Promise<UpdateSecurityRateLimitsDto> {
  return (await pipe.transform(payload, {
    type: 'body',
    metatype: UpdateSecurityRateLimitsDto,
  })) as UpdateSecurityRateLimitsDto;
}

/** The joined messages of the refusal the pipe must produce. */
async function refusal(payload: unknown): Promise<string> {
  try {
    await transform(payload);
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    const body = (error as BadRequestException).getResponse() as { message?: string | readonly string[] };
    const message = body.message;
    return Array.isArray(message) ? message.join('; ') : String(message ?? '');
  }
  throw new Error('the pipe accepted a body it has to refuse');
}

describe('UpdateSecurityRateLimitsDto through the controller pipe', () => {
  it('accepts the documented {config, reason} body and transforms the eight values', async () => {
    const result = await transform({
      config: { ...validConfig, ipMaxFailures: '12' },
      reason: 'E2E: kalibracija IP blokade kroz administratorsku karticu',
    });

    expect(result.reason).toBe('E2E: kalibracija IP blokade kroz administratorsku karticu');
    // `@Type(() => Number)` must survive the fix: the admin form can post strings.
    expect(result.config.ipMaxFailures).toBe(12);
    expect(result.config.ipWindowSeconds).toBe(20);
    expect(result.config.accountDelayStartsAfterFailures).toBe(
      validConfig.accountDelayStartsAfterFailures,
    );
  });

  it('requires the config object instead of silently dropping it', async () => {
    const message = await refusal({ reason: 'E2E: nedostaje konfiguracija' });
    expect(message).toContain('config');
  });

  it('refuses a value below the bound the form advertises', async () => {
    const message = await refusal({
      config: { ...validConfig, ipMaxFailures: securityRateLimitBounds.ipMaxFailures.min - 1 },
      reason: 'E2E: ispod donje granice',
    });
    expect(message).toContain('ipMaxFailures');
  });

  it('refuses a value above the bound', async () => {
    const message = await refusal({
      config: { ...validConfig, ipWindowSeconds: securityRateLimitBounds.ipWindowSeconds.max + 1 },
      reason: 'E2E: iznad gornje granice',
    });
    expect(message).toContain('ipWindowSeconds');
  });

  it('keeps refusing unknown top-level properties', async () => {
    const message = await refusal({
      ...validConfig,
      reason: 'E2E: ravno tijelo umjesto {config, reason}',
    });
    expect(message).toContain('ipMaxFailures');
  });

  it('refuses a reason shorter than five characters', async () => {
    const message = await refusal({ config: validConfig, reason: 'krat' });
    expect(message).toContain('reason');
  });
});
