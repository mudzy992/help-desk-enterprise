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
  // Paket 2.9 (K1): 1-5 ratings in the window and lifetime views.
  'ratingCount',
  'averageRating',
  'viewCount',
] as const;

export function buildKbHelpfulnessReport(
  input: ReportPackBuildInput,
): readonly ReportExportRow[] {
  const tallies = new Map<
    string,
    { helpfulCount: number; notHelpfulCount: number; ratingCount: number; ratingSum: number }
  >();
  for (const vote of input.feedback) {
    if (!isTimestampInWindow(vote.createdAt, input.window)) {
      continue;
    }
    const current = tallies.get(vote.articleId) ?? {
      helpfulCount: 0,
      notHelpfulCount: 0,
      ratingCount: 0,
      ratingSum: 0,
    };
    const rated = typeof vote.rating === 'number';
    tallies.set(vote.articleId, {
      helpfulCount: current.helpfulCount + (vote.isHelpful ? 1 : 0),
      notHelpfulCount: current.notHelpfulCount + (vote.isHelpful ? 0 : 1),
      ratingCount: current.ratingCount + (rated ? 1 : 0),
      ratingSum: current.ratingSum + (rated ? (vote.rating as number) : 0),
    });
  }
  return input.articles
    .map((article) => {
      const tally = tallies.get(article.id) ?? {
        helpfulCount: 0,
        notHelpfulCount: 0,
        ratingCount: 0,
        ratingSum: 0,
      };
      return {
        articleId: article.id,
        title: article.title,
        serviceId: article.serviceId,
        organizationalUnitId: article.organizationalUnitId,
        helpfulCount: tally.helpfulCount,
        notHelpfulCount: tally.notHelpfulCount,
        netScore: tally.helpfulCount - tally.notHelpfulCount,
        ratingCount: tally.ratingCount,
        averageRating:
          tally.ratingCount > 0
            ? Math.round((tally.ratingSum / tally.ratingCount) * 10) / 10
            : null,
        viewCount: article.viewCount,
      };
    })
    .sort((left, right) => {
      const byNet = Number(right.netScore) - Number(left.netScore);
      return byNet !== 0
        ? byNet
        : String(left.articleId).localeCompare(String(right.articleId));
    });
}
