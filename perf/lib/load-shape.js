/**
 * Builds a k6 scenario load shape. A configured ramp is followed by the full
 * hold duration; use `rampUp: 'constant'` to keep the legacy constant-VU shape.
 */
export function buildScenarioLoadShape({
  exec,
  vus,
  duration,
  behaviour,
  rampUp,
}) {
  const tags = { behaviour };
  const rampUpDuration = typeof rampUp === 'string' ? rampUp.trim() : '';
  if (rampUpDuration.length === 0 || rampUpDuration === 'constant') {
    return { executor: 'constant-vus', exec, vus, duration, tags };
  }

  return {
    executor: 'ramping-vus',
    exec,
    startVUs: 0,
    stages: [
      { duration: rampUpDuration, target: vus },
      { duration, target: vus },
    ],
    gracefulRampDown: '30s',
    tags,
  };
}
