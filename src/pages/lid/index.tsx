import { useState, useCallback, useRef, useEffect } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import LeadColumn from '@/components/LidColumn';
import AloqaModal from '@/components/AloqaModal';
import DemoModal from '@/components/DemoModal';
import ShartnomaModal from '@/components/ShartnomaModal';
import LeadDetailsModal from '@/components/LeadDetailsModal';
import { RegistrationModal } from '@/components/RegistrationModal';
import { updateLidStatus } from './lid.service';
import LidStatusDetailPage from './LidStatusDetailPage';
import type { Lid, LidStatus } from '@/types/lid.types';
import type { Column } from '@/components/LidColumn';
import { EMPTY_FILTER } from '@/components/FilterDropdown/Filterdropdown.constants';
import type { FilterState } from '@/components/FilterDropdown/Filterdropdown.constants';
import { addLidComment } from './lid.service';
import { useSip } from '@/pages/ip-telephone/useSip';
import useCallUIStore from '@/features/sip/useCallUIStore';
import './lid.css';
import { API } from '@/api/api';
import useAuthStore from '@/store/useAuthStore';
import { usePermission } from '@/hooks/usePermission';
import type { CreateTaskPayload } from '@/types/task.types';
import { notifications } from '@mantine/notifications';

export type { Lid };

export type Group = {
  id: number;
  title: string;
  columnIds: number[];
};

export interface PendingDrop {
  lead: Lid;
  targetGroupId: number;
}

type ModalType = 'aloqa' | 'demo' | 'shartnoma' | 'registration' | null;

const GROUPS: Group[] = [
  { id: 1, title: 'lid.groups.registered', columnIds: [1, 2] },
  { id: 2, title: 'lid.groups.contact', columnIds: [3, 4, 5] },
  { id: 3, title: 'lid.groups.demoClass', columnIds: [6, 7, 8] },
  { id: 4, title: 'lid.groups.contractAndPayment', columnIds: [9, 10] },
];

const COLUMNS: Column[] = [
  { id: 1, title: 'lid.columns.online', color: '#FE9100', groupId: 1 },
  { id: 2, title: 'lid.columns.offline', color: '#FE9100', groupId: 1 },
  { id: 3, title: 'lid.columns.contactEstablished', color: '#FE9100', groupId: 2 },
  { id: 4, title: 'lid.columns.contactNotEstablished', color: '#FE9100', groupId: 2 },
  { id: 5, title: 'lid.columns.notInterested', color: '#FE9100', groupId: 2 },
  { id: 6, title: 'lid.columns.willCome', color: '#FE9100', groupId: 3 },
  { id: 7, title: 'lid.columns.came', color: '#FE9100', groupId: 3 },
  { id: 8, title: 'lid.columns.didNotCome', color: '#FE9100', groupId: 3 },
  { id: 9, title: 'lid.columns.contract', color: '#FE9100', groupId: 4 },
  { id: 10, title: 'lid.columns.payment', color: '#FE9100', groupId: 4 },
];

function getGroupIdByColumnId(columnId: number): number {
  const col = COLUMNS.find((c) => c.id === columnId);
  return col ? col.groupId : -1;
}

function getModalTypeForGroup(groupId: number): ModalType {
  if (groupId === 2) return 'aloqa';
  if (groupId === 3) return 'demo';
  if (groupId === 4) return 'shartnoma';
  return null;
}

