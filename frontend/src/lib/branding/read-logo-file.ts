/** Paket 4.1 (§3a): client-side pre-check; the backend validates magic bytes again. */
export const logoLimits = { maxBytes: 200 * 1024, maxDimension: 1024, types: ["image/png", "image/jpeg", "image/webp"] } as const;

export type LogoReadError = "logoBadType" | "logoTooLarge" | "logoTooWide" | "logoUnreadable";

export type LogoReadResult = { readonly ok: true; readonly dataUrl: string } | { readonly ok: false; readonly error: LogoReadError };

export async function readLogoFile(file: File): Promise<LogoReadResult> {
  if (!(logoLimits.types as readonly string[]).includes(file.type)) return { ok: false, error: "logoBadType" };
  if (file.size > logoLimits.maxBytes) return { ok: false, error: "logoTooLarge" };
  let dataUrl: string;
  try {
    dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("read")));
      reader.onerror = () => reject(reader.error ?? new Error("read"));
      reader.readAsDataURL(file);
    });
  } catch {
    return { ok: false, error: "logoUnreadable" };
  }
  const size = await new Promise<{ width: number; height: number } | null>((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve(null);
    image.src = dataUrl;
  });
  if (size === null || size.width < 1 || size.height < 1) return { ok: false, error: "logoUnreadable" };
  if (size.width > logoLimits.maxDimension || size.height > logoLimits.maxDimension) return { ok: false, error: "logoTooWide" };
  return { ok: true, dataUrl };
}
