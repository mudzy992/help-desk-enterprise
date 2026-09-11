import { TicketsError } from '../tickets.error';
import {
  csatConstants,
  defaultTicketCsatConfiguration,
} from './csat.constants';
import type { TicketCsatConfiguration } from './csat.types';

export function parseTicketCsatConfiguration(input: {
  readonly addonEnabled: unknown;
  readonly enabled: unknown;
  readonly scaleMax: unknown;
  readonly askOnResolved: unknown;
  readonly askOnClosed: unknown;
  readonly samplingRate: unknown;
}): TicketCsatConfiguration {
  if (input.addonEnabled !== true || input.enabled !== true) {
    return {
      ...defaultTicketCsatConfiguration,
      enabled: false,
    };
  }
  if (
    typeof input.askOnResolved !== 'boolean' ||
    typeof input.askOnClosed !== 'boolean'
  ) {
    throw new TicketsError('CSAT_UNAVAILABLE');
  }
  return {
    enabled: true,
    scaleMax: readScaleMax(input.scaleMax),
    askOnResolved: input.askOnResolved,
    askOnClosed: input.askOnClosed,
    samplingRate: readSamplingRate(input.samplingRate),
  };
}

function readScaleMax(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < csatConstants.minimumScaleMax ||
    value > csatConstants.maximumScaleMax
  ) {
    throw new TicketsError('CSAT_UNAVAILABLE');
  }
  return value;
}

function readSamplingRate(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new TicketsError('CSAT_UNAVAILABLE');
  }
  return value;
}
