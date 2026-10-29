#!/bin/sh
set -eu

api_url="${VITE_API_BASE_URL:-}"
connect_sources=""

if [ -n "$api_url" ]; then
  case "$api_url" in
    https://*) websocket_scheme="wss" ;;
    http://*) websocket_scheme="ws" ;;
    *)
      echo "VITE_API_BASE_URL must start with http:// or https://" >&2
      exit 1
      ;;
  esac

  api_origin="$(printf '%s' "$api_url" | sed -E 's#^(https?://[^/]+).*$#\1#')"
  case "$api_origin" in
    *" "*|*";"*|*\"*|*\'*)
      echo "VITE_API_BASE_URL contains characters that are unsafe in CSP" >&2
      exit 1
      ;;
  esac
  websocket_origin="$(printf '%s' "$api_origin" | sed -E "s#^https?://#${websocket_scheme}://#")"
  connect_sources="$api_origin $websocket_origin"
fi

template_path="${SECURITY_HEADERS_TEMPLATE_PATH:-/etc/nginx/security-headers.inc.template}"
output_path="${SECURITY_HEADERS_OUTPUT_PATH:-/etc/nginx/conf.d/security-headers.inc}"
sed "s#\${CSP_API_CONNECT_SOURCES}#$connect_sources#g" "$template_path" > "$output_path"
