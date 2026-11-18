import React from 'react';
import { formatDate } from '@/utils/date';
import { Modal, Text, Stack, Divider, Badge } from '@mantine/core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faUserTie,
  faClock,
  faDoorOpen,
  faCalendarDays,
  faCircleInfo,
} from '@fortawesome/free-solid-svg-icons';
import type { DemoLesson } from '@/types/demoLesson.types';
import { getLocalized } from '@/utils/getLocalized';
import { useTranslation } from 'react-i18next';

interface DemoDetailModalProps {
  demoLesson: DemoLesson | null;
  opened: boolean;
  onClose: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Rejalashtirilgan',
  completed: 'Bajarilgan',
  cancelled: 'Bekor qilingan',
};

export const DemoDetailModal: React.FC<DemoDetailModalProps> = ({
  demoLesson,
  opened,
  onClose,
}) => {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  if (!demoLesson) return null;

  const formattedDate = formatDate(demoLesson.date);
  const roomName = demoLesson.room
    ? `${getLocalized(demoLesson.room, 'name', lang)} (${demoLesson.room.floor}-qavat)`
    : '—';

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      withCloseButton={false}
      size="lg"
      radius="12px"
      centered
      padding={0}
    >
      <div className="modal-header">
        <span className="modal-header-title">Demo dars: {demoLesson.group?.name ?? '—'}</span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '20px',
          }}
        >
          ✕
        </button>
      </div>

      <Stack gap="md">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '24px 28px 0',
          }}
        >
          <Text size="lg" className="detail-modal-title" color="blue">
            {demoLesson.group?.name ?? '—'}
          </Text>
          <Badge size="xl" variant="filled" radius="sm" color="gray">
            {STATUS_LABELS[demoLesson.status ?? ''] ?? demoLesson.status ?? 'Demo'}
          </Badge>
        </div>

        <Divider />

        <Stack gap="xs" style={{ padding: '0 28px 24px' }}>
          <DetailItem
            icon={faUserTie}
            label="O‘qituvchi"
            value={
              demoLesson.teacher
                ? `${demoLesson.teacher.first_name} ${demoLesson.teacher.last_name}`
                : '—'
            }
          />
          <DetailItem icon={faCalendarDays} label="Sana" value={formattedDate} />
          <DetailItem
            icon={faClock}
            label="Vaqt"
            value={`${demoLesson.start_time.slice(0, 5)} - ${demoLesson.end_time.slice(0, 5)}`}
          />
          <DetailItem icon={faDoorOpen} label="Xona" value={roomName} />
          <DetailItem
            icon={faCircleInfo}
            label="Holat"
            value={STATUS_LABELS[demoLesson.status ?? ''] ?? demoLesson.status ?? '—'}
          />
        </Stack>
      </Stack>
    </Modal>
  );
};

const DetailItem = ({ icon, label, value }: { icon: any; label: string; value: string }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
    <div
      style={{
        width: '32px',
        height: '32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f0f4f8',
        borderRadius: '8px',
      }}
    >
      <FontAwesomeIcon icon={icon} style={{ color: '#003366' }} />
    </div>
    <div>
      <Text size="xs" color="dimmed" style={{ lineHeight: 1.2, fontFamily: 'noto-m' }}>
        {label}
      </Text>
      <Text size="sm" fw={500} style={{ fontFamily: 'noto-m', color: '#000000' }}>
        {value}
      </Text>
    </div>
  </div>
);
