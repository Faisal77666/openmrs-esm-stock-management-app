import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { saveAs } from 'file-saver';
import {
  ActionableNotification,
  Button,
  FileUploader,
  Form,
  InlineLoading,
  InlineNotification,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Stack,
} from '@carbon/react';
import { getCoreTranslation, restBaseUrl, showSnackbar } from '@openmrs/esm-framework';
import { extractErrorMessagesFromResponse } from '../../constants';
import type { ImportResult } from '../../core/api/types/stockItem/ImportResult';
import { useHandleMutate } from '../../utils';
import { downloadStockItemImportErrors, uploadStockItems } from './stock-items-bulk-import.resource';
import styles from './stock-items-bulk-import.scss';

export interface ImportBulkStockItemsModalProps {
  closeModal: () => void;
}

function getErrorMessages(error: unknown, fallbackMessage: string): string[] {
  const extracted = extractErrorMessagesFromResponse(error).filter((msg) => Boolean(msg?.trim()));
  if (extracted.length > 0) {
    return extracted;
  }

  const rawMessage = (error as { message?: string } | undefined)?.message?.trim();
  return [rawMessage || fallbackMessage];
}

const ImportBulkStockItemsModal: React.FC<ImportBulkStockItemsModalProps> = ({ closeModal }) => {
  const { t } = useTranslation();
  const handleMutate = useHandleMutate();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDownloadingErrors, setIsDownloadingErrors] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [partialSummary, setPartialSummary] = useState<string | null>(null);
  const [errorSessionId, setErrorSessionId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const clearErrorState = () => {
    setImportErrors([]);
    setPartialSummary(null);
    setErrorSessionId(null);
    setDownloadError(null);
  };

  const formatImportSummary = (result: ImportResult) =>
    t('stockItemsImportSummary', '{{created}} created, {{updated}} updated, {{notChanged}} unchanged.', {
      created: result.createdCount ?? 0,
      updated: result.updatedCount ?? 0,
      notChanged: result.notChangedCount ?? 0,
    });

  const onConfirmUpload = async () => {
    if (!selectedFile || isSubmitting) {
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile, 'Import_Stock_Items.csv');
    formData.append('hasHeader', 'true');

    clearErrorState();
    setIsSubmitting(true);

    try {
      const response = await uploadStockItems(formData);
      const result = response?.data;
      const responseErrors = (result?.errors ?? []).filter((message): message is string => Boolean(message?.trim()));
      const hasImportedItems = (result?.createdCount ?? 0) > 0 || (result?.updatedCount ?? 0) > 0;
      const isSuccess = result?.success === true && responseErrors.length === 0;

      if (isSuccess || hasImportedItems) {
        handleMutate(`${restBaseUrl}/stockmanagement/stockitem`);
      }

      if (isSuccess) {
        showSnackbar({
          kind: 'success',
          title: t('stockItemsUploadedSuccessfully', 'Stock items uploaded successfully'),
          subtitle: formatImportSummary(result),
        });
        closeModal();
        return;
      }

      const summary = hasImportedItems && result ? formatImportSummary(result) : null;
      const errorsToDisplay =
        responseErrors.length > 0 ? responseErrors : [t('unknownError', 'An unknown error occurred')];

      setImportErrors(errorsToDisplay);
      setPartialSummary(summary);
      setErrorSessionId(result?.hasErrorFile && result?.uploadSessionId ? result.uploadSessionId : null);
    } catch (err) {
      const errorMessages = getErrorMessages(err, t('unknownError', 'An unknown error occurred'));
      setImportErrors(errorMessages);
      setPartialSummary(null);
      setErrorSessionId(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const onDownloadErrorLog = async () => {
    if (!errorSessionId || isDownloadingErrors) {
      return;
    }

    setDownloadError(null);
    setIsDownloadingErrors(true);
    try {
      const blob = await downloadStockItemImportErrors(errorSessionId);
      saveAs(blob, 'stock-item-import-errors.txt');
    } catch (err) {
      const errorMessages = getErrorMessages(err, t('unknownError', 'An unknown error occurred'));
      setDownloadError(errorMessages.join(', '));
    } finally {
      setIsDownloadingErrors(false);
    }
  };

  const onFileChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event?.target?.files?.[0];
    if (file) {
      setSelectedFile(file);
      clearErrorState();
    } else {
      event.preventDefault();
    }
  };

  const onFileDeleted = () => {
    setSelectedFile(null);
    clearErrorState();
  };

  const notificationKind = partialSummary ? 'warning' : 'error';
  const notificationTitle = partialSummary
    ? t('stockItemsUploadedWithErrors', 'Stock items imported with errors')
    : t('errorUploadingItems', 'An error occurred uploading stock items');
  const notificationSubtitle = partialSummary
    ? `${partialSummary} ${importErrors.join(', ')}`
    : importErrors.join(', ');

  return (
    <div>
      <Form>
        <ModalHeader closeModal={closeModal} title={t('importStockItems', 'Import stock items')} />
        <ModalBody>
          <Stack gap={5}>
            <FileUploader
              accept={['.csv']}
              buttonLabel={t('selectFile', 'Select file')}
              disabled={isSubmitting}
              filenameStatus="edit"
              iconDescription={t('removeFile', 'Remove file')}
              labelDescription={t('onlyCsvFilesAt2mbOrLess', 'Only .csv files at 2MB or less')}
              labelTitle=""
              multiple={false}
              name="file"
              onChange={onFileChanged}
              onDelete={onFileDeleted}
              size="sm"
            />
            {isSubmitting && <InlineLoading description={t('uploadingStockItems', 'Uploading stock items...')} />}
            {importErrors.length > 0 &&
              (errorSessionId ? (
                <ActionableNotification
                  actionButtonLabel={
                    isDownloadingErrors
                      ? t('downloadingErrorLog', 'Downloading error log...')
                      : t('downloadErrorLog', 'Download error log')
                  }
                  className={styles.errorNotification}
                  closeOnEscape={false}
                  hasFocus={false}
                  hideCloseButton
                  inline
                  kind={notificationKind}
                  lowContrast
                  onActionButtonClick={onDownloadErrorLog}
                  role="alert"
                  subtitle={notificationSubtitle}
                  title={notificationTitle}
                />
              ) : (
                <InlineNotification
                  className={styles.errorNotification}
                  hideCloseButton
                  kind={notificationKind}
                  lowContrast
                  role="alert"
                  subtitle={notificationSubtitle}
                  title={notificationTitle}
                />
              ))}
            {downloadError && (
              <InlineNotification
                className={styles.errorNotification}
                hideCloseButton
                kind="error"
                lowContrast
                role="alert"
                subtitle={downloadError}
                title={t('errorDownloadingImportErrors', 'An error occurred downloading import error log')}
              />
            )}
          </Stack>
        </ModalBody>
        <ModalFooter>
          <Button kind="secondary" onClick={closeModal}>
            {getCoreTranslation('cancel')}
          </Button>
          <Button disabled={!selectedFile || isSubmitting} type="button" onClick={onConfirmUpload}>
            {t('uploadStockItems', 'Upload stock items')}
          </Button>
        </ModalFooter>
      </Form>
    </div>
  );
};

export default ImportBulkStockItemsModal;
