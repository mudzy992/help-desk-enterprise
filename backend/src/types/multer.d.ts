/* eslint-disable @typescript-eslint/no-explicit-any */
declare module 'multer' {
  type FileNameCallback = (error: Error | null, filename: string) => void;
  export function diskStorage(options: {
    destination: string;
    filename: (request: unknown, file: unknown, callback: FileNameCallback) => void;
  }): any;
}
