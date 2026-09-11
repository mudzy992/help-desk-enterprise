import { knowledgeBaseConstants } from './knowledge-base.constants';
import { KnowledgeBaseError } from './knowledge-base.error';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugifyKnowledgeArticleTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, knowledgeBaseConstants.maximumSlugLength);
  if (slug.length === 0 || !slugPattern.test(slug)) {
    throw new KnowledgeBaseError('INVALID_SLUG');
  }
  return slug;
}

export async function allocateKnowledgeArticleSlug(
  isTaken: (slug: string) => Promise<boolean>,
  title: string,
): Promise<string> {
  const base = slugifyKnowledgeArticleTitle(title);
  if (!(await isTaken(base))) {
    return base;
  }
  for (let suffix = 2; suffix <= 99; suffix += 1) {
    const candidate = `${base.slice(0, knowledgeBaseConstants.maximumSlugLength - 3)}-${suffix}`;
    if (!(await isTaken(candidate))) {
      return candidate;
    }
  }
  throw new KnowledgeBaseError('SLUG_TAKEN');
}
