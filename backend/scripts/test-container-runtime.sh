#!/bin/sh
set -eu

image="${1:-help-desk-backend:safety-net}"
volume="backend-safety-net-$$"
container=""
cleanup() {
  if [ -n "$container" ]; then docker rm -f "$container" >/dev/null 2>&1 || true; fi
  docker volume rm "$volume" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker volume create "$volume" >/dev/null

metadata="$(docker image inspect "$image" --format '{{.Config.User}}|{{.Config.StopSignal}}')"
case "$metadata" in
  nonroot\|SIGTERM|65532\|SIGTERM|65532:65532\|SIGTERM) ;;
  *)
    echo "unexpected image metadata: $metadata (expected distroless nonroot + SIGTERM)" >&2
    exit 1
    ;;
esac

docker run --rm \
  --read-only \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m,mode=1777 \
  --mount "type=volume,source=$volume,target=/usr/app/uploads" \
  "$image" -e '
    const fs = require("node:fs");
    if (process.getuid() === 0 || process.getgid() === 0) throw new Error("root runtime");
    for (const path of ["node_modules/@nestjs/cli", "node_modules/typescript", "node_modules/prisma", "prisma", "src", "/bin/sh", "/usr/local/bin/npm"]) {
      if (fs.existsSync(path)) throw new Error(`runtime toolchain exists: ${path}`);
    }
    fs.writeFileSync("/tmp/safety-net", "ok");
    fs.writeFileSync(`${process.env.UPLOAD_ROOT}/safety-net`, "ok");
    try {
      fs.writeFileSync("/usr/app/root-filesystem-must-stay-read-only", "bad");
      throw new Error("root filesystem unexpectedly writable");
    } catch (error) {
      if (error.code !== "EROFS") throw error;
    }
  '

container="$(docker run -d --name "backend-signal-$$" "$image" -e "process.on('SIGTERM',()=>process.exit(0)); console.log('signal-ready'); setInterval(()=>undefined,1000)")"
ready=0
for _attempt in 1 2 3 4 5 6 7 8 9 10; do
  if docker logs "$container" 2>&1 | grep -q '^signal-ready$'; then
    ready=1
    break
  fi
  sleep 0.2
done
if [ "$ready" -ne 1 ]; then
  echo "signal probe did not become ready" >&2
  exit 1
fi
docker stop --time 5 "$container" >/dev/null
exit_code="$(docker inspect "$container" --format '{{.State.ExitCode}}')"
container=""
docker rm "backend-signal-$$" >/dev/null
if [ "$exit_code" -ne 0 ]; then
  echo "SIGTERM probe exit=$exit_code (expected graceful 0)" >&2
  exit 1
fi

echo "✓ distroless runtime: non-root, no shell/toolchain, read-only root, writable tmpfs/uploads, graceful SIGTERM"
