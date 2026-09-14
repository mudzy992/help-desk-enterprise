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

  it('generates an id when the client did not send one', () => {
    const middleware = new RequestIdMiddleware();
    const request = { headers: {} as Record<string, unknown> };
    middleware.use(request, { setHeader: jest.fn() }, () => undefined);
    expect(typeof request.headers['x-request-id']).toBe('string');
    expect(String(request.headers['x-request-id']).length).toBeGreaterThan(0);
  });
});
