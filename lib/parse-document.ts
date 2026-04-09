/**
 * Document text extraction for PDF and TXT files.
 * Used by the /api/upload endpoint to extract readable text
 * that can be sent to the AI card extraction pipeline.
 */

export class ParseError extends Error {
  constructor(
    public code: 'unsupported_format' | 'parse_failed' | 'empty_content',
    message: string
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

const SUPPORTED_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/epub+zip',
];

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

export function isSupportedFile(mimeType: string, filename: string): boolean {
  if (SUPPORTED_TYPES.includes(mimeType)) return true;
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext === 'pdf' || ext === 'txt' || ext === 'md' || ext === 'epub';
}

/** Extract text from a PDF buffer */
async function parsePdf(buffer: Buffer): Promise<string> {
  // Dynamic import to avoid bundling issues
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse');
  const data = await pdfParse(buffer);
  return (data.text ?? '').trim();
}

/** Extract text from plain text / markdown buffer */
function parsePlainText(buffer: Buffer): string {
  return buffer.toString('utf-8').trim();
}

/**
 * Main entry point: extract readable text from an uploaded file.
 * Returns the full text content suitable for AI extraction.
 */
export async function parseDocument(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<string> {
  if (buffer.length > MAX_FILE_SIZE) {
    throw new ParseError(
      'parse_failed',
      `File too large (${Math.round(buffer.length / 1024 / 1024)}MB). Maximum is 25MB.`
    );
  }

  const ext = filename.split('.').pop()?.toLowerCase();

  let text = '';

  if (mimeType === 'application/pdf' || ext === 'pdf') {
    text = await parsePdf(buffer);
  } else if (
    mimeType === 'text/plain' ||
    mimeType === 'text/markdown' ||
    ext === 'txt' ||
    ext === 'md'
  ) {
    text = parsePlainText(buffer);
  } else {
    throw new ParseError(
      'unsupported_format',
      `Unsupported file type: ${mimeType || ext}. We support PDF and TXT files.`
    );
  }

  if (!text || text.length < 50) {
    throw new ParseError(
      'empty_content',
      "Couldn't extract enough text from this file. It may be image-based or protected."
    );
  }

  return text;
}
