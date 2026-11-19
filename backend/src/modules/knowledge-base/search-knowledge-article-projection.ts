import type {
  DataClassification,
  KnowledgeArticleStatus,
} from '../../generated/prisma/enums';
import type {
  KnowledgeArticleVisibilityRecord,
} from './knowledge-base.types';

/**
 * W7.58 (BA-search-04): the projection of the `/search` article read.
 *
 * The title search needs three things from a row: the three output columns
 * (`id`, `slug`, `title`), the columns the authorization predicate reads
 * (`status`, `classification`, `organizationalUnitId`, `serviceId`,
 * `ownerUserId`, `ownerGroupId`, `reviewerUserId`) and the keyset position
 * (`updatedAt`). Nothing else is read — in particular **not `body`**.
 *
 * Before this package the query had no `select`, so every candidate row arrived
 * with its full text even when the visibility check then refused it: the hidden
 * content was materialized in the process, in the Prisma client buffers and in
 * any debug/log dump, without ever being authorized. A projection removes the
 * content from the read itself, which is stronger than filtering it later.
 *
 * The projection is also the contract: `knowledgeArticleTitleSearchSelect` is
 * what the query sends, and `KnowledgeArticleTitleSearchRow` is what comes back,
 * so a future column cannot be added to the read by accident.
 */
export const knowledgeArticleTitleSearchSelect = {
  id: true,
  slug: true,
  title: true,
  status: true,
  classification: true,
  organizationalUnitId: true,
  serviceId: true,
  ownerUserId: true,
  ownerGroupId: true,
  reviewerUserId: true,
  updatedAt: true,
} as const;

export type KnowledgeArticleTitleSearchRow = {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly status: KnowledgeArticleStatus;
  readonly classification: DataClassification;
  readonly organizationalUnitId: string;
  readonly serviceId: string;
  readonly ownerUserId: string | null;
  readonly ownerGroupId: string | null;
  readonly reviewerUserId: string | null;
  readonly updatedAt: Date;
};

/** The row is a full visibility record: the predicate reads nothing else. */
export type KnowledgeArticleTitleSearchCandidate =
  KnowledgeArticleTitleSearchRow & KnowledgeArticleVisibilityRecord;
