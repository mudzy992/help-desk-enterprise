import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AnnouncementError, announcementErrorCodes } from './announcements.constants';

export function mapAnnouncementError(error: unknown): unknown {
  if (!(error instanceof AnnouncementError)) return error;
  const body = { code: error.code, message: error.detail ?? error.code };
  switch (error.code) {
    case announcementErrorCodes.disabled:
      return new ServiceUnavailableException(body);
    case announcementErrorCodes.notFound:
      return new NotFoundException(body);
    case announcementErrorCodes.invalidState:
    case announcementErrorCodes.notActive:
    case announcementErrorCodes.reminderTooSoon:
      return new ConflictException(body);
    case announcementErrorCodes.forbidden:
      return new ForbiddenException(body);
    default:
      return new BadRequestException(body);
  }
}

export async function runAnnouncement<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const mapped = mapAnnouncementError(error);
    if (mapped instanceof HttpException) throw mapped;
    throw error;
  }
}
