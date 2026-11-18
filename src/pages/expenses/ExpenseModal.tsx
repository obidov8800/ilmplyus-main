import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, NumberInput, Button, Stack, Group, Textarea } from '@mantine/core';
import type { Expense, SaveExpensePayload } from '@/types/expense.types';

interface ExpenseModalProps {
  opened: boolean;
  onClose: () => void;
  onSave: (payload: SaveExpensePayload) => void;
  expense?: Expense | null;
  isSaving: boolean;
}

export default function ExpenseModal({
  opened,
  onClose,
  onSave,
  expense,
  isSaving,
}: ExpenseModalProps) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState<number | string>(0);
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (expense) {
      setAmount(expense.amount);
      setDescription(expense.description);
    } else {
      setAmount(0);
      setDescription('');
    }
  }, [expense, opened]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      amount: Number(amount),
      description,
    });
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={expense ? t('registrationModal.edit') : t('taskModal.createTitle')}
      centered
      radius="lg"
      padding="xl"
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <NumberInput
            label={t('course.newPrice')}
            value={amount}
            onChange={setAmount}
            placeholder="100 000"
            required
            radius="md"
            rightSection={<span style={{ paddingRight: 10, color: '#888' }}>UZS</span>}
          />
          <Textarea
            label={t('course.comment')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="..."
            required
            radius="md"
            minRows={3}
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
