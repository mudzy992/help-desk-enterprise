import type {
  RedactionFieldKey,
  RedactionMode,
  RedactionRisk,
} from './redaction.constants';

export type RedactionPatternDefinition = {
  readonly id: string;
  readonly source: string;
  readonly flags: string;
  readonly risk: RedactionRisk;
};

export type CompiledRedactionPattern = RedactionPatternDefinition & {
  readonly expression: RegExp;
};

export type TicketRedactionConfiguration = {
  readonly enabled: boolean;
  readonly mode: RedactionMode;
  readonly applyToFields: readonly RedactionFieldKey[];
  readonly patterns: readonly RedactionPatternDefinition[];
};

export type RedactionMatch = {
  readonly field: RedactionFieldKey;
  readonly patternId: string;
  readonly risk: RedactionRisk;
};

export type RedactionScanResult = {
  readonly matches: readonly RedactionMatch[];
  readonly blocked: boolean;
};