export default function Lid() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [draggedLead, setDraggedLead] = useState<Lid | null>(null);

  // SIP call widget — the popup itself is rendered by GlobalCallWidget in
  // Layout (survives navigating away mid-call); this page just starts the
  // call and tracks it locally to drive the pipeline status update below.
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const pendingCallLeadRef = useRef<Lid | null>(null);
  const wasActiveRef = useRef(false);
  const { callState, makeCall } = useSip(remoteAudioRef as React.RefObject<HTMLAudioElement>);
  const openCall = useCallUIStore((s) => s.openCall);

  const handleLidPhoneClick = useCallback(
    (phone: string, lead: Lid) => {
      pendingCallLeadRef.current = lead;
      wasActiveRef.current = false;
      openCall(phone);
      makeCall(phone);
    },
    [makeCall, openCall],
  );

  const [columnFilters, setColumnFilters] = useState<Record<number, FilterState>>({});
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lid | null>(null);
  const [editingLead, setEditingLead] = useState<Lid | null>(null);
  const [initialStatusForNewLid, setInitialStatusForNewLid] = useState<number | null>(null);

  const [detailStatusId, setDetailStatusId] = useState<number | null>(null);

  const [isPaymentSectionOpen, setIsPaymentSectionOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem('isPaymentSectionOpen');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const currentOperatorId = user?.id ?? null;

  const { mutateAsync: updateStatus } = useMutation({
    mutationFn: (vars: { id: number; status: LidStatus; operator_id: number | null }) =>
      updateLidStatus(vars.id, vars.status, vars.operator_id),
    // Butun `['lids']` prefiksi yangilanadi: faqat ikkita ustunni invalidate
    // qilganda manba ustun eski keshda qolib, lid ikkala ustunda ko'rinardi.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['lids'] });
    },
  });

  useEffect(() => {
    const lead = pendingCallLeadRef.current;
    if (!lead) return;

    if (callState === 'active') {
      wasActiveRef.current = true;
      updateStatus({
        id: lead.id,
        status: 3 as LidStatus,
        operator_id: currentOperatorId,
      });
    }

    if (callState === 'idle' || callState === 'error') {
      if (!wasActiveRef.current && (lead.status === 1 || lead.status === 2)) {
        updateStatus({
          id: lead.id,
          status: 4 as LidStatus,
          operator_id: currentOperatorId,
        });
      }
      pendingCallLeadRef.current = null;
      wasActiveRef.current = false;
    }
  }, [callState, updateStatus, currentOperatorId]);

  const { mutateAsync: createComment } = useMutation({
    mutationFn: ({ id, text }: { id: number; text: string }) => addLidComment(id, text),
  });

  const { mutateAsync: createReminderTask } = useMutation({
    mutationFn: (payload: CreateTaskPayload) => API.post('/tasks', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  // Lidni boshqa ustunga (holatga) o'tkazish backendda `lids.edit` talab qiladi — ruxsatsiz foydalanuvchi sudray olmaydi.
  const canEditLid = usePermission('lids.edit');

  const handleDragStart = useCallback(
    (lead: Lid) => {
      if (!canEditLid) return;
      setDraggedLead(lead);
    },
    [canEditLid],
  );

  const handleDrop = useCallback(
    (targetColumnId: number) => {
      if (!draggedLead) return;

      const fromGroupId = getGroupIdByColumnId(draggedLead.status);
      const toGroupId = getGroupIdByColumnId(targetColumnId);

      if (fromGroupId === toGroupId) {
        updateStatus({
          id: draggedLead.id,
          status: targetColumnId as LidStatus,
          operator_id: currentOperatorId,
        });
        setDraggedLead(null);
        return;
      }

      const modalType = getModalTypeForGroup(toGroupId);

      if (modalType) {
        setPendingDrop({ lead: draggedLead, targetGroupId: toGroupId });
        setActiveModal(modalType);
        setDraggedLead(null);
      }
    },
    [draggedLead, updateStatus, currentOperatorId],
  );

  const handleModalConfirm = useCallback(
    async (status: LidStatus, comment: string, reminderAt: string | null) => {
      if (!pendingDrop) return;
      const { lead } = pendingDrop;

      await updateStatus({
        id: lead.id,
        status,
        operator_id: currentOperatorId,
      });

      // Izoh kartochkada ko'rinadi — yozilgach ro'yxat yana yangilanadi.
      if (comment.trim()) {
        await createComment({ id: lead.id, text: comment });
        queryClient.invalidateQueries({ queryKey: ['lids'] });
      }

      // "Taymer" rejimi tanlangan bo'lsa — operatorning o'ziga shu muddatga
      // eslatma-vazifa yaratiladi (`/tasks`, xuddi "Vazifani yaratish"
      // tugmasi kabi). Asosiy amal (holat+izoh) allaqachon saqlangani uchun
      // bu qadam muvaffaqiyatsiz bo'lsa ham modal yopiladi — faqat xabar
      // ko'rsatiladi.
      if (reminderAt) {
        if (!currentOperatorId) {
          notifications.show({
            title: t('lid.modals.reminderErrorTitle'),
            message: t('lid.modals.reminderErrorNoOperator'),
            color: 'red',
          });
        } else {
          const fullName = `${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim();
          try {
            await createReminderTask({
              lid_id: lead.id,
              operator_id: currentOperatorId,
              deadline: reminderAt,
              priority: 'orta',
              description: comment.trim() || t('lid.modals.reminderDefaultDescription', { name: fullName }),
            });
          } catch {
            notifications.show({
              title: t('lid.modals.reminderErrorTitle'),
              message: t('lid.modals.reminderErrorFailed'),
              color: 'red',
            });
          }
        }
      }

      setActiveModal(null);
      setPendingDrop(null);
    },
    [pendingDrop, updateStatus, createComment, createReminderTask, queryClient, currentOperatorId, t],
  );

  const handleModalCancel = useCallback(() => {
    setActiveModal(null);
    setPendingDrop(null);
    setInitialStatusForNewLid(null);
  }, []);

  const handleFilterChange = useCallback((columnId: number, filter: FilterState) => {
    setColumnFilters((prev) => ({ ...prev, [columnId]: filter }));
  }, []);

  const handleLeadClick = useCallback((lead: Lid) => {
    setSelectedLead(lead);
  }, []);

  const handleAddClick = useCallback((columnId: number) => {
    setInitialStatusForNewLid(columnId);
    setActiveModal('registration');
  }, []);

  const activeLead = pendingDrop?.lead ?? null;

  const mainGroups = GROUPS.slice(0, 3);
  const sidebarGroupDef = GROUPS[3];
  const sidebarCols = COLUMNS.filter((c) => c.groupId === sidebarGroupDef.id);
  // Asosiy doskadagi jami ustunlar soni — `.lids-main-sections`ning
  // `flexGrow`i shunga teng bo'lishi shart, aks holda uning o'sishi
  // sidebar panelnikiga (`sidebarCols.length`) nomutanosib bo'lib qoladi
  // (`lid.css`dagi `.lids-main-sections`/`.lids-sidebar-section` izohiga
  // qarang — ikkalasi bitta "1 og'irlik = 1 ustun" tizimida ishlashi kerak).
  const mainTotalCols = mainGroups.reduce(
    (sum, group) => sum + COLUMNS.filter((c) => c.groupId === group.id).length,
    0,
  );

  const togglePaymentSection = useCallback(() => {
    setIsPaymentSectionOpen((prev) => {
      const next = !prev;
      localStorage.setItem('isPaymentSectionOpen', JSON.stringify(next));
      return next;
    });
  }, []);

  if (detailStatusId !== null) {
    return (
      <LidStatusDetailPage
        initialStatusId={detailStatusId}
        onBack={() => setDetailStatusId(null)}
      />
    );
  }

  return (
    <>
      <div className="lids-board-wrapper">
        <div className={`lids-board${isPaymentSectionOpen ? ' lids-board--payment-open' : ''}`}>
          <div
            className="lids-main-sections"
            // `mainTotalCols`ga teng — sidebar panel bilan bitta umumiy
            // "1 og'irlik = 1 ustun" tizimida (batafsili lid.css'da).
            style={{ flexGrow: mainTotalCols }}
          >
            {mainGroups.map((group) => {
              const cols = COLUMNS.filter((c) => c.groupId === group.id);
              return (
                <div
                  key={group.id}
                  className="lids-group"
                  // To'lov paneli (o'ngdagi "Shartnoma va to'lov") yopilganda
                  // bo'shagan joyni bo'limlar bir xilda o'zlashtirishi uchun:
                  // har biri o'z ustunlari soniga mutanosib o'sadi — shuning
                  // uchun necha ustun bo'lishidan qat'i nazar HAR BIR
                  // USTUNning o'sish miqdori teng bo'lib qoladi. Bu endi
                  // xavfsiz: kartalar kengligi endi kontentga qarab
                  // o'zgarmaydi (`lid.css`dagi `.lead-card`/
                  // `.lead-column__body`ga qarang), shuning uchun bo'sh va
                  // kartali bo'limlar ham teng o'sadi. `--cols` esa
                  // `lid.css`dagi `.lids-group`ning bazaviy kenglik
                  // formulasi (`calc()`) uchun kerak.
                  style={{ flexGrow: cols.length, '--cols': cols.length } as React.CSSProperties}
                >
                  <div className="lids-group__header">
                    <span className="lids-group__title">{t(group.title)}</span>
                  </div>
                  <div className="lids-group__columns">
                    {cols.map((col) => (
                      <LeadColumn
                        key={col.id}
                        column={{ ...col, title: t(col.title) }}
                        filter={columnFilters[col.id] ?? EMPTY_FILTER}
                        onDrop={handleDrop}
                        onDragStart={handleDragStart}
                        onFilterChange={handleFilterChange}
                        onLeadClick={handleLeadClick}
                        onAddClick={handleAddClick}
                        onTitleClick={setDetailStatusId}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div
            className={`lids-sidebar-section ${!isPaymentSectionOpen ? 'is-collapsed' : ''}`}
            // Yopiq holatda o'smaydi (44px'da qat'iy qoladi, CSS
            // `.is-collapsed` orqali) — ochiq holatda esa `.lids-main-sections`
            // bilan bitta og'irlik tizimida (1 og'irlik = 1 ustun).
            style={{ flexGrow: isPaymentSectionOpen ? sidebarCols.length : 0 }}
          >
            {isPaymentSectionOpen ? (
              <div className="lids-group lids-group--sidebar">
                <div className="lids-group__header lids-group__header--sidebar">
                  <span className="lids-group__title">{t(sidebarGroupDef.title)}</span>
                  <button
                    className="lids-sidebar-toggle lids-sidebar-toggle--collapsed"
                    type="button"
                    aria-label="Expand"
                    onClick={togglePaymentSection}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      style={{ transform: 'rotate(180deg)' }}
                    >
                      <path d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
                <div className="lids-group__columns lids-group__columns--sidebar">
                  {/* `minWidth: 0` shart — flex elementning standart `min-width: auto`si
                      uni o'z kontentining (uzun belgi/sana kabi `white-space: nowrap`
                      elementlar) tabiiy enidan pastga siqilishiga yo'l qo'ymaydi. Natijada
                      "Shartnoma" ustuni "To'lov"dan uzunroq kontent olsa, u qo'shnisi
                      hisobidan kengayib ketardi — "To'lov" torayib, matni kesilib qolardi. */}
                  {sidebarCols.map((col) => (
                    <div
                      key={col.id}
                      style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}
                    >
                      {/* `leads` berilmaydi — boshqa har bir ustun kabi o'zi
                          `fetchLidsByStatus({status: col.id})` orqali
                          yuklaydi. Ilgari shu ustun (9-holat, "Shartnoma")
                          alohida `/lids/archived/list` dan olardi — o'sha
                          endpoint holat=9 bilan mos kelmaydi (arxivlangan/
                          o'chirilgan lidlar uchun, boshqa tushuncha), shuning
                          uchun shartnoma tuzilgan lidlar hech qachon
                          ko'rinmasdi. */}
                      <LeadColumn
                        column={{ ...col, title: t(col.title) }}
                        filter={columnFilters[col.id] ?? EMPTY_FILTER}
                        isLastSection={isPaymentSectionOpen}
                        onDrop={handleDrop}
                        onDragStart={handleDragStart}
                        onFilterChange={handleFilterChange}
                        onLeadClick={handleLeadClick}
                        onAddClick={handleAddClick}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div
                className="lids-sidebar-collapsed"
                onClick={togglePaymentSection}
                role="button"
                tabIndex={-1}
              >
                <button className="lids-sidebar-toggle" type="button" aria-label="Collapse">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                </button>
                <span className="lids-sidebar-collapsed-text">{t(sidebarGroupDef.title)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {activeModal === 'aloqa' && activeLead && (
        <AloqaModal lead={activeLead} onConfirm={handleModalConfirm} onCancel={handleModalCancel} />
      )}
      {activeModal === 'demo' && activeLead && (
        <DemoModal lead={activeLead} onConfirm={handleModalConfirm} onCancel={handleModalCancel} />
      )}
      {activeModal === 'shartnoma' && activeLead && (
        <ShartnomaModal
          lead={activeLead}
          onConfirm={handleModalConfirm}
          onCancel={handleModalCancel}
        />
      )}

      {(activeModal === 'registration' || editingLead) && (
        <RegistrationModal
          editId={editingLead?.id}
          initialStatus={editingLead ? undefined : (initialStatusForNewLid ?? undefined)}
          onClose={() => {
            setEditingLead(null);
            handleModalCancel();
          }}
          onSuccess={() => {
            // Bu `onSuccess` ikki xil holat uchun umumiy: (1) YANGI lid
            // ro'yxatga olinganda va (2) MAVJUD lidni tahrirlashda
            // (`editingLead`). Ilgari ikkalasida ham SO'ZSIZ aloqa
            // modalini ochishga urinardi — tahrirlashda esa bu foydalanuvchi
            // drag&drop bilan (masalan "O'rnatilmadi"ga) o'zi tanlagan
            // holatni qayta so'rab, keraksiz oyna ochib yuborardi. Endi
            // MAVJUD lidni tahrirlashda hech qanday qo'shimcha oyna
            // ochilmaydi — lid o'z holatida qoladi; aloqa modali FAQAT
            // yangi lid ro'yxatga olingandan keyin ochiladi.
            if (editingLead) {
              setEditingLead(null);
              return;
            }

            setPendingDrop({
              lead: editingLead!,
              targetGroupId: 2,
            });

            setActiveModal('aloqa');
          }}
        />
      )}

      {selectedLead && (
        <LeadDetailsModal
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onPhoneClick={(phone, lead) => handleLidPhoneClick(phone, lead)}
          onEdit={(lead) => {
            setSelectedLead(null); // Detail yopiladi
            setEditingLead(lead); // Edit ochiladi
          }}
        />
      )}

      <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />
    </>
  );
}
