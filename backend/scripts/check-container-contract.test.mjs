import assert from "node:assert/strict";
import { test } from "node:test";
import { validateContainerContract } from "./check-container-contract.mjs";

const buildImage = "node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392";
const runtimeImage =
  "gcr.io/distroless/nodejs22-debian12@sha256:8a3e96fe3345b5d83ecec2066e7c498139a02a6d1214e4f6c39f9ce359f3f5bc";
const dockerfile = `
FROM ${buildImage} AS production-deps
COPY package*.json ./
RUN npm ci --omit=dev --omit=optional --ignore-scripts
FROM ${buildImage} AS builder
RUN npm ci --include=dev
RUN mkdir -p /usr/app/uploads && chown 65532:65532 /usr/app/uploads
FROM ${runtimeImage} AS runtime
WORKDIR /usr/app
COPY --chown=65532:65532 --from=production-deps /usr/app/node_modules ./node_modules
COPY --chown=65532:65532 --from=builder /usr/app/dist ./dist
COPY --chown=65532:65532 --from=builder /usr/app/uploads ./uploads
ENV UPLOAD_ROOT=/usr/app/uploads
STOPSIGNAL SIGTERM
USER 65532:65532
CMD ["dist/src/main.js"]
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

test("prihvata digest-pinned production-only distroless runtime i oba process servisa", () => {
  assert.deepEqual(validateContainerContract(dockerfile, compose), []);
});

test("odbija root runtime i nedostajuće hardening granice", () => {
  const problems = validateContainerContract(
    dockerfile.replace("USER 65532:65532", "USER root").replace("STOPSIGNAL SIGTERM\n", ""),
    compose.replaceAll("    read_only: true\n", ""),
  );
  assert.ok(problems.includes("Dockerfile runtime: nedostaje `USER 65532:65532`"));
  assert.ok(problems.includes("Dockerfile runtime: nedostaje `STOPSIGNAL SIGTERM`"));
  assert.ok(problems.includes("compose backend: nedostaje read_only"));
  assert.ok(problems.includes("compose worker: nedostaje read_only"));
});

test("builder USER ne može zadovoljiti final-stage pravilo", () => {
  const unsafe = dockerfile.replace("RUN npm ci --include=dev", "RUN npm ci --include=dev\nUSER 65532:65532").replace("USER 65532:65532\nCMD", "CMD");
  assert.ok(validateContainerContract(unsafe, compose).some((problem) => problem.includes("USER 65532:65532")));
});

test("odbija mutable base, install fallback i builder dependencies u runtimeu", () => {
  const unsafe = dockerfile
    .replace(buildImage, "node:22-bookworm-slim")
    .replace("RUN npm ci --include=dev", "RUN npm ci --include=dev || npm install")
    .replace("--from=production-deps /usr/app/node_modules", "--from=builder /usr/app/node_modules");
  const problems = validateContainerContract(unsafe, compose);
  assert.ok(problems.some((problem) => problem.includes("digest-pinned")));
  assert.ok(problems.some((problem) => problem.includes("fallback")));
  assert.ok(problems.some((problem) => problem.includes("builder node_modules")));
});
