export const localPasswordConstants = {
  minimumLength: 12,
  maximumLength: 128,
} as const;

export function isValidLocalPassword(
  password: string,
  email: string,
): boolean {
  if (
    password.length < localPasswordConstants.minimumLength ||
    password.length > localPasswordConstants.maximumLength
  ) {
    return false;
  }
  if (!/\S/.test(password)) {
    return false;
  }
  return password.toLowerCase() !== email.trim().toLowerCase();
}
