import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API } from '../../api/api';
import useAuthStore from '../../store/useAuthStore';
import { formatDate } from '@/utils/date';
import './studentProfile.css';

interface StudentData {
  id: number;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  gender?: string;
  birth_date?: string;
  passport_series?: string;
  pinfl?: string;
  phone?: string;
  address?: string;
  balance?: number;
  status?: string;
  photo?: string | null;
  photo_url?: string | null;
  image?: string | null;
}

const TABS = [
  "Vakil(ota-ona)",
  "Buyurtmachi",
  "Kurslarim",
  "Vazifalar",
  "Davomat va baho",
  "Imtihon va testlar",
  "Serfikatlar",
];

// Render ichida e'lon qilinsa React uni har safar "yangi" komponent deb
// hisoblab ichki holatini tiklaydi (`react-hooks/static-components`) —
// shuning uchun tashqarida (employee.tsx dagi kabi).
const InfoRow = ({
  label,
  value,
  blue,
}: {
  label: string;
  value?: string | null;
  blue?: boolean;
}) => (
  <div className="sp-info-row">
    <span className="sp-info-key">{label}</span>
    <span className={`sp-info-val${blue ? ' sp-info-val-blue' : ''}`}>{value || '-'}</span>
  </div>
);

const StudentProfilePage = () => {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState(0);
  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: profile } = useQuery<StudentData>({
    queryKey: ['student-profile', user?.id],
    queryFn: () => API.get(`/students/${user?.id}`).then((r) => r.data),
    enabled: !!user?.id,
  });

  const uploadMutation = useMutation({
    mutationFn: (formData: FormData) =>
      API.post(`/students/${user?.id}/photo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).catch(() =>
        API.put(`/students/${user?.id}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-profile', user?.id] });
      closeCamera();
    },
  });

  const openCamera = async () => {
    setCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch {
      setCameraOpen(false);
      fileInputRef.current?.click();
    }
  };

  const closeCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOpen(false);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const fd = new FormData();
        fd.append('photo', blob, 'photo.jpg');
        uploadMutation.mutate(fd);
      },
      'image/jpeg',
      0.9,
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('photo', file);
    uploadMutation.mutate(fd);
    e.target.value = '';
  };

  const photoUrl = profile?.photo_url || profile?.photo || profile?.image;

  const fullName =
    profile?.full_name ||
    [profile?.last_name, profile?.first_name, profile?.middle_name]
      .filter(Boolean)
      .join(' ') ||
    '-';

  const formatBalance = (v?: number) =>
    v != null ? `${v.toLocaleString('ru-RU')} SO'M` : "0 SO'M";

  return (
    <div className="sp-page container">
      {/* Header */}
      <div className="sp-header-card">
        <div className="sp-photo-wrap" onClick={openCamera} title="Rasmni o'zgartirish">
          {photoUrl ? (
            <img src={photoUrl} alt="profile" className="sp-photo-img" />
          ) : (
            <span className="sp-photo-plus">+</span>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        <div className="sp-info-area">
          <div className="sp-info-section-label">Shaxsiy ma'lumotlar</div>
          <div className="sp-info-grid">
            <InfoRow label="F.I.SH" value={fullName} blue />
            <InfoRow label="JINSI" value={profile?.gender} />
            <InfoRow
              label="TUG'ILGAN SANASI"
              value={profile?.birth_date ? formatDate(profile.birth_date, '-') : undefined}
            />
            <InfoRow label="PASSPORT SERIYA VA RAQAM" value={profile?.passport_series} blue />
            <InfoRow label="PINFL" value={profile?.pinfl} />
            <InfoRow label="TELEFON NOMER" value={profile?.phone} />
            <div className="sp-info-row sp-info-col-full">
              <span className="sp-info-key">YASASH MANZILI/RO'YXATDAN O'TGAN MANZIL</span>
              <span className="sp-info-val">{profile?.address || '-'}</span>
            </div>
          </div>

          <div className="sp-badges">
            <span className="sp-badge-balance">
              BALANS&nbsp;&nbsp;{formatBalance(profile?.balance)}
            </span>
            <span className="sp-badge-status">
              STATUS
              <span className="sp-badge-status-dot" />
              {profile?.status === 'active' ? 'Aktiv' : profile?.status || '-'}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="sp-tabs-bar">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            className={`sp-tab-btn${activeTab === i ? ' active' : ''}`}
            onClick={() => setActiveTab(i)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="sp-tab-content">
        {activeTab === 0 ? (
          <>
            <div className="sp-tab-section-title">Shaxsiy ma'lumotlar</div>
            <div className="sp-tab-info-grid">
              <InfoRow label="F.I.SH" value={fullName} blue />
              <InfoRow label="JINSI" value={profile?.gender} />
              <InfoRow
              label="TUG'ILGAN SANASI"
              value={profile?.birth_date ? formatDate(profile.birth_date, '-') : undefined}
            />
              <InfoRow label="PASSPORT SERIYA VA RAQAM" value={profile?.passport_series} blue />
              <InfoRow label="PINFL" value={profile?.pinfl} />
              <InfoRow label="TELEFON NOMER" value={profile?.phone} />
              <div className="sp-info-row sp-tab-info-full">
                <span className="sp-info-key">YASASH MANZILI/RO'YXATDAN O'TGAN MANZIL</span>
                <span className="sp-info-val">{profile?.address || '-'}</span>
              </div>
            </div>
          </>
        ) : (
          <div className="sp-tab-empty">Bu bo'lim hali ishlab chiqilmoqda</div>
        )}
      </div>

      {/* Camera Modal */}
      {cameraOpen && (
        <div className="sp-camera-overlay" onClick={closeCamera}>
          <div className="sp-camera-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sp-camera-heading">Rasm olish</div>
            <video
              ref={videoRef}
              className="sp-camera-video"
              autoPlay
              playsInline
              muted
            />
            <canvas ref={canvasRef} className="sp-hidden" />
            <div className="sp-camera-actions">
              <button
                className="sp-camera-snap"
                onClick={capturePhoto}
                disabled={uploadMutation.isPending}
              >
                {uploadMutation.isPending ? 'Yuklanmoqda...' : '📸 Rasm olish'}
              </button>
              <button className="sp-camera-cancel" onClick={closeCamera}>
                Bekor qilish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentProfilePage;
