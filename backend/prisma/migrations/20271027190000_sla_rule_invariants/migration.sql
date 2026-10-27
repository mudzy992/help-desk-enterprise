-- Fail closed if legacy duplicate effective keys exist; operators must resolve them before release.
CREATE UNIQUE INDEX "SlaRule_effective_key_key"
ON "SlaRule" ("slaProfileId", "priority", "organizationalUnitId", "serviceId") NULLS NOT DISTINCT;

CREATE UNIQUE INDEX "SlaEscalationRule_profile_offset_key"
ON "SlaEscalationRule" ("slaProfileId", "triggerOffsetMinutes");
