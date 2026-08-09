export interface MediaFile {
  id: string;
  name: string;
  mimeType: string;
  url: string;
  width?: number;
  height?: number;
  readStatus?: "native" | "ready" | "unsupported" | "failed";
  readError?: string;
}
