import { resolveInstallNextStep } from './resolve-install-next-step';
import { toInstallStepStates } from '../read-install-step-states';
import {
  isInstallStepBlocking,
  type InstallProfile,
  type InstallStepDefinition,
  type InstallStepKey,
  type InstallStepProgress,
  type InstallStepProgressMap,
  type InstallStepStates,
} from './install-step.types';

const stepKeys: readonly InstallStepKey[] = [
  'profile',
  'superAdmin',
  'identity',
  'loginProvider',
  'smtp',
  'seed',
  'team',
  'addons',
];

function progress(
  completed: readonly InstallStepKey[] = [],
  skipped: readonly InstallStepKey[] = [],
): InstallStepProgressMap {
  const map = {} as Record<InstallStepKey, InstallStepProgress>;
  for (const key of stepKeys) {
    map[key] = { completed: completed.includes(key), skipped: skipped.includes(key) };
  }
  return map;
}

function resolve(
  profile: InstallProfile | null,
  completed: readonly InstallStepKey[] = [],
  skipped: readonly InstallStepKey[] = [],
) {
  return resolveInstallNextStep({
    profile,
    states: toInstallStepStates(profile, progress(completed, skipped)),
  });
}

describe('resolveInstallNextStep', () => {
  it('asks for the package first, even while none is stored', () => {
    // F3: the package is the wizard's first question in every package (§4), so
    // an installation without a stored choice starts on the picker and cannot
    // reach the final screen without answering it.
    expect(resolve(null)).toBe('profile');
    expect(resolve('minimum')).toBe('profile');
    expect(resolve(null, ['profile'])).toBe('superAdmin');
    expect(resolve(null, ['profile', 'superAdmin'])).toBe('identity');
    expect(resolve(null, ['profile', 'superAdmin', 'identity'])).toBe('loginProvider');
    expect(
      resolve(null, ['profile', 'superAdmin', 'identity', 'loginProvider']),
    ).toBe('smtp');
    expect(
      resolve(null, ['profile', 'superAdmin', 'identity', 'loginProvider', 'smtp']),
    ).toBe('seed');
    expect(
      resolve(null, [
        'profile',
        'superAdmin',
        'identity',
        'loginProvider',
        'smtp',
        'seed',
      ]),
    ).toBe('team');
    expect(
      resolve(null, [
        'profile',
        'superAdmin',
        'identity',
        'loginProvider',
        'smtp',
        'seed',
        'team',
        'addons',
      ]),
    ).toBe('complete');
  });

  it('requires SMTP from Standard on and only offers it in Minimum', () => {
    const prefix: readonly InstallStepKey[] = [
      'profile',
      'superAdmin',
      'identity',
      'loginProvider',
    ];
    expect(resolve('minimum', prefix)).toBe('smtp');
    expect(resolve('minimum', [...prefix, 'smtp'])).toBe('seed');
    expect(resolve('standard', prefix)).toBe('smtp');
    expect(resolve('standard', prefix, ['smtp'])).toBe('seed');
  });

  it('walks the F2 steps in order and lets Minimum defer the team', () => {
    // F2: identity sits between the founder and the sign-in mode in every
    // package; the team step comes after the seed and may be deferred.
    expect(resolve('minimum', ['profile', 'superAdmin'])).toBe('identity');
    const seeded: readonly InstallStepKey[] = [
      'profile',
      'superAdmin',
      'identity',
      'loginProvider',
      'smtp',
      'seed',
    ];
    expect(resolve('minimum', seeded)).toBe('team');
    expect(resolve('minimum', seeded, ['team'])).toBe('addons');
    expect(resolve('standard', seeded)).toBe('team');
  });

  it('never walks a step the package does not contain', () => {
    // A synthetic package: SMTP only exists in Full. The states mirror what
    // `toInstallStepStates` derives, so the resolver sees the same shape the
    // registry would produce for a package that leaves SMTP out.
    const definitions: readonly InstallStepDefinition[] = [
      {
        key: 'smtp',
        order: 40,
        requiredIn: ['full'],
        offeredIn: ['full'],
        skippable: true,
        resettableSettingKeys: [],
      },
    ];
    const statesFor = (profile: InstallProfile) =>
      ({
        smtp: {
          completed: false,
          skipped: false,
          required: profile === 'full',
          offered: profile === 'full',
          blocking: isInstallStepBlocking({
            definition: definitions[0],
            profile,
            completed: false,
            skipped: false,
          }),
        },
      }) as unknown as InstallStepStates;

    expect(
      resolveInstallNextStep({
        profile: 'minimum',
        states: statesFor('minimum'),
        definitions,
      }),
    ).toBe('complete');
    expect(
      resolveInstallNextStep({
        profile: 'full',
        states: statesFor('full'),
        definitions,
      }),
    ).toBe('smtp');
  });

  it('falls through to the final screen when everything required is answered', () => {
    const all: readonly InstallStepKey[] = [
      'profile',
      'superAdmin',
      'identity',
      'loginProvider',
      'smtp',
      'seed',
      'team',
      'addons',
    ];
    expect(resolve('full', all)).toBe('complete');
    expect(resolve('full', all.slice(0, -1), ['addons'])).toBe('complete');
  });
});

describe('isInstallStepBlocking', () => {
  const definition: InstallStepDefinition = {
    key: 'smtp',
    order: 40,
    requiredIn: ['standard', 'full'],
    offeredIn: ['minimum', 'standard', 'full'],
    skippable: true,
    resettableSettingKeys: [],
  };

  it('blocks while the step is unanswered, but never once it is deferred', () => {
    expect(
      isInstallStepBlocking({ definition, profile: 'standard', completed: false, skipped: false }),
    ).toBe(true);
    expect(
      isInstallStepBlocking({ definition, profile: 'standard', completed: true, skipped: false }),
    ).toBe(false);
    expect(
      isInstallStepBlocking({ definition, profile: 'standard', completed: false, skipped: true }),
    ).toBe(false);
  });

  it('does not block for a package that does not offer the step', () => {
    expect(
      isInstallStepBlocking({
        definition: { ...definition, offeredIn: ['full'] },
        profile: 'minimum',
        completed: false,
        skipped: false,
      }),
    ).toBe(false);
  });

  it('blocks on the package step until a package is stored', () => {
    const profileStep: InstallStepDefinition = { ...definition, key: 'profile' };
    // F3: the package step used to be exempt while nothing was stored; the
    // picker exists now, so an unanswered package is in the way like any other.
    expect(
      isInstallStepBlocking({
        definition: profileStep,
        profile: null,
        completed: false,
        skipped: false,
      }),
    ).toBe(true);
    expect(
      isInstallStepBlocking({
        definition: profileStep,
        profile: 'minimum',
        completed: false,
        skipped: false,
      }),
    ).toBe(true);
    expect(
      isInstallStepBlocking({
        definition: profileStep,
        profile: 'minimum',
        completed: true,
        skipped: false,
      }),
    ).toBe(false);
  });
});
