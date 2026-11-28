import { openmrsFetch, restBaseUrl } from '@openmrs/esm-framework';
import type { ImportResult } from '../../core/api/types/stockItem/ImportResult';

/**
 * Uploads a CSV file as multipart FormData for bulk stock item import.
 */
export async function uploadStockItems(body: FormData) {
  const abortController = new AbortController();

  return openmrsFetch<ImportResult>(`${restBaseUrl}/stockmanagement/stockitemimport`, {
    method: 'POST',
    signal: abortController.signal,
    body,
  });
}

/**
 * Downloads the text error log produced for a bulk stock item import session.
 */
export async function downloadStockItemImportErrors(uploadSessionId: string): Promise<Blob> {
  const response = await openmrsFetch(
    `${restBaseUrl}/stockmanagement/stockitemimport?id=${encodeURIComponent(uploadSessionId)}`,
    {
      headers: {
        // Clear the default JSON Accept header so the octet-stream response does not fail with 406.
        Accept: null as unknown as string,
      },
    },
  );

  const contentType = response.headers?.get('content-type')?.toLowerCase() ?? '';
  if (contentType && !contentType.includes('application/octet-stream')) {
    const message = (await response.text()).trim();
    throw new Error(message || 'Unable to download import error log');
  }

  return response.blob();
}
