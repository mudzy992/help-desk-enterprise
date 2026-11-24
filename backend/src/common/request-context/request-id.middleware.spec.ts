import { RequestIdMiddleware } from './request-id.middleware';
import { getRequestId } from './request-context.storage';

describe('RequestIdMiddleware', () => {
  it('forwards an incoming id and exposes it on the response and ALS', () => {
    const middleware = new RequestIdMiddleware();
    const request = { headers: { 'x-request-id': 'client-id' } };
    const setHeader = jest.fn();
    let seen: string | undefined;
    middleware.use(request, { setHeader }, () => {
      seen = getRequestId();
    });
    expect(seen).toBe('client-id');
    expect(request.headers['x-request-id']).toBe('client-id');
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', 'client-id');
  });

  it('never echoes a malformed id back or into the request context', () => {
    const middleware = new RequestIdMiddleware();
    const hostile = 'req\r\nSet-Cookie: session=stolen';
    const request = { headers: { 'x-request-id': hostile } };
    const setHeader = jest.fn();
    let seen: string | undefined;
    middleware.use(request, { setHeader }, () => {
      seen = getRequestId();
    });

    const exposed = String(request.headers['x-request-id']);
    expect(exposed).toMatch(/^[0-9a-f-]{36}$/i);
    expect(exposed).not.toContain('\r');
    expect(seen).toBe(exposed);
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', exposed);
    // The hostile value never reached the header writer, so nothing throws and
    // nothing is reflected.
    expect(setHeader.mock.calls.flat().join(' ')).not.toContain('Set-Cookie');
  });

  it('caps the correlation id at the policy bound', () => {
    const middleware = new RequestIdMiddleware();
    const request = { headers: { 'x-request-id': 'y'.repeat(4096) } };
    middleware.use(request, { setHeader: jest.fn() }, () => undefined);
    expect(String(request.headers['x-request-id']).length).toBeLessThanOrEqual(128);
  });

  it('generates an id when the client did not send one', () => {
    const middleware = new RequestIdMiddleware();
    const request = { headers: {} as Record<string, unknown> };
    middleware.use(request, { setHeader: jest.fn() }, () => undefined);
    expect(typeof request.headers['x-request-id']).toBe('string');
    expect(String(request.headers['x-request-id']).length).toBeGreaterThan(0);
  });
});
