# Paket 1.8 — testni Active Directory (Samba AD DC) za LDAPS sinhronizaciju.
# Samo za testno okruženje; nikad ne povezivati s produkcijskim domenom.
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
# --no-install-recommends preskače AD šemu (samba-ad-provision) i AD DC dio
# (samba-ad-dc), pa se oba navode eksplicitno; `test -f` ruši build ako šema fali.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      samba samba-ad-dc samba-ad-provision winbind krb5-user ldb-tools ldap-utils openssl ca-certificates tini \
 && test -f /usr/share/samba/setup/ad-schema/AD_DS_Attributes__Windows_Server_2012_R2.ldf \
 && rm -rf /var/lib/apt/lists/* \
 && rm -f /etc/samba/smb.conf

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
COPY seed.sh /usr/local/bin/seed.sh
COPY scenario.sh /usr/local/bin/scenario.sh
RUN chmod +x /usr/local/bin/*.sh

VOLUME ["/var/lib/samba", "/etc/samba", "/export"]
EXPOSE 636
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
