export const installBlueprintConstants = {
  changeLogReason: 'install_wizard',
  /** Same ceiling the structure step uses for names it turns into slugs. */
  maximumNameLength: 120,
} as const;

export const installBlueprintErrorCodes = {
  unknownBlueprint: 'BLUEPRINT_UNKNOWN',
  unknownService: 'BLUEPRINT_SERVICE_UNKNOWN',
  /** The structure step has not run: there is no unit to route the catalog into. */
  structureRequired: 'BLUEPRINT_STRUCTURE_REQUIRED',
  /** A request type of the catalog would not resolve to a handler group. */
  routingUnresolved: 'BLUEPRINT_ROUTING_UNRESOLVED',
  superAdminRequired: 'SUPER_ADMIN_REQUIRED',
} as const;
