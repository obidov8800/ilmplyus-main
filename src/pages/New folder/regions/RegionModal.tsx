import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, TextInput, Button, Stack, Group } from '@mantine/core';
import type { Region, SaveRegionPayload } from '@/types/region.types';

interface RegionModalProps {
  opened: boolean;
  onClose: () => void;
  onSave: (payload: SaveRegionPayload) => void;
  region?: Region | null;
  isSaving: boolean;
}

export default function RegionModal({
  opened,
  onClose,
  onSave,
  region,
  isSaving,
}: RegionModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');

  useEffect(() => {
    if (region) {
      setName(region.name_uz);
    } else {
      setName('');
    }
  }, [region, opened]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ name_uz: name });
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={region ? t('registrationModal.edit') : t('registrationModal.create')}
      centered
      radius="lg"
      padding="xl"
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <TextInput
            label={t('header.regions')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Toshkent"
            required
            radius="md"
          />

          <Group justify="flex-end" mt="xl">
            <Button type="submit" loading={isSaving} radius="md">
              {t('registrationModal.save')}
            </Button>
            <Button variant="subtle" onClick={onClose} radius="md">
              {t('registrationModal.cancel')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
