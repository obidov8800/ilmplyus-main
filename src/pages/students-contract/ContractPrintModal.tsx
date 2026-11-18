import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { API } from '@/api/api';
import {
  buildTemplateData,
  buildStatusBlockHTML,
  printFromDocxTemplate,
  type ContractStatusBlockData,
} from '@/utils/contractPdf';
import { printPreschoolContract } from '@/utils/preschoolContractPrint';
import { ContractLegalText, type ContractType } from '@/pages/contract-confirm/legalTexts';
import '@/pages/contract-confirm/contractConfirm.css';
import './contractPrint.css';

import adultTemplate from '@/assets/documents/01. ILM Шартнома умумий (ўқувчи).docx?url';
import minorTemplate from '@/assets/documents/02_ILM_Шартнома_икки_томонлама_вакил+ўқувчи.docx?url';
import legalBilateralTemplate from '@/assets/documents/03_ILM_Шартнома_икки_томонлама_юридик_шахс+ўқувчи.docx?url';
import legalTrilateralTemplate from '@/assets/documents/04_ILM_Шартнома_уч_томонлама_юридик_шахс+вакил+ўқувчи.docx?url';

const getTemplateUrl = (contractType: string): string => {
  switch (contractType) {
    case 'minor': return minorTemplate;
    case 'legal_bilateral': return legalBilateralTemplate;
    case 'legal_trilateral': return legalTrilateralTemplate;
    default: return adultTemplate;
  }
};

interface ContractPrintModalProps {
  contractId: number;
  onClose: () => void;
}

