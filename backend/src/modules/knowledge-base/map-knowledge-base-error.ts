import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { ChangeLogError } from '../change-log/change-log.error';
import { changeLogErrorCodes } from '../change-log/change-log.constants';
import {
  KnowledgeBaseError,
  type KnowledgeBaseErrorCode,
} from './knowledge-base.error';

const notFoundCodes: readonly KnowledgeBaseErrorCode[] = [
  'NOT_FOUND',
  'SERVICE_NOT_FOUND',
  'ORGANIZATIONAL_UNIT_NOT_FOUND',
  'OWNER_USER_NOT_FOUND',
  'OWNER_GROUP_NOT_FOUND',
  'REVIEWER_NOT_FOUND',
];

const forbiddenCodes: readonly KnowledgeBaseErrorCode[] = [
  'FORBIDDEN',
  'FEEDBACK_DISABLED',
  'ARTICLE_ARCHIVED',
];

const messages: Record<KnowledgeBaseErrorCode, string> = {
  NOT_FOUND: 'Knowledge article was not found',
  FORBIDDEN: 'Authorization failed',
  INVALID_TITLE: 'Title is invalid',
  INVALID_BODY: 'Body is invalid',
  INVALID_SLUG: 'Slug is invalid',
  SERVICE_NOT_FOUND: 'Service was not found',
  SERVICE_REQUIRED: 'Service is required',
  ORGANIZATIONAL_UNIT_NOT_FOUND: 'Organizational unit was not found',
  ORGANIZATIONAL_UNIT_REQUIRED: 'Organizational unit is required',
  OWNERSHIP_REQUIRED: 'Exactly one owner user or owner group is required',
  OWNER_USER_NOT_FOUND: 'Owner user was not found',
  OWNER_GROUP_NOT_FOUND: 'Owner group was not found',
  REVIEWER_REQUIRED: 'Reviewer is required before review',
  REVIEWER_NOT_FOUND: 'Reviewer was not found',
  INVALID_STATUS_TRANSITION: 'Knowledge article status transition is not allowed',
  PUBLISH_REVIEW_REQUIRED: 'Article must be reviewed before publish',
  ARTICLE_ARCHIVED: 'Archived knowledge articles cannot be changed',
  FEEDBACK_DISABLED: 'Knowledge article feedback is disabled',
  INTERCEPT_SERVICE_REQUIRED: 'Service is required for knowledge intercept',
  REASON_REQUIRED: 'A change reason is required',
  SLUG_TAKEN: 'Knowledge article slug is already used',
};

export function mapKnowledgeBaseError(error: unknown): HttpException {
  if (
    error instanceof ChangeLogError &&
    error.code === changeLogErrorCodes.reasonRequired
  ) {
    return new BadRequestException({
      code: 'REASON_REQUIRED',
      message: messages.REASON_REQUIRED,
    });
  }
  if (!(error instanceof KnowledgeBaseError)) {
    throw error;
  }
  const body = { code: error.code, message: messages[error.code] };
  if (notFoundCodes.includes(error.code)) {
    return new NotFoundException(body);
  }
  if (forbiddenCodes.includes(error.code)) {
    return new ForbiddenException(body);
  }
  return new BadRequestException(body);
}
