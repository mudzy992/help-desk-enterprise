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
if [ "$metadata" != "node|SIGTERM" ]; then
  echo "unexpected image metadata: $metadata (expected node|SIGTERM)" >&2
  exit 1
fi

docker run --rm \
  --read-only \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m,mode=1777 \
  --mount "type=volume,source=$volume,target=/usr/app/uploads" \
  "$image" sh -eu -c '
    test "$(id -u)" -ne 0
    test "$(id -g)" -ne 0
    touch /tmp/safety-net
    touch "$UPLOAD_ROOT/safety-net"
    test -f "$UPLOAD_ROOT/safety-net"
    if touch /usr/app/root-filesystem-must-stay-read-only 2>/dev/null; then
      echo "root filesystem unexpectedly writable" >&2
      exit 1
    fi
  '

container="$(docker run -d --name "backend-signal-$$" "$image" node -e "process.on('SIGTERM',()=>process.exit(0)); console.log('signal-ready'); setInterval(()=>undefined,1000)")"
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

echo "✓ container runtime: non-root UID/GID, read-only root, writable tmpfs/uploads, graceful SIGTERM"
