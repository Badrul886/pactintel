export interface OcrResult {
  text: string;
  confidence?: number;
  isScannedPdf: boolean;
  pageCount?: number;
}

export interface OcrPort {
  extractText(fileBuffer: Buffer, mimeType: string): Promise<OcrResult>;
  healthCheck(): Promise<boolean>;
}

export const OCR_PORT = Symbol('OCR_PORT');
