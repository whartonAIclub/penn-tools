// The limits on an uploaded outline, shared by the page (which checks the size
// before sending) and the read route (which checks everything again).

/** The largest outline, in bytes. Outlines are rarely over 2 MB. */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
/** The most pages an outline may have, bounding what one read costs the student. The route counts them. */
export const MAX_PDF_PAGES = 40;
export const MAX_FILENAME_LENGTH = 200;
/** The largest request body a valid outline needs: the PDF as base64, plus room for the other fields. */
export const MAX_REQUEST_BYTES = Math.ceil(MAX_PDF_BYTES / 3) * 4 + 16 * 1024;
