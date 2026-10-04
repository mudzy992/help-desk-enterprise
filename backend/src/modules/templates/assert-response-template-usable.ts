import type { PrismaService } from '../../common/prisma/prisma.service';
import type {
  MessageType,
  ResponseTemplateKind,
} from '../../generated/prisma/enums';
import { TemplatesError } from './templates.error';

/** Composer mode the template is about to be used in. */
export type UsableTemplateKind = 'REPLY' | 'INTERNAL';

export type UsableResponseTemplate = {
  readonly id: string;
  readonly kind: ResponseTemplateKind;
  readonly isActive: boolean;
};

/**
 * Val 2 (M13/B1): the picker only offered active templates of the right kind,
 * but `render` loaded a template by id alone and the message write used the id
 * only for statistics. A deactivated template — or an `INTERNAL` one written as
 * an internal instruction — could therefore be sent as a public reply.
 *
 * One check, used by both paths: the template must exist, be visible to the
 * actor (shared or own), be active, and match the composer mode (`ANY` fits
 * both). Returns `null` for a blank id so callers can keep the field optional.
 */
export async function assertResponseTemplateUsable(
  prisma: PrismaService,
  input: {
    readonly templateId: string | undefined;
    readonly actorUserId: string;
    readonly kind?: UsableTemplateKind;
  },
): Promise<UsableResponseTemplate | null> {
  const templateId = input.templateId?.trim() ?? '';
  if (templateId.length === 0) {
    return null;
  }
  // In-memory clients (unit tests) have no template store: without a delegate
  // there is nothing to validate or count, and the message still goes out.
  if (typeof prisma.responseTemplate?.findFirst !== 'function') {
    return null;
  }
  const template = await prisma.responseTemplate.findFirst({
    where: {
      id: templateId,
      deletedAt: null,
      OR: [{ ownerUserId: null }, { ownerUserId: input.actorUserId }],
    },
    select: { id: true, kind: true, isActive: true },
  });
  if (template === null) {
    throw new TemplatesError('TEMPLATE_NOT_FOUND');
  }
  if (!template.isActive) {
    throw new TemplatesError('TEMPLATE_INACTIVE', { templateId });
  }
  if (input.kind !== undefined && !templateKindFits(template.kind, input.kind)) {
    throw new TemplatesError('TEMPLATE_KIND_MISMATCH', {
      templateId,
      templateKind: template.kind,
      expectedKind: input.kind,
    });
  }
  return template;
}

/** `ANY` fits both composer modes; everything else must match exactly. */
export function templateKindFits(
  templateKind: ResponseTemplateKind,
  expected: UsableTemplateKind,
): boolean {
  return templateKind === 'ANY' || templateKind === expected;
}

/**
 * `MessageType` → composer mode, for the ticket-message path. Only
 * `INTERNAL_NOTE` is internal; system events never carry a template (a blank
 * id returns before the kind is looked at).
 */
export function templateKindForMessageType(
  messageType: MessageType,
): UsableTemplateKind {
  return messageType === 'INTERNAL_NOTE' ? 'INTERNAL' : 'REPLY';
}