const ContractPrintModal = ({ contractId, onClose }: ContractPrintModalProps) => {
  const [pdfLoading, setPdfLoading] = useState(false);
  const [printLoading, setPrintLoading] = useState(false);

  const { data: responseData, isLoading } = useQuery({
    queryKey: ['student-contract-print', contractId],
    queryFn: () => API.get(`/student-contracts/${contractId}`).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const contract = responseData?.contract || responseData?.data || responseData;

  // Tasdiqlash sahifasi (`contract-confirm`) bilan bir xil "computed" bloki —
  // shu backend resursi ikkalasida ham ishlatiladi (`ContractDetails.tsx`da
  // `responseData.status_label` allaqachon shu darajada bor ekani tasdiqlangan).
  // Mavjud bo'lmasa (masalan hali yuborilmagan/tasdiqlanmagan shartnoma)
  // shunchaki qo'shimcha sahifa qo'shilmaydi — avvalgidek ishlayveradi.
  const computed = responseData?.computed;

  const buildStatusBlock = (): ContractStatusBlockData | undefined =>
    computed?.show_card && computed.card
      ? {
          orgName: contract?.branch?.legal_name || contract?.branch?.name_uz || '—',
          orgDirector: contract?.branch?.director_name || '—',
          date: computed.card.date,
          studentName: computed.card.name,
          studentPhone: computed.card.phone,
          studentOrg: computed.card.org,
          studentStatus: computed.card.status,
          studentStatusText: computed.card.status_text,
        }
      : undefined;

  const handleDownloadPdf = async () => {
    if (!contract) return;
    setPdfLoading(true);
    try {
      if (contract.contract_type === 'preschool') {
        await printPreschoolContract(contract, { mode: 'pdf' });
        return;
      }
      const templateUrl = getTemplateUrl(contract.contract_type || 'adult');
      const data = buildTemplateData(contract);
      await printFromDocxTemplate(
        templateUrl,
        data,
        contract.contract_number || String(contractId),
        'pdf',
        buildStatusBlock(),
        true,
      );
    } catch (err) {
      console.error('PDF xatosi:', err);
      alert('PDF yaratishda xatolik yuz berdi.');
    } finally {
      setPdfLoading(false);
    }
  };

  const handlePrint = async () => {
    if (!contract) return;
    setPrintLoading(true);
    try {
      if (contract.contract_type === 'preschool') {
        await printPreschoolContract(contract, { mode: 'print' });
        return;
      }
      const templateUrl = getTemplateUrl(contract.contract_type || 'adult');
      const data = buildTemplateData(contract);
      await printFromDocxTemplate(
        templateUrl,
        data,
        contract.contract_number || String(contractId),
        'print',
        buildStatusBlock(),
        true,
      );
    } catch (err) {
      console.error('Print xatosi:', err);
      alert('Chop etishda xatolik yuz berdi.');
    } finally {
      setPrintLoading(false);
    }
  };


  return (
    <div className="cp-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cp-modal-wrapper">
        {/* Action bar */}
        <div className="cp-modal-header">
          <div className="cp-modal-title">
            <i className="fa-solid fa-file-contract"></i>
            {isLoading ? 'Yuklanmoqda...' : `Shartnoma ${contract?.contract_number || ''}`}
          </div>
          <div className="cp-modal-actions">
            <button
              className="cp-btn cp-btn-pdf"
              onClick={handleDownloadPdf}
              disabled={isLoading || pdfLoading || printLoading}
            >
              {pdfLoading ? (
                <i className="fa-solid fa-spinner fa-spin"></i>
              ) : (
                <i className="fa-solid fa-file-pdf"></i>
              )}
              PDF yuklash
            </button>
            <button
              className="cp-btn cp-btn-print"
              onClick={handlePrint}
              disabled={isLoading || pdfLoading || printLoading}
            >
              {printLoading ? (
                <i className="fa-solid fa-spinner fa-spin"></i>
              ) : (
                <i className="fa-solid fa-print"></i>
              )}
              Chop etish
            </button>
            <button className="cp-btn cp-btn-close" onClick={onClose}>
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        {/* A4 preview */}
        <div className="cp-scroll-area">
          {isLoading ? (
            <div className="cp-loading">
              <i className="fa-solid fa-spinner fa-spin"></i>
              <span>Shartnoma yuklanmoqda...</span>
            </div>
          ) : !contract ? (
            <div className="cp-loading">
              <i className="fa-solid fa-circle-exclamation"></i>
              <span>Ma'lumot topilmadi</span>
            </div>
          ) : (
            <ContractA4 contract={contract} statusBlock={buildStatusBlock()} />
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Ekranda ham xuddi PDF/chop etishdagi kabi ko'rinadigan "TASDIQLANGAN"
 * kartalar. Ilgari bu yerda `contractConfirm.css`dagi `.cc-status-card*`
 * (dashboard UI uchun mo'ljallangan, katta) klasslar bilan alohida, o'z
 * holicha qayta yozilgan versiya bo'lgan — natijada shartnoma qog'ozi
 * ustiga notekis, ajralib turadigan, katta kartalar sifatida chiqqan.
 * Endi bu yerda ANIQ o'sha `buildStatusBlockHTML()` (contractPdf.ts) —
 * PDF/chop etishda ishlatiladigan — HTML satri render qilinadi, shu
 * sabab ikkalasi (ekran va PDF) hech qachon farqlanib qolmaydi va
 * o'lchamlari bir xil ixcham holda qoladi.
 */
const StatusBlockCards = ({ block }: { block: ContractStatusBlockData }) => (
  <div dangerouslySetInnerHTML={{ __html: buildStatusBlockHTML(block) }} />
);

/**
 * Ilgari bu yerda qo'lda yozilgan, soddalashtirilgan xulosa (raqamli
 * "1. O'QUVCHI MA'LUMOTLARI" kabi jadvallar) bo'lgan — u haqiqiy shartnoma
 * matnidan (PDF/Word) mustaqil ravishda saqlanardi va vaqt o'tishi bilan
 * undan farqlanib qolishi mumkin edi. Endi "Ko'rish" ekrani PDF/tasdiqlash
 * sahifasi bilan AYNAN bir xil manbadan — `ContractLegalText` + shu bir xil
 * `buildTemplateData()` — chiqadi.
 */
const ContractA4 = ({
  contract,
  statusBlock,
   
}: {
  contract: any;
  statusBlock?: ContractStatusBlockData;
}) => {
  const d = buildTemplateData(contract);
  const contractType: ContractType = contract.contract_type || 'adult';

  return (
    // Sahifa oxirigacha OQ fonni kafolatlaydi — `contractConfirm.css`dan
    // kelgan boshqa (bu yerda ishlatilmaydigan) klasslar bilan aralashib
    // ketmasligi uchun ranglar shu yerda ANIQ qayta belgilanadi.
    <div className="cp-a4" style={{ background: '#fff', color: '#1e293b' }}>
      <ContractLegalText contractType={contractType} data={d} />
      {statusBlock && <StatusBlockCards block={statusBlock} />}
    </div>
  );
};

export default ContractPrintModal;
