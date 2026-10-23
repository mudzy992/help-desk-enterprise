import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectControllerSource, inspectModuleSource } from "./check-backend-wiring.mjs";

test("inventariše HTTP metode, putanje i class/method guardove", () => {
  const routes = inspectControllerSource(`
    @Controller('tickets')
    @UseGuards(SessionGuard, RoleGuard)
    export class TicketsController {
      @Get(':id')
      one() {}

      @Post()
      @UseGuards(StepUpGuard)
      create() {}
    }
  `);
  assert.deepEqual(routes, [
    {
      controller: "TicketsController",
      handler: "one",
      method: "GET",
      path: "/tickets/:id",
      classGuards: ["SessionGuard", "RoleGuard"],
      methodGuards: [],
      guardBoundary: "explicit",
    },
    {
      controller: "TicketsController",
      handler: "create",
      method: "POST",
      path: "/tickets",
      classGuards: ["SessionGuard", "RoleGuard"],
      methodGuards: ["StepUpGuard"],
      guardBoundary: "explicit",
    },
  ]);
});

test("ne proglašava rutu javnom samo zato što nema lokalni guard", () => {
  const [route] = inspectControllerSource(`
    @Controller('privacy/notice')
    class NoticeController { @Get() show() {} }
  `);
  assert.equal(route.guardBoundary, "inherited-or-public");
  assert.deepEqual(route.classGuards, []);
  assert.deepEqual(route.methodGuards, []);
});

test("čuva dinamičku putanju kao review marker umjesto izmišljene vrijednosti", () => {
  const [route] = inspectControllerSource(`
    @Controller(prefix)
    class DynamicController { @Get(routeName) show() {} }
  `);
  assert.equal(route.path, "/{prefix}/{routeName}");
});

test("snapshotuje root module wiring nizove", () => {
  assert.deepEqual(
    inspectModuleSource(`
      @Module({
        imports: [ConfigModule, QueueModule.forRoot({})],
        controllers: [HealthController],
        providers: [WorkerRunner, { provide: APP_FILTER, useClass: Filter }],
        exports: [WorkerRunner],
      })
      export class WorkerModule {}
    `),
    {
      module: "WorkerModule",
      imports: ["ConfigModule", "QueueModule.forRoot({})"],
      controllers: ["HealthController"],
      providers: ["WorkerRunner", "{ provide: APP_FILTER, useClass: Filter }"],
      exports: ["WorkerRunner"],
    },
  );
});
