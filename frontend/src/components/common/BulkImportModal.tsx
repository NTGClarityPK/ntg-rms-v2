'use client';

import { useState } from 'react';
import {
  Modal,
  Button,
  FileButton,
  Stack,
  Text,
  Alert,
  Progress,
  List,
  Group,
  Divider,
} from '@mantine/core';
import { IconUpload, IconDownload, IconCheck, IconX, IconAlertCircle, IconInfoCircle } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { t } from '@/lib/utils/translations';
import { useLanguageStore } from '@/lib/store/language-store';
import { useErrorColor, useSuccessColor, useInfoColor } from '@/lib/hooks/use-theme-colors';

interface BulkImportModalProps {
  opened: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  entityType: string;
  entityName: string;
  downloadSample: () => Promise<Blob>;
  uploadFile: (file: File) => Promise<{ success: number; failed: number; errors: string[] }>;
}

export function BulkImportModal({
  opened,
  onClose,
  onSuccess,
  entityType,
  entityName,
  downloadSample,
  uploadFile,
}: BulkImportModalProps) {
  const { language } = useLanguageStore();
  const errorColor = useErrorColor();
  const successColor = useSuccessColor();
  const infoColor = useInfoColor();

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);

  const handleDownloadSample = async () => {
    try {
      setDownloading(true);
      const blob = await downloadSample();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bulk-import-${entityType}-sample.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      notifications.show({
        title: t('bulkImport.sampleDownloaded', language) || 'Sample downloaded',
        message: t('bulkImport.sampleDownloadedMessage', language) || 'Sample Excel file downloaded successfully',
        color: successColor,
        icon: <IconCheck size={16} />,
      });
    } catch (error: any) {
      notifications.show({
        title: t('bulkImport.downloadError', language) || 'Download error',
        message: error.message || 'Failed to download sample file',
        color: errorColor,
        icon: <IconX size={16} />,
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      notifications.show({
        title: t('bulkImport.noFileSelected', language) || 'No file selected',
        message: t('bulkImport.pleaseSelectFile', language) || 'Please select an Excel file to upload',
        color: errorColor,
        icon: <IconX size={16} />,
      });
      return;
    }

    try {
      setUploading(true);
      setResult(null);
      const uploadResult = await uploadFile(file);

      setResult(uploadResult);

      if (uploadResult.failed === 0) {
        notifications.show({
          title: t('bulkImport.uploadSuccess', language) || 'Upload successful',
          message: t('bulkImport.allRecordsImported', language, { count: uploadResult.success }) || 
            `Successfully imported ${uploadResult.success} records`,
          color: successColor,
          icon: <IconCheck size={16} />,
        });
      } else {
        notifications.show({
          title: t('bulkImport.uploadPartial', language) || 'Partial success',
          message: t('bulkImport.someRecordsFailed', language, { 
            success: uploadResult.success, 
            failed: uploadResult.failed 
          }) || `Imported ${uploadResult.success} records, ${uploadResult.failed} failed`,
          color: infoColor,
          icon: <IconInfoCircle size={16} />,
        });
      }

      // Refresh the list if any records were successfully imported
      if (uploadResult.success > 0 && onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      notifications.show({
        title: t('bulkImport.uploadError', language) || 'Upload error',
        message: error.message || 'Failed to upload file',
        color: errorColor,
        icon: <IconX size={16} />,
      });
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setResult(null);
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={t('bulkImport.title', language, { entity: entityName }) || `Bulk Import ${entityName}`}
      size="lg"
    >
      <Stack gap="md">
        <Alert icon={<IconInfoCircle size={16} />} color={infoColor}>
          <Text size="sm">
            {t('bulkImport.instructions', language) || 
              'Download the sample Excel file, fill it with your data, and upload it here.'}
          </Text>
        </Alert>

        <Group justify="space-between">
          <Text size="sm" fw={500}>
            {t('bulkImport.step1', language) || 'Step 1: Download sample file'}
          </Text>
          <Button
            leftSection={<IconDownload size={16} />}
            onClick={handleDownloadSample}
            loading={downloading}
            variant="light"
          >
            {t('bulkImport.downloadSample', language) || 'Download Sample'}
          </Button>
        </Group>

        <Divider />

        <Group justify="space-between">
          <Text size="sm" fw={500}>
            {t('bulkImport.step2', language) || 'Step 2: Upload filled file'}
          </Text>
          <FileButton
            onChange={(file) => {
              if (file) {
                setFile(file);
                setResult(null);
              }
            }}
            accept=".xlsx,.xls"
          >
            {(props) => (
              <Button
                {...props}
                leftSection={<IconUpload size={16} />}
                variant="light"
              >
                {file ? file.name : t('bulkImport.selectFile', language) || 'Select File'}
              </Button>
            )}
          </FileButton>
        </Group>

        {file && (
          <Group justify="flex-end">
            <Button
              onClick={handleUpload}
              loading={uploading}
              leftSection={<IconUpload size={16} />}
            >
              {t('bulkImport.upload', language) || 'Upload & Import'}
            </Button>
          </Group>
        )}

        {uploading && (
          <Progress value={100} animated />
        )}

        {result && (
          <Stack gap="sm">
            <Alert
              icon={result.failed === 0 ? <IconCheck size={16} /> : <IconAlertCircle size={16} />}
              color={result.failed === 0 ? successColor : infoColor}
              title={
                result.failed === 0
                  ? t('bulkImport.allSuccess', language, { count: result.success }) || 
                    `Successfully imported ${result.success} records`
                  : t('bulkImport.partialSuccess', language, { 
                      success: result.success, 
                      failed: result.failed 
                    }) || 
                    `Imported ${result.success} records, ${result.failed} failed`
              }
            >
              <Stack gap="xs">
                <Text size="sm">
                  {t('bulkImport.successCount', language, { count: result.success }) || 
                    `Successfully imported: ${result.success}`}
                </Text>
                {result.failed > 0 && (
                  <Text size="sm" c={errorColor}>
                    {t('bulkImport.failedCount', language, { count: result.failed }) || 
                      `Failed: ${result.failed}`}
                  </Text>
                )}
              </Stack>
            </Alert>

            {result.errors.length > 0 && (
              <Alert icon={<IconAlertCircle size={16} />} color={errorColor} title={t('bulkImport.errors', language) || 'Errors'}>
                <List size="sm" spacing="xs">
                  {result.errors.slice(0, 10).map((error, index) => (
                    <List.Item key={index}>{error}</List.Item>
                  ))}
                  {result.errors.length > 10 && (
                    <List.Item>
                      {t('bulkImport.moreErrors', language, { count: result.errors.length - 10 }) || 
                        `... and ${result.errors.length - 10} more errors`}
                    </List.Item>
                  )}
                </List>
              </Alert>
            )}
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}

