# Keep this policy on every response location. Nginx stops inheriting server-level
# add_header values as soon as a location defines its own Cache-Control header.
add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://challenges.cloudflare.com https://login.microsoftonline.com; frame-src https://challenges.cloudflare.com https://login.microsoftonline.com; worker-src 'self' blob:; manifest-src 'self'; upgrade-insecure-requests" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
