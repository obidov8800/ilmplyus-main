import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, TextInput, PasswordInput, Select, Button, Stack, Group } from '@mantine/core';
import { useOptions, toSelectData } from '@/api/options';
import type { User, SaveUserPayload } from '@/types/user.types';
import {
  PHONE_MAX_LENGTH,
  PHONE_PLACEHOLDER,
  PHONE_PREFIX,
  formatPhone,
  isValidPhone,
} from '@/utils/phone';

interface UserModalProps {
  opened: boolean;
  onClose: () => void;
  onSave: (payload: SaveUserPayload) => void;
  user?: User | null;
  isSaving: boolean;
}

export default function UserModal({ opened, onClose, onSave, user, isSaving }: UserModalProps) {
  const { t } = useTranslation();
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState(PHONE_PREFIX);
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);

  const { data: roles } = useOptions('roles');
  const { data: branches } = useOptions('branches');

  useEffect(() => {
    if (user) {
      setFullName(user.full_name);
      setUsername(user.username);
      setPhone(formatPhone(user.phone));
      setRoleId(user.role_id ? String(user.role_id) : null);
      setBranchId(user.branch_id ? String(user.branch_id) : null);
      setPassword('');
    } else {
      setFullName('');
      setUsername('');
      setPhone(PHONE_PREFIX);
      setRoleId(null);
      setBranchId(null);
      setPassword('');
    }
  }, [user, opened]);

  const [phoneError, setPhoneError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleId || !branchId) return;

    if (!isValidPhone(phone)) {
      setPhoneError(t('phoneInput.invalid'));
      return;
    }
    setPhoneError(null);

    const payload: SaveUserPayload = {
      full_name: fullName,
      username,
      phone,
      role_id: Number(roleId),
      branch_id: Number(branchId),
    };

    if (password) payload.password = password;

    onSave(payload);
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={user ? t('registrationModal.edit') : t('registrationModal.create')}
      centered
      radius="lg"
      padding="xl"
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <TextInput
            label={t('registrationModal.fields.firstName')}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="John Doe"
            required
            radius="md"
          />
          <TextInput
            label={t('login.loginPlaceHolder')}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
            required
            radius="md"
          />
          <TextInput
            label={t('registrationModal.fields.phone')}
            type="tel"
            inputMode="numeric"
            maxLength={PHONE_MAX_LENGTH}
            value={phone}
            onChange={(e) => {
              setPhone(formatPhone(e.target.value));
              setPhoneError(null);
            }}
            error={phoneError}
            placeholder={PHONE_PLACEHOLDER}
            required
            radius="md"
          />
          <PasswordInput
            label={t('login.passwordPlaceHolder')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required={!user}
            radius="md"
          />
          <Select
            label={t('tasks.role')}
            value={roleId}
            onChange={setRoleId}
            data={toSelectData(roles)}
            placeholder={t('taskModal.selectOperator')}
            required
            radius="md"
          />
          <Select
            label={t('registrationModal.fields.branchId')}
            value={branchId}
            onChange={setBranchId}
            data={toSelectData(branches)}
            placeholder={t('registrationModal.placeholders.branchId')}
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
