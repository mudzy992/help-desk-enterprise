import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ExportAuditLogQueryDto } from './dto/export-audit-log-query.dto';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';

const properties = async (value: object) => (await validate(value)).map((error) => error.property).sort();

describe('bounded audit query DTOs', () => {
  it('rejects malformed and oversized OU ids before service/repository work', async () => {
    expect(await properties(plainToInstance(ListAuditLogsQueryDto, { organizationalUnitId: '../other', cursor: 'ok' })))
      .toContain('organizationalUnitId');
    expect(await properties(plainToInstance(ExportAuditLogQueryDto, { organizationalUnitId: 'x'.repeat(129), format: 'json' })))
      .toContain('organizationalUnitId');
  });

  it('rejects malformed and oversized cursor envelopes at the transport boundary', async () => {
    expect(await properties(plainToInstance(ListAuditLogsQueryDto, { organizationalUnitId: 'ou-1', cursor: 'bad=padding' })))
      .toContain('cursor');
    expect(await properties(plainToInstance(ListAuditLogsQueryDto, { organizationalUnitId: 'ou-1', cursor: 'a'.repeat(257) })))
      .toContain('cursor');
  });
});
