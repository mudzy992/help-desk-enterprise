#!/usr/bin/env bash
# Provisions the test domain on first start, then runs Samba in the foreground.
set -euo pipefail

: "${SAMBA_REALM:=TEST.EPBIH.LAB}"
: "${SAMBA_DOMAIN:=TESTEPBIH}"
: "${SAMBA_ADMIN_PASSWORD:?SAMBA_ADMIN_PASSWORD must be set}"
: "${SAMBA_HOSTNAME:=dc1}"

if [ ! -f /var/lib/samba/private/sam.ldb ]; then
  echo "[samba-ad] provisioning ${SAMBA_REALM}"
  # A failed earlier attempt leaves smb.conf / partial databases in the volumes,
  # and `domain provision` refuses to run over them — start clean.
  rm -f /etc/samba/smb.conf
  rm -rf /var/lib/samba/private/* /var/lib/samba/sysvol/* 2>/dev/null || true
  samba-tool domain provision \
    --use-rfc2307 \
    --realm="${SAMBA_REALM}" \
    --domain="${SAMBA_DOMAIN}" \
    --server-role=dc \
    --dns-backend=SAMBA_INTERNAL \
    --host-name="${SAMBA_HOSTNAME}" \
    --adminpass="${SAMBA_ADMIN_PASSWORD}" \
    --option="tls enabled = yes" \
    --option="ldap server require strong auth = yes"
fi

# Samba generates a self-signed CA on first start (private/tls/ca.pem).
# Export it so the help-desk backend can trust it (AD_LDAPS_CA_CERT_PATH).
(
  for _ in $(seq 1 60); do
    if [ -f /var/lib/samba/private/tls/ca.pem ]; then
      cp /var/lib/samba/private/tls/ca.pem /export/samba-ca.pem
      chmod 644 /export/samba-ca.pem
      echo "[samba-ad] CA exported to /export/samba-ca.pem"
      break
    fi
    sleep 2
  done
) &

exec samba --interactive --no-process-group
