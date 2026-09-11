import { PATH_METADATA } from '@nestjs/common/constants';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { TicketsBulkController } from './bulk/tickets-bulk.controller';
import { TicketsCsatSummaryController } from './csat/tickets-csat-summary.controller';
import { TicketsSavedViewsController } from './saved-views/tickets-saved-views.controller';
import { TicketsController } from './tickets.controller';
import { TicketsModule } from './tickets.module';

type ControllerClass = new (...args: never[]) => unknown;

function moduleControllers(): readonly ControllerClass[] {
  return Reflect.getMetadata('controllers', TicketsModule) as readonly ControllerClass[];
}

function controllerPath(controller: ControllerClass): string {
  return Reflect.getMetadata(PATH_METADATA, controller) as string;
}

describe('TicketsModule controller order', () => {
  // GET /tickets/:ticketId matches any single segment, so a controller whose
  // base path is a literal segment under /tickets is unreachable unless it is
  // registered first.
  it.each([
    ['TicketsSavedViewsController', TicketsSavedViewsController],
    ['TicketsCsatSummaryController', TicketsCsatSummaryController],
    ['TicketsBulkController', TicketsBulkController],
  ])(
    'registers %s before TicketsController',
    (_name, controller: ControllerClass) => {
      const controllers = moduleControllers();
      expect(controllers.indexOf(controller)).toBeGreaterThanOrEqual(0);
      expect(controllers.indexOf(controller)).toBeLessThan(
        controllers.indexOf(TicketsController),
      );
    },
  );

  it('keeps every literal /tickets sub-path ahead of the wildcard controller', () => {
    const controllers = moduleControllers();
    const wildcardIndex = controllers.indexOf(TicketsController);
    for (const [index, controller] of controllers.entries()) {
      const path = controllerPath(controller);
      if (path === 'tickets' || !path.startsWith('tickets/')) {
        continue;
      }
      expect(index).toBeLessThan(wildcardIndex);
    }
  });
});
