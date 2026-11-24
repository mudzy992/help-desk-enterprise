import {
  logMaxTextLength,
  logRedactedPlaceholder,
  logTruncatedMarker,
  redactAndBoundLogText,
  redactLogText,
} from './log-redaction';

/*
  W1.7 (`BA-xcut-20`). Every case here is something a dependency error or a
  misconfigured client actually echoes back into a log line.
*/
describe('log redaction (W1.7, BA-xcut-20)', () => {
  it('removes key/value secrets in every shape callers emit', () => {
    const cases = [
      'db connect failed password=hunter2 host=db',
      'options {"password":"hunter2","user":"svc"}',
      "retrying with pwd: hunter2",
      'client_secret => abc123',
      'api_key=abc123&page=2',
      'x-api-key: abc123',
      'secret: abc123',
      'session_id=abc123',
      'set-cookie: sid=abc123; Path=/',
    ];
    for (const input of cases) {
      const output = redactLogText(input);
      expect(output).toContain(logRedactedPlaceholder);
      expect(output).not.toContain('abc123');
      expect(output).not.toContain('hunter2');
    }
  });

  it('keeps the surrounding diagnostic text so the line stays useful', () => {
    expect(redactLogText('db connect failed password=hunter2 host=db')).toBe(
      `db connect failed password=${logRedactedPlaceholder} host=db`,
    );
  });

  it('removes bearer and basic credentials', () => {
    expect(redactLogText('Authorization: Bearer abc.def-123')).not.toContain('abc.def-123');
    expect(redactLogText('authorization=Basic dXNlcjpwYXNz')).not.toContain('dXNlcjpwYXNz');
    expect(redactLogText('Authorization: Bearer abc.def-123')).toContain('Bearer');
  });

  it('removes the password from a connection string but keeps the account', () => {
    expect(redactLogText('postgresql://svc:s3cret@db.internal:5432/helpdesk')).toBe(
      `postgresql://svc:${logRedactedPlaceholder}@db.internal:5432/helpdesk`,
    );
    expect(redactLogText('redis://:s3cret@cache:6379')).toBe(
      `redis://:${logRedactedPlaceholder}@cache:6379`,
    );
  });

  it('removes stand-alone tokens and vendor keys', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.c2lnbmF0dXJlLXZhbHVl';
    expect(redactLogText(`token rejected: ${jwt}`)).not.toContain(jwt);
    expect(redactLogText('key sk-abcdefghijklmnopqrstuvwx rejected')).not.toContain('sk-abcdefghijklmnopqrstuvwx');
    expect(redactLogText('key ghp_abcdefghijklmnopqrstuvwx rejected')).not.toContain('ghp_abcdefghijklmnopqrstuvwx');
    expect(redactLogText('key AKIAIOSFODNN7EXAMPLE rejected')).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('leaves ordinary operational lines untouched', () => {
    const line =
      'requestId=8f1c2a4e-0000-4000-8000-000000000000 db_queries_per_request=3 status=500 method=POST path=/tickets ticket=42';
    expect(redactLogText(line)).toBe(line);
  });

  it('is idempotent, so a redacted line can be logged twice', () => {
    const once = redactLogText('password=hunter2 user=svc');
    expect(redactLogText(once)).toBe(once);
  });

  it('strips control characters but keeps newlines and tabs from a stack', () => {
    const output = redactLogText('line\\rbroken\u0007\n\tframe');
    expect(output).toBe('line\\rbroken\n\tframe');
    expect(output).not.toContain('\u0007');
  });

  it('bounds the line and marks what it dropped', () => {
    const long = 'a'.repeat(logMaxTextLength + 500);
    const output = redactAndBoundLogText(long);
    expect(output.length).toBeLessThan(logMaxTextLength + 60);
    expect(output).toContain(logTruncatedMarker);
    expect(output).toContain('+500');
  });

  it('does not add a marker below the bound', () => {
    expect(redactAndBoundLogText('short line')).toBe('short line');
  });
});
