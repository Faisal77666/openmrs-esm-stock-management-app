import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { type FetchResponse, showSnackbar } from '@openmrs/esm-framework';
import { downloadStockItemImportErrors, uploadStockItems } from './stock-items-bulk-import.resource';
import type { ImportResult } from '../../core/api/types/stockItem/ImportResult';
import ImportBulkStockItemsModal from './stock-items-bulk-import.modal';

const mockShowSnackbar = vi.mocked(showSnackbar);
const mockUploadStockItems = vi.mocked(uploadStockItems);
const mockDownloadStockItemImportErrors = vi.mocked(downloadStockItemImportErrors);
const mockHandleMutate = vi.fn();
const mockSaveAs = vi.fn();

vi.mock('../../utils', async () => {
  const actual = (await vi.importActual('../../utils')) as Record<string, unknown>;
  return {
    ...actual,
    useHandleMutate: () => mockHandleMutate,
  };
});

vi.mock('file-saver', () => ({
  saveAs: (...args: unknown[]) => mockSaveAs(...args),
}));

vi.mock('./stock-items-bulk-import.resource', () => ({
  uploadStockItems: vi.fn(),
  downloadStockItemImportErrors: vi.fn(),
}));

describe('ImportBulkStockItemsModal', () => {
  const mockCloseModal = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with initial state and UI elements', () => {
    render(<ImportBulkStockItemsModal closeModal={mockCloseModal} />);

    expect(screen.getByText(/import stock items/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /select file/i })).toBeInTheDocument();
    expect(screen.getByText(/only .csv files at 2mb or less/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upload stock items/i })).toBeInTheDocument();
  });

  it('allows only CSV files', async () => {
    render(<ImportBulkStockItemsModal closeModal={mockCloseModal} />);

    const fileInput = screen.getByLabelText(/select file/i) as HTMLInputElement;
    expect(fileInput.accept).toBe('.csv');
  });

  it('closes modal when cancel button is clicked', async () => {
    const user = userEvent.setup();
    render(<ImportBulkStockItemsModal closeModal={mockCloseModal} />);

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);
    expect(mockCloseModal).toHaveBeenCalledTimes(1);
  });

  it('does nothing when upload is clicked without a file', async () => {
    const user = userEvent.setup();
    render(<ImportBulkStockItemsModal closeModal={mockCloseModal} />);

    const uploadButton = screen.getByRole('button', { name: /upload stock items/i });
    await user.click(uploadButton);

    expect(uploadStockItems).not.toHaveBeenCalled();
    expect(mockShowSnackbar).not.toHaveBeenCalled();
    expect(mockCloseModal).not.toHaveBeenCalled();
  });

  it('uploads file successfully and shows success snackbar', async () => {
    const user = userEvent.setup();

    mockUploadStockItems.mockResolvedValue({
      data: {
        createdCount: 5,
        updatedCount: 1,
        notChangedCount: 0,
        uploadSessionId: 'session-1',
        hasErrorFile: false,
        success: true,
        errors: [],
      },
      status: 200,
      ok: true,
    } as FetchResponse<ImportResult>);
    render(<ImportBulkStockItemsModal closeModal={mockCloseModal} />);

    const validFile = new File(['test content'], 'valid.csv', { type: 'text/csv' });
    const fileInput = screen.getByLabelText('Select file') as HTMLInputElement;
    await userEvent.upload(fileInput, validFile);

    const uploadButton = screen.getByRole('button', { name: /upload stock items/i });
    await user.click(uploadButton);

    expect(uploadStockItems).toHaveBeenCalled();
    expect(mockHandleMutate).toHaveBeenCalledWith(expect.stringContaining('/stockmanagement/stockitem'));
    expect(mockShowSnackbar).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'success',
        title: 'Stock items uploaded successfully',
        subtitle: expect.any(String),
      }),
    );
    expect(mockCloseModal).toHaveBeenCalledTimes(1);
  });

  it('shows inline error notification on upload failure without showing background snackbar', async () => {
    const user = userEvent.setup();

    mockUploadStockItems.mockRejectedValue(new Error('Upload failed'));
    render(<ImportBulkStockItemsModal closeModal={mockCloseModal} />);

    const validFile = new File(['test content'], 'valid.csv', { type: 'text/csv' });
    const fileInput = screen.getByLabelText(/select file/i) as HTMLInputElement;
    await userEvent.upload(fileInput, validFile);

    const uploadButton = screen.getByRole('button', { name: /upload stock items/i });
    await user.click(uploadButton);

    expect(uploadStockItems).toHaveBeenCalled();
    expect(mockHandleMutate).not.toHaveBeenCalled();
    expect(mockShowSnackbar).not.toHaveBeenCalled();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('An error occurred uploading stock items');
    expect(alert).toHaveTextContent('Upload failed');
    expect(mockCloseModal).not.toHaveBeenCalled();
  });

  it('keeps modal open and shows actionable error notification when HTTP 200 ImportResult has success false', async () => {
    const user = userEvent.setup();

    mockUploadStockItems.mockResolvedValue({
      data: {
        createdCount: 0,
        updatedCount: 0,
        notChangedCount: 0,
        uploadSessionId: 'session-err-1',
        hasErrorFile: true,
        success: false,
        errors: ['Errors occurred while importing'],
      },
      status: 200,
      ok: true,
    } as FetchResponse<ImportResult>);
    render(<ImportBulkStockItemsModal closeModal={mockCloseModal} />);

    const invalidFile = new File(['bad,csv'], 'invalid.csv', { type: 'text/csv' });
    const fileInput = screen.getByLabelText(/select file/i) as HTMLInputElement;
    await user.upload(fileInput, invalidFile);

    await user.click(screen.getByRole('button', { name: /upload stock items/i }));

    expect(uploadStockItems).toHaveBeenCalledTimes(1);
    expect(mockHandleMutate).not.toHaveBeenCalled();
    expect(mockCloseModal).not.toHaveBeenCalled();
    expect(mockShowSnackbar).not.toHaveBeenCalled();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('An error occurred uploading stock items');
    expect(alert).toHaveTextContent('Errors occurred while importing');
    expect(screen.getByRole('button', { name: /download error log/i })).toBeInTheDocument();
  });

  it('downloads error log file when hasErrorFile is true', async () => {
    const user = userEvent.setup();
    const errorBlob = new Blob(['Row 2: Invalid item'], { type: 'text/plain' });

    mockUploadStockItems.mockResolvedValue({
      data: {
        createdCount: 0,
        updatedCount: 0,
        notChangedCount: 0,
        uploadSessionId: 'session-err-1',
        hasErrorFile: true,
        success: false,
        errors: ['Errors occurred while importing'],
      },
      status: 200,
      ok: true,
    } as FetchResponse<ImportResult>);
    mockDownloadStockItemImportErrors.mockResolvedValue(errorBlob);

    render(<ImportBulkStockItemsModal closeModal={mockCloseModal} />);

    const fileInput = screen.getByLabelText(/select file/i) as HTMLInputElement;
    await user.upload(fileInput, new File(['bad,csv'], 'invalid.csv', { type: 'text/csv' }));
    await user.click(screen.getByRole('button', { name: /upload stock items/i }));

    await user.click(screen.getByRole('button', { name: /download error log/i }));

    expect(mockDownloadStockItemImportErrors).toHaveBeenCalledWith('session-err-1');
    expect(mockSaveAs).toHaveBeenCalledWith(errorBlob, 'stock-item-import-errors.txt');
  });

  it('shows inline error notification when downloading error log fails', async () => {
    const user = userEvent.setup();

    mockUploadStockItems.mockResolvedValue({
      data: {
        createdCount: 0,
        updatedCount: 0,
        notChangedCount: 0,
        uploadSessionId: 'session-err-1',
        hasErrorFile: true,
        success: false,
        errors: ['Errors occurred while importing'],
      },
      status: 200,
      ok: true,
    } as FetchResponse<ImportResult>);
    mockDownloadStockItemImportErrors.mockRejectedValue(new Error('Not found'));

    render(<ImportBulkStockItemsModal closeModal={mockCloseModal} />);

    const fileInput = screen.getByLabelText(/select file/i) as HTMLInputElement;
    await user.upload(fileInput, new File(['bad,csv'], 'invalid.csv', { type: 'text/csv' }));
    await user.click(screen.getByRole('button', { name: /upload stock items/i }));

    await user.click(screen.getByRole('button', { name: /download error log/i }));

    expect(mockDownloadStockItemImportErrors).toHaveBeenCalledWith('session-err-1');
    expect(mockSaveAs).not.toHaveBeenCalled();
    expect(mockShowSnackbar).not.toHaveBeenCalled();
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(2);
    expect(alerts[1]).toHaveTextContent('An error occurred downloading import error log');
    expect(alerts[1]).toHaveTextContent('Not found');
  });

  it('revalidates stock items and warns inline on partial import with errors', async () => {
    const user = userEvent.setup();

    mockUploadStockItems.mockResolvedValue({
      data: {
        createdCount: 2,
        updatedCount: 1,
        notChangedCount: 3,
        uploadSessionId: 'session-partial',
        hasErrorFile: true,
        success: false,
        errors: ['Row 4: Invalid item'],
      },
      status: 200,
      ok: true,
    } as FetchResponse<ImportResult>);

    render(<ImportBulkStockItemsModal closeModal={mockCloseModal} />);

    const fileInput = screen.getByLabelText(/select file/i) as HTMLInputElement;
    await user.upload(fileInput, new File(['partial,csv'], 'partial.csv', { type: 'text/csv' }));
    await user.click(screen.getByRole('button', { name: /upload stock items/i }));

    expect(mockHandleMutate).toHaveBeenCalledWith(expect.stringContaining('/stockmanagement/stockitem'));
    expect(mockCloseModal).not.toHaveBeenCalled();
    expect(mockShowSnackbar).not.toHaveBeenCalled();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Stock items imported with errors');
    expect(alert).toHaveTextContent('Row 4: Invalid item');
    expect(screen.getByRole('button', { name: /download error log/i })).toBeInTheDocument();
  });

  it('clears selected file and errors when uploaded file is removed', async () => {
    const user = userEvent.setup();

    mockUploadStockItems.mockResolvedValue({
      data: {
        createdCount: 0,
        updatedCount: 0,
        notChangedCount: 0,
        uploadSessionId: 'session-err-1',
        hasErrorFile: true,
        success: false,
        errors: ['Errors occurred while importing'],
      },
      status: 200,
      ok: true,
    } as FetchResponse<ImportResult>);

    render(<ImportBulkStockItemsModal closeModal={mockCloseModal} />);

    const fileInput = screen.getByLabelText(/select file/i) as HTMLInputElement;
    await user.upload(fileInput, new File(['bad,csv'], 'invalid.csv', { type: 'text/csv' }));

    const uploadButton = screen.getByRole('button', { name: /upload stock items/i });
    expect(uploadButton).toBeEnabled();

    await user.click(uploadButton);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /remove file/i }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(uploadButton).toBeDisabled();

    mockUploadStockItems.mockClear();
    await user.click(uploadButton);
    expect(uploadStockItems).not.toHaveBeenCalled();
  });

  it('disables upload button and shows loading state while upload is in progress', async () => {
    const user = userEvent.setup();
    let resolveUpload!: (value: FetchResponse<ImportResult>) => void;

    mockUploadStockItems.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve;
        }),
    );

    render(<ImportBulkStockItemsModal closeModal={mockCloseModal} />);

    const fileInput = screen.getByLabelText(/select file/i) as HTMLInputElement;
    await user.upload(fileInput, new File(['test content'], 'valid.csv', { type: 'text/csv' }));

    const uploadButton = screen.getByRole('button', { name: /upload stock items/i });
    await user.click(uploadButton);

    expect(uploadButton).toBeDisabled();
    expect(screen.getByText(/uploading stock items/i)).toBeInTheDocument();
    expect(uploadStockItems).toHaveBeenCalledTimes(1);

    resolveUpload({
      data: {
        createdCount: 1,
        updatedCount: 0,
        notChangedCount: 0,
        uploadSessionId: 'session-loading',
        hasErrorFile: false,
        success: true,
        errors: [],
      },
      status: 200,
      ok: true,
    } as FetchResponse<ImportResult>);

    await waitFor(() => {
      expect(mockCloseModal).toHaveBeenCalledTimes(1);
    });
  });
});
