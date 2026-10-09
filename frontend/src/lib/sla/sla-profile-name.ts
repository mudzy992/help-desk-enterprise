type StartingProfileName = {
  readonly defaultName: string;
  readonly translationKey: string;
};

const startingProfileNames: Readonly<Record<string, StartingProfileName>> = {
  ACCESS: {
    defaultName: "Access",
    translationKey: "sla.profileNames.ACCESS",
  },
  STANDARD_REQUEST: {
    defaultName: "Standard request",
    translationKey: "sla.profileNames.STANDARD_REQUEST",
  },
  HR: {
    defaultName: "HR",
    translationKey: "sla.profileNames.HR",
  },
  FINANCE: {
    defaultName: "Finance",
    translationKey: "sla.profileNames.FINANCE",
  },
  INCIDENT: {
    defaultName: "Incident",
    translationKey: "sla.profileNames.INCIDENT",
  },
};

/** Only localize built-in labels; preserve names explicitly customized by an administrator. */
export function slaProfileNameTranslationKey(
  profileKey: string,
  profileName: string,
): string | null {
  const startingProfile = startingProfileNames[profileKey];
  if (
    startingProfile === undefined ||
    (profileName !== startingProfile.defaultName && profileName !== profileKey)
  ) {
    return null;
  }
  return startingProfile.translationKey;
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

export function formatSlaProfileName(
  profileKey: string,
  profileName: string,
  translate: Translate,
): string {
  const translationKey = slaProfileNameTranslationKey(profileKey, profileName);
  return translationKey === null
    ? profileName
    : translate(translationKey, { defaultValue: profileName });
}
