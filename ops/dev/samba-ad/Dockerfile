# Paket 1.8 — testni Active Directory (Samba AD DC) za LDAPS sinhronizaciju.
# Samo za testno okruženje; nikad ne povezivati s produkcijskim domenom.
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      samba winbind krb5-user ldb-tools ldap-utils openssl ca-certificates tini \
 && rm -rf /var/lib/apt/lists/* \
 && rm -f /etc/samba/smb.conf

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
COPY seed.sh /usr/local/bin/seed.sh
COPY scenario.sh /usr/local/bin/scenario.sh
RUN chmod +x /usr/local/bin/*.sh

VOLUME ["/var/lib/samba", "/etc/samba", "/export"]
EXPOSE 636
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
