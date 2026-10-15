// S13 시스템 tab: service readiness and restarts, map servers (personal pods), node memory and data disk as ruled
// meters with words, the public address when one is set, and Grafana (ADM3) when its address is configured.
import { ExternalLink, RefreshCw } from 'lucide-react';
import { Alert, Button, ButtonAnchor } from '../../../components/ui';
import { Badge, Skeleton } from '../../../components/ui/kit';
import { formatDate, formatNumber, useLanguage } from '../../../i18n';
import { GRAFANA_URL } from '../../../api/adminApi';
import { admin, AdminSystem, formatDateTime } from '../../api';
import { formatBytes } from '../../fusion';
import { useLoad } from '../../useLoad';
import { NoValue } from '../DataLibraryPage';
import { ListError } from './DataTab';
import { Directory, Meter, ownerLabel } from './shared';

const STAMP: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' };

/** 준비됨 · 준비 안 됨 · 알 수 없음, in words. */
function ReadyBadge({ ready }: { ready: boolean | null }) {
  const { t } = useLanguage();
  if (ready === true) return <Badge tone="success">{t('admin.system.ready')}</Badge>;
  if (ready === false) return <Badge tone="danger">{t('admin.system.notReady')}</Badge>;
  return <Badge>{t('admin.unknown')}</Badge>;
}

export default function SystemTab({ directory }: { directory: Directory }) {
  const { lang, t } = useLanguage();
  const system = useLoad<{ data: AdminSystem; at: Date }>(() => admin.system().then((data) => ({ data, at: new Date() })));
  const data = system.data?.data;
  const cpu = data?.node?.cpuMilli;
  return (
    <div className="admin-system">
      <div className="toolbar admin-system__bar">
        <span className="xc-hint tabular" aria-live="polite">{system.data ? t('admin.system.at', { time: formatDate(system.data.at, STAMP, lang) }) : ''}</span>
        <span className="toolbar__spacer" />
        <Button variant="line" size="sm" onClick={system.reload} disabled={system.loading}><RefreshCw size={14} aria-hidden />{t('admin.refresh')}</Button>
      </div>
      {system.loading && !data ? <Skeleton lines={5} label={t('admin.system.loading')} />
        : system.error && !data ? <ListError text={t('admin.system.failed', { error: system.error })} onRetry={system.reload} />
          : data ? (
            <div className="admin-system__body">
              <section className="admin-block" aria-labelledby="admin-resources">
                <h3 id="admin-resources" className="admin-block__title">{t('admin.system.resources')}</h3>
                <div className="admin-meters">
                  <Meter label={t('admin.system.memory')} used={data.node?.memoryUsedBytes} total={data.node?.memoryTotalBytes} />
                  <Meter label={t('admin.system.disk')} used={data.disk?.dataUsedBytes} total={data.disk?.dataTotalBytes} />
                </div>
                <p className="xc-hint">{cpu != null ? t('admin.system.cpu', { cores: formatNumber(cpu / 1000, { maximumFractionDigits: 2 }, lang), milli: formatNumber(cpu, {}, lang) }) : t('admin.system.cpuUnknown')}</p>
              </section>

              <section className="admin-block" aria-labelledby="admin-services">
                <h3 id="admin-services" className="admin-block__title">{t('admin.system.services')}</h3>
                {!data.services.length ? <p className="admin-block__empty">{t('admin.system.noServices')}</p> : (
                  <table className="xc-table xc-table--cards admin-table">
                    <thead><tr><th scope="col">{t('admin.system.service')}</th><th scope="col">{t('app.status')}</th><th scope="col" className="num">{t('admin.system.restarts')}</th><th scope="col">{t('admin.system.started')}</th></tr></thead>
                    <tbody>
                      {data.services.map((service) => (
                        <tr key={service.name}>
                          <td className="cell-main"><strong className="admin-mono">{service.name}</strong></td>
                          <td data-label={t('app.status')}><ReadyBadge ready={service.ready} /></td>
                          <td className="num" data-label={t('admin.system.restarts')}>{service.restarts != null ? <span className={service.restarts > 0 ? 'admin-warn-number' : undefined}>{formatNumber(service.restarts, {}, lang)}</span> : <NoValue label={t('admin.unknown')} />}</td>
                          <td className="date" data-label={t('admin.system.started')}>{service.startedAt ? formatDateTime(service.startedAt, lang) : <NoValue label={t('admin.unknown')} />}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              <section className="admin-block" aria-labelledby="admin-pods">
                <h3 id="admin-pods" className="admin-block__title">{t('admin.system.pods')}</h3>
                {!data.xcubePods.length ? <p className="admin-block__empty">{t('admin.system.noPods')}</p> : (
                  <table className="xc-table xc-table--cards admin-table">
                    <thead><tr><th scope="col">{t('admin.system.pod')}</th><th scope="col">{t('admin.system.podUser')}</th><th scope="col">{t('app.status')}</th><th scope="col" className="num">{t('admin.system.podMemory')}</th></tr></thead>
                    <tbody>
                      {data.xcubePods.map((pod) => (
                        <tr key={pod.name}>
                          <td className="cell-main"><strong className="admin-mono">{pod.name}</strong></td>
                          <td data-label={t('admin.system.podUser')}>{pod.userId ? ownerLabel(directory, pod.userId, null, t) : t('admin.system.mainServer')}</td>
                          <td data-label={t('app.status')}><span className="admin-pod-state"><ReadyBadge ready={pod.ready} />{pod.phase && <small className="xc-hint">{pod.phase}</small>}</span></td>
                          <td className="num" data-label={t('admin.system.podMemory')}>{pod.memoryBytes != null ? formatBytes(pod.memoryBytes) : <NoValue label={t('admin.unknown')} />}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              <section className="admin-block" aria-labelledby="admin-links">
                <h3 id="admin-links" className="admin-block__title">{t('admin.system.links')}</h3>
                <dl className="meta-list meta-list--flush">
                  <dt>{t('admin.system.publicUrl')}</dt>
                  <dd>{data.publicUrl ? <a href={data.publicUrl} target="_blank" rel="noopener noreferrer">{data.publicUrl}<span className="sr-only">{t('shell.newTab')}</span></a> : <span className="no-value">{t('admin.system.noPublicUrl')}</span>}</dd>
                  <dt>{t('admin.system.monitoring')}</dt>
                  <dd>
                    {GRAFANA_URL ? (
                      <ButtonAnchor variant="line" size="sm" href={GRAFANA_URL} target="_blank" rel="noopener noreferrer">{t('admin.system.openGrafana')}<ExternalLink size={13} aria-hidden /><span className="sr-only">{t('shell.newTab')}</span></ButtonAnchor>
                    ) : <span className="no-value">{t('admin.system.noGrafana')}</span>}
                  </dd>
                </dl>
              </section>
              {system.error && <Alert tone="warning">{t('admin.system.stale', { error: system.error })}</Alert>}
            </div>
          ) : null}
    </div>
  );
}
