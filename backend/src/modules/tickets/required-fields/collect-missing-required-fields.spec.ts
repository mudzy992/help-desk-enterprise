import { collectMissingRequiredFields } from './collect-missing-required-fields';
import { defaultTicketCloseCodesConfiguration } from '../close-codes/close-codes.constants';
import { defaultTicketRequiredFieldsConfiguration } from './required-fields.constants';
import type { ServiceFormField } from '../../service-catalog/form-schema.types';

const assetTag: ServiceFormField = {
  id: 'asset_tag',
  label: 'Asset tag',
  type: 'text',
  required: true,
  order: 0,
};

describe('collectMissingRequiredFields', () => {
  it('requires close code and resolution note on resolve', () => {
    expect(
      collectMissingRequiredFields({
        currentStatus: 'IN_PROGRESS',
        nextStatus: 'RESOLVED',
        closeCodeKey: null,
        resolutionNote: null,
        formData: { asset_tag: 'LPT-1' },
        schemaFields: [assetTag],
        serviceId: 'service-vpn',
        closeCodes: defaultTicketCloseCodesConfiguration,
        requiredFields: defaultTicketRequiredFieldsConfiguration,
      }),
    ).toEqual(['close_code', 'resolution_note']);
  });

  it('includes schema required fields when enforcement is on', () => {
    expect(
      collectMissingRequiredFields({
        currentStatus: 'IN_PROGRESS',
        nextStatus: 'RESOLVED',
        closeCodeKey: 'bug_fixed',
        resolutionNote: 'Restored',
        formData: {},
        schemaFields: [assetTag],
        serviceId: 'service-vpn',
        closeCodes: defaultTicketCloseCodesConfiguration,
        requiredFields: defaultTicketRequiredFieldsConfiguration,
      }),
    ).toEqual(['asset_tag']);
  });

  it('skips checks when status does not change to resolve or close', () => {
    expect(
      collectMissingRequiredFields({
        currentStatus: 'IN_PROGRESS',
        nextStatus: 'WAITING_FOR_USER',
        closeCodeKey: null,
        resolutionNote: null,
        formData: {},
        schemaFields: [assetTag],
        serviceId: 'service-vpn',
        closeCodes: defaultTicketCloseCodesConfiguration,
        requiredFields: defaultTicketRequiredFieldsConfiguration,
      }),
    ).toEqual([]);
  });
});
