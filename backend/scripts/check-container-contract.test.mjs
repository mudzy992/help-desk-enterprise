import assert from "node:assert/strict";
import { test } from "node:test";
import { validateContainerContract } from "./check-container-contract.mjs";

const image = "node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392";
const dockerfile = `
FROM ${image} AS production-deps
COPY package*.json ./
RUN npm ci --omit=dev --omit=optional --ignore-scripts
FROM ${image} AS builder
RUN npm ci --include=dev
FROM ${image} AS runtime
WORKDIR /usr/app
COPY --chown=node:node --from=production-deps /usr/app/node_modules ./node_modules
COPY --chown=node:node --from=builder /usr/app/dist ./dist
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
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

test("prihvata digest-pinned production-only runtime i oba process servisa", () => {
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
  const unsafe = dockerfile.replace("RUN npm ci --include=dev", "RUN npm ci --include=dev\nUSER node").replace("USER node\nCMD", "CMD");
  assert.ok(validateContainerContract(unsafe, compose).some((problem) => problem.includes("USER node")));
});

test("odbija mutable base, install fallback i builder dependencies u runtimeu", () => {
  const unsafe = dockerfile
    .replace(image, "node:22-alpine")
    .replace("RUN npm ci --include=dev", "RUN npm ci --include=dev || npm install")
    .replace("--from=production-deps /usr/app/node_modules", "--from=builder /usr/app/node_modules");
  const problems = validateContainerContract(unsafe, compose);
  assert.ok(problems.some((problem) => problem.includes("digest-pinned")));
  assert.ok(problems.some((problem) => problem.includes("fallback")));
  assert.ok(problems.some((problem) => problem.includes("builder node_modules")));
});
