export function selectLeastBusyAgent(input: {
  readonly eligibleUserIds: readonly string[];
  readonly busyCountByUserId: Readonly<Record<string, number>>;
}): string | null {
  const sorted = [...input.eligibleUserIds].sort();
  if (sorted.length === 0) {
    return null;
  }
  return sorted.reduce((bestUserId, userId) => {
    const busyCount = input.busyCountByUserId[userId] ?? 0;
    const bestBusyCount = input.busyCountByUserId[bestUserId] ?? 0;
    return busyCount < bestBusyCount ? userId : bestUserId;
  });
}

export function selectRoundRobinAgent(input: {
  readonly eligibleUserIds: readonly string[];
  readonly lastAssignedUserId: string | null;
}): string | null {
  const sorted = [...input.eligibleUserIds].sort();
  if (sorted.length === 0) {
    return null;
  }
  if (input.lastAssignedUserId === null) {
    return sorted[0] ?? null;
  }
  const lastAssignedUserId = input.lastAssignedUserId;
  const nextUserId = sorted.find((userId) => userId > lastAssignedUserId);
  return nextUserId ?? sorted[0] ?? null;
}
