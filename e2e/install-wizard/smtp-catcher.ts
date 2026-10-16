/** Loopback / classic catcher ports speak plain SMTP; Gmail 587/465 needs TLS. */
export function isPlainSmtpCatcher(host: string, port: string): boolean {
  const normalized = host.trim().toLowerCase();
  if (normalized === '127.0.0.1' || normalized === 'localhost') return true;
  return [25, 1025, 2525, 3025].includes(Number(port));
}
