import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AddressInfo } from 'node:net';
import { configureApplicationCors } from './configure-application-cors';

@Controller('health')
class CorsProbeController {
  @Get()
  getHealth(): { readonly status: 'ok' } {
    return { status: 'ok' };
  }
}

@Module({ controllers: [CorsProbeController] })
class CorsProbeModule {}

async function createCorsApplication(): Promise<INestApplication> {
  const application = await NestFactory.create(CorsProbeModule, {
    logger: false,
  });
  configureApplicationCors(application);
  await application.listen(0, '127.0.0.1');
  return application;
}

function applicationBaseUrl(application: INestApplication): string {
  const address = application.getHttpServer().address() as AddressInfo | null;
  if (address === null || typeof address === 'string') {
    throw new Error('expected a TCP listen address');
  }
  return `http://127.0.0.1:${address.port}`;
}

describe('configureApplicationCors', () => {
  const originalOrigin = process.env.CORS_ORIGIN;
  const allowedOrigin = 'https://app.example.test';
  let application: INestApplication | undefined;

  afterEach(async () => {
    if (application !== undefined) {
      await application.close();
      application = undefined;
    }
    if (originalOrigin === undefined) {
      delete process.env.CORS_ORIGIN;
      return;
    }
    process.env.CORS_ORIGIN = originalOrigin;
  });

  it('answers OPTIONS preflight with the configured origin and request headers', async () => {
    process.env.CORS_ORIGIN = allowedOrigin;
    application = await createCorsApplication();
    const response = await fetch(`${applicationBaseUrl(application)}/health`, {
      method: 'OPTIONS',
      headers: {
        Origin: allowedOrigin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(
      allowedOrigin,
    );
    expect(response.headers.get('access-control-allow-origin')).not.toBe('*');
    expect(response.headers.get('access-control-allow-credentials')).toBeNull();
    const allowedMethods =
      response.headers.get('access-control-allow-methods') ?? '';
    expect(allowedMethods.toUpperCase()).toContain('POST');
    const allowedHeaders =
      response.headers.get('access-control-allow-headers') ?? '';
    expect(allowedHeaders.toLowerCase()).toContain('authorization');
    expect(allowedHeaders.toLowerCase()).toContain('content-type');
  });

  it('does not reflect a request origin that is not CORS_ORIGIN', async () => {
    process.env.CORS_ORIGIN = allowedOrigin;
    application = await createCorsApplication();
    const response = await fetch(`${applicationBaseUrl(application)}/health`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://other.example.test',
        'Access-Control-Request-Method': 'GET',
      },
    });
    expect(response.headers.get('access-control-allow-origin')).not.toBe(
      'https://other.example.test',
    );
  });
});
