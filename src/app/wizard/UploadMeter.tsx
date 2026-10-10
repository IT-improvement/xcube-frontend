// Upload progress of one file (audit W9): a bar, "45% · 120 MB / 800 MB · 약 2분 남음", and a cancel button.
// Used by every file upload of the wizard (GeoTIFF/CAS500, Shapefile, satellite products).
import { X } from 'lucide-react';
import { formatBytes } from '../fusion';
import { useLanguage } from '../../i18n';
import type { TFunction } from '../../i18n';
import '../../i18n/wizard';

export type UploadTrack = { loaded: number; total: number; startedAt: number };

/** Seconds left at the average rate so far; null until a second of data is in. */
export function secondsLeft(track: UploadTrack, now = Date.now()): number | null {
  const elapsed = (now - track.startedAt) / 1000;
  if (elapsed < 1 || track.loaded <= 0 || track.total <= track.loaded) return null;
  return Math.ceil((track.total - track.loaded) / (track.loaded / elapsed));
}
export const timeText = (seconds: number, t: TFunction) =>
  seconds < 60 ? t('wizard.upload.seconds', { n: Math.max(1, seconds) }) : t('wizard.upload.minutes', { n: Math.ceil(seconds / 60) });
export const percentOf = (track: UploadTrack) => (track.total > 0 ? Math.min(100, Math.floor((track.loaded / track.total) * 100)) : 0);

export default function UploadMeter({ name, track, checking, onCancel }: { name: string; track: UploadTrack; checking: boolean; onCancel?: () => void }) {
  const { t } = useLanguage();
  const percent = checking ? 100 : percentOf(track);
  const left = checking ? null : secondsLeft(track);
  const parts = checking
    ? [t('wizard.upload.checking')]
    : [`${percent}%`, t('wizard.upload.sent', { loaded: formatBytes(track.loaded), total: formatBytes(track.total) }), ...(left != null ? [t('wizard.upload.left', { time: timeText(left, t) })] : [])];
  return (
    <div className="upload-meter">
      <progress className="wizard-progress" max={100} value={percent} aria-label={t('wizard.upload.progressLabel', { name })} />
      <span className="upload-meter__line">
        <span className="xc-hint tabular">{parts.join(' · ')}</span>
        {onCancel && (
          <button type="button" className="xc-btn xc-btn--ghost xc-btn--sm" onClick={onCancel} aria-label={t('wizard.upload.cancelNamed', { name })}>
            <X size={14} aria-hidden />{t('wizard.upload.cancel')}
          </button>
        )}
      </span>
    </div>
  );
}
