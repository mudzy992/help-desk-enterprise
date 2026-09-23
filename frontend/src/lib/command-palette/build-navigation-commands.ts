import type {
  NavigationLabelKey,
  NavigationSection,
  NavigationSectionKey,
} from "@/lib/navigation";

/**
 * Command palette — pure model.
 *
 * Kept free of React and of translations so the ranking/filtering rules can be
 * unit tested. The component supplies the visible sections (already filtered by
 * capabilities) and a translate function; this module decides what is a match
 * and in which order results appear.
 */

export interface NavigationCommand {
  readonly id: string;
  readonly labelKey: NavigationLabelKey;
  readonly sectionLabelKey: NavigationSectionKey;
  readonly path: string;
}

/**
 * Flattens the navigation tree into palette commands, preserving sidebar order
 * so the palette never contradicts the sidebar.
 */
export function buildNavigationCommands(
  sections: readonly NavigationSection[],
): readonly NavigationCommand[] {
  return sections.flatMap((section) =>
    section.items.map((item) => ({
      id: `nav:${item.path}`,
      labelKey: item.labelKey,
      sectionLabelKey: section.labelKey,
      path: item.path,
    })),
  );
}

/**
 * Rank order: exact label → label starts with query → label contains query →
 * only the section name matches. Ties keep sidebar order (stable sort).
 */
function matchRank(label: string, sectionLabel: string, query: string): number | null {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) {
    return 0;
  }
  const normalizedLabel = label.toLowerCase();
  const normalizedSection = sectionLabel.toLowerCase();
  if (normalizedLabel === needle) {
    return 0;
  }
  if (normalizedLabel.startsWith(needle)) {
    return 1;
  }
  if (normalizedLabel.includes(needle)) {
    return 2;
  }
  if (normalizedSection.includes(needle)) {
    return 3;
  }
  return null;
}

export function filterNavigationCommands(
  commands: readonly NavigationCommand[],
  query: string,
  translate: (key: NavigationLabelKey) => string,
  translateSection: (key: NavigationSectionKey) => string,
): readonly NavigationCommand[] {
  return commands
    .map((command, index) => {
      const rank = matchRank(
        translate(command.labelKey),
        translateSection(command.sectionLabelKey),
        query,
      );
      return { command, index, rank };
    })
    .filter(
      (entry): entry is { command: NavigationCommand; index: number; rank: number } =>
        entry.rank !== null,
    )
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map((entry) => entry.command);
}
