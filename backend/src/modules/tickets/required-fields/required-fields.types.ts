export type TicketRequiredFieldsConfiguration = {
  readonly enabled: boolean;
  readonly globalRequiredOnResolve: readonly string[];
  readonly byService: Readonly<Record<string, readonly string[]>>;
  readonly enforceSchemaRequiredFields: boolean;
};
