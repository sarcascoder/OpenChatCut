export const CHAT_DOCUMENT_MAX_BYTES = 10 * 1_024 * 1_024;
export const CHAT_DOCUMENT_MAX_TEXT_CHARS = 100_000;
export const CHAT_PDF_MAX_PAGES = 100;

export function assertChatDocumentSize(byteLength: number): void {
  if (byteLength > CHAT_DOCUMENT_MAX_BYTES) throw new Error('Documents must be 10 MB or smaller');
}

export function assertChatDocumentPageCount(pageCount: number): void {
  if (pageCount > CHAT_PDF_MAX_PAGES) throw new Error('PDF documents must contain at most 100 pages');
}

export function assertChatDocumentTextLength(characterCount: number): void {
  if (characterCount > CHAT_DOCUMENT_MAX_TEXT_CHARS) {
    throw new Error('Document text must contain at most 100,000 characters');
  }
}

export function validatedChatDocumentText(text: string): string {
  const trimmed = text.trim();
  assertChatDocumentTextLength(trimmed.length);
  return trimmed;
}
