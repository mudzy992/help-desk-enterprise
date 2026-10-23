import assert from "node:assert/strict";
import { test } from "node:test";
import { validateContainerContract } from "./check-container-contract.mjs";

const dockerfile = `
FROM node:22 AS builder
RUN echo build
FROM node:22-alpine
WORKDIR /usr/app
COPY --chown=node:node --from=builder /usr/app/dist ./dist
RUN mkdir -p /usr/app/uploads && chown node:node /usr/app/uploads
ENV UPLOAD_ROOT=/usr/app/uploads
STOPSIGNAL SIGTERM
USER node
CMD ["node", "dist/src/main.js"]
`;

const service = (name) => `  ${name}:
    build: ./backend
    read_only: true
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    tmpfs:
      - /tmp:rw,noexec,nosuid,size=64m,mode=1777
    volumes:
      - uploads:/usr/app/uploads
`;
const compose = `services:\n${service("backend")}${service("worker")}  clamav:\n    image: clamav\n`;

test("prihvata zaključani runtime i oba process servisa", () => {
  assert.deepEqual(validateContainerContract(dockerfile, compose), []);
});

test("odbija root runtime i nedostajuće hardening granice", () => {
  const problems = validateContainerContract(
    dockerfile.replace("USER node", "USER root").replace("STOPSIGNAL SIGTERM\n", ""),
    compose.replaceAll("    read_only: true\n", ""),
  );
  assert.ok(problems.includes("Dockerfile runtime: nedostaje `USER node`"));
  assert.ok(problems.includes("Dockerfile runtime: nedostaje `STOPSIGNAL SIGTERM`"));
  assert.ok(problems.includes("compose backend: nedostaje read_only"));
  assert.ok(problems.includes("compose worker: nedostaje read_only"));
});

test("builder USER ne može zadovoljiti final-stage pravilo", () => {
  const unsafe = dockerfile.replace("FROM node:22 AS builder", "FROM node:22 AS builder\nUSER node").replace("USER node\nCMD", "CMD");
  assert.ok(validateContainerContract(unsafe, compose).some((problem) => problem.includes("USER node")));
});
