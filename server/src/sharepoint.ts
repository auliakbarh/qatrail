import { env } from "./env.js";

// SharePoint attachment upload — PREPARED, NOT IMPLEMENTED.
//
// Attachments are URL-based today (paste a link). To store files in SharePoint
// via Microsoft Graph later:
//   1. App-only Graph token (client credentials) for the site/drive.
//   2. PUT /sites/{siteId}/drive/items/root:/{path}:/content  -> returns webUrl.
//   3. Save that webUrl as the attachment `url` (schema already fits).
// The `kind` + `order` fields on attachments are ready for previews.

export function sharepointEnabled(): boolean {
  return env.sharepoint.enabled;
}

export async function uploadToSharePoint(_file: unknown): Promise<string> {
  throw new Error("SharePoint upload is not yet implemented. Paste a file URL for now.");
}
