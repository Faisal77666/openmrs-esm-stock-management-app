import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type FetchResponse, openmrsFetch, restBaseUrl } from '@openmrs/esm-framework';
import { downloadStockItemImportErrors, uploadStockItems } from './stock-items-bulk-import.resource';

const mockOpenmrsFetch = vi.mocked(openmrsFetch);

describe('stock-items-bulk-import resource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uploads FormData to stockitemimport endpoint', async () => {
    const formData = new FormData();
    formData.append('hasHeader', 'true');
    const mockResponse = { data: { success: true }, ok: true, status: 200 } as FetchResponse;
    mockOpenmrsFetch.mockResolvedValue(mockResponse);

    const response = await uploadStockItems(formData);

    expect(mockOpenmrsFetch).toHaveBeenCalledWith(`${restBaseUrl}/stockmanagement/stockitemimport`, {
      method: 'POST',
      signal: expect.any(AbortSignal),
      body: formData,
    });
    expect(response).toBe(mockResponse);
  });

  it('downloads binary error log blob with Accept header cleared', async () => {
    const errorBlob = new Blob(['Row 1: Drug ID must be numeric'], { type: 'application/octet-stream' });
    mockOpenmrsFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/octet-stream;charset=UTF-8' }),
      blob: vi.fn().mockResolvedValue(errorBlob),
    } as unknown as FetchResponse);

    const result = await downloadStockItemImportErrors('1_session-123');

    expect(mockOpenmrsFetch).toHaveBeenCalledWith(`${restBaseUrl}/stockmanagement/stockitemimport?id=1_session-123`, {
      headers: {
        Accept: null,
      },
    });
    expect(result).toBe(errorBlob);
  });

  it('throws when backend returns non-binary text error with HTTP 200', async () => {
    mockOpenmrsFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/plain;charset=ISO-8859-1' }),
      text: vi.fn().mockResolvedValue('User is not authenticated'),
      blob: vi.fn(),
    } as unknown as FetchResponse);

    await expect(downloadStockItemImportErrors('1_session-123')).rejects.toThrow('User is not authenticated');
  });
});
