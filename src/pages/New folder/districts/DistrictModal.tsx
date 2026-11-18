import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, TextInput, Select, Button, Stack, Group } from '@mantine/core';
import { useOptions, toSelectData } from '@/api/options';
import type { District, SaveDistrictPayload } from '@/types/district.types';

interface DistrictModalProps {
  opened: boolean;
  onClose: () => void;
  onSave: (payload: SaveDistrictPayload) => void;
  district?: District | null;
  isSaving: boolean;
}

export default function DistrictModal({
  opened,
  onClose,
  onSave,
  district,
  isSaving,
}: DistrictModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [regionId, setRegionId] = useState<string | null>(null);

  const { data: regions } = useOptions('regions');

  useEffect(() => {
    if (district) {
      setName(district.name_uz);
      setRegionId(String(district.region_id));
    } else {
      setName('');
      setRegionId(null);
    }
  }, [district, opened]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regionId) return;
    onSave({ name_uz: name, region_id: Number(regionId) });
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={district ? t('registrationModal.edit') : t('registrationModal.create')}
      centered
      radius="lg"
      padding="xl"
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <TextInput
            label={t('header.districts')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Yunusobod"
            required
            radius="md"
          />
          <Select
            label={t('header.regions')}
            value={regionId}
            onChange={setRegionId}
            data={toSelectData(regions)}
            placeholder={t('registrationModal.placeholders.regionId')}
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
