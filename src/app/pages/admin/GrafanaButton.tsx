import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { openGrafana } from '../../../api/adminApi';
import { Button } from '../../../components/ui';
import { useLanguage } from '../../../i18n';

/** Opens Grafana through a one-time ticket (MON2); a failed ticket shows a short reason next to the button. */
export default function GrafanaButton({ href, label }: { href: string; label: string }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const open = async () => {
    setBusy(true); setFailed(false);
    try { await openGrafana(href); } catch { setFailed(true); } finally { setBusy(false); }
  };
  return (
    <>
      <Button variant="line" size="sm" onClick={open} disabled={busy} aria-busy={busy || undefined}>
        {label}<ExternalLink size={13} aria-hidden /><span className="sr-only">{t('shell.newTab')}</span>
      </Button>
      {failed && <span className="xc-hint" role="alert"> {t('admin.system.grafanaFailed')}</span>}
    </>
  );
}
