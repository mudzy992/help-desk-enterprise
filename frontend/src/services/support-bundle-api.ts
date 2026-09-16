import { apiDownloadRequest } from "@/services/api";

export async function downloadSupportBundle(): Promise<{
  readonly blob: Blob;
  readonly fileName: string;
}> {
  const downloaded = await apiDownloadRequest("/support-bundle");
  return {
    blob: downloaded.blob,
    fileName: downloaded.fileName ?? "support-bundle.zip",
  };
}
