import { isTimestampInWindow } from '../resolve-report-window';
import type { ReportExportRow, ReportPackBuildInput } from '../reports.types';

export const kbHelpfulnessColumns = [
  'articleId',
  'title',
  'serviceId',
  'organizationalUnitId',
  'helpfulCount',
  'notHelpfulCount',
  'netScore',
] as const;

export function buildKbHelpfulnessReport(
  input: ReportPackBuildInput,
): readonly ReportExportRow[] {
  const tallies = new Map<
    string,
    { helpfulCount: number; notHelpfulCount: number }
  >();
  for (const vote of input.feedback) {
    if (!isTimestampInWindow(vote.createdAt, input.window)) {
      continue;
    }
    const current = tallies.get(vote.articleId) ?? {
      helpfulCount: 0,
      notHelpfulCount: 0,
    };
    tallies.set(vote.articleId, {
      helpfulCount: current.helpfulCount + (vote.isHelpful ? 1 : 0),
      notHelpfulCount: current.notHelpfulCount + (vote.isHelpful ? 0 : 1),
    });
  }
  return input.articles
    .map((article) => {
      const tally = tallies.get(article.id) ?? {
        helpfulCount: 0,
        notHelpfulCount: 0,
      };
      return {
        articleId: article.id,
        title: article.title,
        serviceId: article.serviceId,
        organizationalUnitId: article.organizationalUnitId,
        helpfulCount: tally.helpfulCount,
        notHelpfulCount: tally.notHelpfulCount,
        netScore: tally.helpfulCount - tally.notHelpfulCount,
      };
    })
    .sort((left, right) => {
      const byNet = Number(right.netScore) - Number(left.netScore);
      return byNet !== 0
        ? byNet
        : String(left.articleId).localeCompare(String(right.articleId));
    });
}
