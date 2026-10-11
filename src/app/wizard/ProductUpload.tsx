// Satellite products in the add-data wizard (UR-55, UPL2): the "원본 입력" step (type, where to get it, several
// files with upload progress and cancel per file — packages, or loose band files checked one by one) and the
// "자동 검사 결과" step (one row per product: loose files of one scene/date merged, then the bands). Visual images
// (True color …) are checked by the server and listed as skipped with its reason. The upload list lives in the
// wizard (`useProductUploads`) so it survives moving between steps.
import { AlertCircle, CheckCircle2, Loader2, MinusCircle, UploadCloud } from 'lucide-react';
import { ChangeEvent, DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import { isAbortError, ProductInfo, SpatialInspection } from '../../api/generationApi';
import { userMessage } from '../../api/httpClient';
import { Button } from '../../components/ui';
import { Badge } from '../../components/ui/kit';
import { formatDate, formatNumber, serverText, useLanguage } from '../../i18n';
import type { Lang, TFunction, TKey } from '../../i18n';
import '../../i18n/wizard';
import { generation } from '../api';
import { BBoxMap } from '../pages/DatasetDetailPage';
import { ACCEPT, clientProblem, ClientProblem, isLoose, layoutOf, layoutsClash, partialBands, PRODUCT_KINDS, PRODUCT_SENSOR, ProductKind, productBands, productDate, unionBounds } from './productModel';
import UploadMeter, { UploadTrack } from './UploadMeter';

/** `skipped`: checked, but nothing to analyse in it (a visual image such as True color); the server says why. */
export type ProductState = 'uploading' | 'inspecting' | 'done' | 'skipped' | 'failed' | 'cancelled';
export type ProductItem = UploadTrack & {
  id: string; file: File; state: ProductState; inspection?: SpatialInspection;
  /** A server error (worded at render) or a problem seen before uploading. */
  failure?: { cause: unknown } | ClientProblem | { duplicate: true };
};

let nextId = 0;
const sameFile = (a: File, b: File) => a.name === b.name && a.size === b.size;
const live = (item: ProductItem) => item.state !== 'failed' && item.state !== 'cancelled' && item.state !== 'skipped';
/** The products of one check (UPL2 loose uploads may answer several, or one with no band). */
const checked = (inspection: SpatialInspection) => inspection.products ?? (inspection.product ? [inspection.product] : []);
const usable = (inspection: SpatialInspection) => checked(inspection).some((product) => product.bands.length > 0);

/** The product uploads of one wizard: add, cancel (aborts the upload), remove, clear. Aborts everything on unmount. */
export function useProductUploads(kind: ProductKind) {
  const [items, setItems] = useState<ProductItem[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const controllers = useRef(new Map<string, AbortController>());
  useEffect(() => {
    const running = controllers.current;
    return () => running.forEach((controller) => controller.abort());
  }, []);
  const patch = (id: string, change: Partial<ProductItem>) => setItems((list) => list.map((item) => (item.id === id ? { ...item, ...change } : item)));

  const start = (item: ProductItem) => {
    const controller = new AbortController();
    controllers.current.set(item.id, controller);
    generation.inspect(kind, item.file, {
      signal: controller.signal,
      onProgress: ({ loaded, total }) => patch(item.id, { loaded, total, state: total > 0 && loaded >= total ? 'inspecting' : 'uploading' }),
    }).then((inspection) => {
      // A package of the other sensor slipped past the name check: same message as the server's.
      const sensor = inspection.product?.sensor;
      const layout = inspection.product ? layoutOf(inspection.product) : 'package';
      const others = itemsRef.current.filter((other) => other.id !== item.id && other.state === 'done' && other.inspection?.product);
      if (sensor && sensor !== PRODUCT_SENSOR[kind]) patch(item.id, { state: 'failed', failure: { code: 'PRODUCT_SENSOR_MIXED' }, inspection: undefined });
      else if (!usable(inspection)) patch(item.id, { state: 'skipped', inspection, loaded: item.total, failure: undefined });
      // Browser exports (reflectance) next to DN products: refused here, the server would refuse the job.
      else if (others.some((other) => layoutsClash(layoutOf(other.inspection!.product!), layout))) patch(item.id, { state: 'failed', failure: { code: 'PRODUCT_LAYOUT_MIXED' }, inspection: undefined });
      else patch(item.id, { state: 'done', inspection, loaded: item.total, failure: undefined });
    }).catch((cause) => {
      patch(item.id, isAbortError(cause) ? { state: 'cancelled' } : { state: 'failed', failure: { cause } });
    }).finally(() => controllers.current.delete(item.id));
  };

  const add = (files: File[]) => {
    const added: ProductItem[] = [];
    for (const file of files) {
      const current = [...itemsRef.current, ...added];
      const base: ProductItem = { id: `product-${++nextId}`, file, state: 'uploading', loaded: 0, total: file.size, startedAt: Date.now() };
      if (current.some((item) => live(item) && sameFile(item.file, file))) { added.push({ ...base, state: 'failed', failure: { duplicate: true } }); continue; }
      const problem = clientProblem(kind, file.name, current.some(live));
      added.push(problem ? { ...base, state: 'failed', failure: problem } : base);
    }
    setItems((list) => [...list, ...added]);
    added.filter((item) => item.state === 'uploading').forEach(start);
  };
  const cancel = (id: string) => controllers.current.get(id)?.abort();
  const remove = (id: string) => { cancel(id); setItems((list) => list.filter((item) => item.id !== id)); };
  const clear = useCallback(() => { controllers.current.forEach((controller) => controller.abort()); setItems([]); }, []);
  return { items, add, cancel, remove, clear };
}
export type ProductUploads = ReturnType<typeof useProductUploads>;

export const doneProducts = (items: ProductItem[]) => items.filter((item) => item.state === 'done' && item.inspection);
/** The server's reasons for every skipped file (visual images), for the inspection step. */
export const skippedTexts = (items: ProductItem[], lang: Lang) =>
  Array.from(new Set(items.filter((item) => item.state === 'done' || item.state === 'skipped').flatMap((item) => warningTexts(item.inspection, lang))));
export const busyProducts = (items: ProductItem[]) => items.some((item) => item.state === 'uploading' || item.state === 'inspecting');

/** What a checked loose file holds: "2022-06-01 · Copernicus Browser export · blue ← B02". Packages: the server's sentence. */
function checkedText(inspection: SpatialInspection, lang: Lang, t: TFunction) {
  const products = checked(inspection).filter((product) => product.bands.length > 0);
  if (!products.length || !products.every(isLoose)) return serverText({ code: inspection.messageCode, params: inspection.messageParams, message: inspection.message }, lang);
  const dates = Array.from(new Set(products.map((product) => productDate(product)))).sort();
  const bands = products.flatMap((product) => product.bands.map((band) => t('wizard.product.bandLineShort', { name: band.name, source: band.source })));
  return [dates.join(', '), t(`wizard.product.layout.${layoutOf(products[0])}` as TKey), Array.from(new Set(bands)).join(', ')].join(' · ');
}
/** The server's warnings of a check (PRODUCT_VISUAL_SKIPPED {files}), in the screen language. */
const warningTexts = (inspection: SpatialInspection | undefined, lang: Lang) =>
  (inspection?.warningItems ?? (inspection?.warnings ?? []).map((message) => ({ message }))).map((item) => serverText(item, lang));

function failureText(failure: ProductItem['failure'], lang: Lang, duplicate: string) {
  if (!failure) return '';
  if ('duplicate' in failure) return duplicate;
  if ('code' in failure) return serverText({ code: failure.code }, lang);
  return userMessage(failure.cause, lang);
}

/** "원본 입력": the product type, where to get it, the drop zone and the list with progress and cancel. */
export function ProductSource({ kind, onKind, uploads, error }: { kind: ProductKind; onKind: (kind: ProductKind) => void; uploads: ProductUploads; error?: string }) {
  const { lang, t } = useLanguage();
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const take = (list?: FileList | null) => { if (list?.length) uploads.add(Array.from(list)); };
  const onDrop = (event: DragEvent) => { event.preventDefault(); setOver(false); take(event.dataTransfer.files); };
  const label = (item: ProductKind) => t(item === 'sentinel2' ? 'wizard.product.s2' : 'wizard.product.landsat');
  const { items } = uploads;
  return (
    <div className="wizard-section">
      <div className="xc-field">
        <span className="xc-label" id="product-kind">{t('wizard.product.kind')}</span>
        <div className="segmented" role="group" aria-labelledby="product-kind">
          {PRODUCT_KINDS.map((item) => (
            <button key={item} type="button" aria-pressed={kind === item} onClick={() => { if (item !== kind) onKind(item); }}>
              {label(item)} <span className="segmented__note">{t(item === 'sentinel2' ? 'wizard.product.s2Files' : 'wizard.product.landsatFiles')}</span>
            </button>
          ))}
        </div>
        {items.length > 0 && <span className="xc-hint">{t('wizard.product.kindChanged')}</span>}
      </div>
      <p className="product-where"><strong>{t('wizard.product.where')}</strong> {t(kind === 'sentinel2' ? 'wizard.product.whereS2' : 'wizard.product.whereLandsat')}</p>
      <div className="wizard-group" data-invalid={error ? true : undefined}>
        <div className={`file-drop ${over ? 'is-over' : ''}`} onDragOver={(event) => { event.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
          <span className="file-drop__icon" aria-hidden><UploadCloud size={24} /></span>
          <strong>{t('wizard.product.drop')}</strong>
          <small>{t('wizard.product.dropHint')}</small>
          <input ref={inputRef} type="file" multiple accept={ACCEPT[kind]} hidden aria-label={t('wizard.product.choose')}
            onChange={(event: ChangeEvent<HTMLInputElement>) => { take(event.target.files); event.target.value = ''; }} />
          <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>{t(items.length ? 'wizard.product.chooseMore' : 'wizard.product.choose')}</Button>
        </div>
        {error && <p className="xc-field__error" id="wizard-error-file">{error}</p>}
      </div>
      {items.length > 0 && (
        <ul className="product-list" aria-label={t('wizard.product.list')}>
          {items.map((item) => {
            const running = item.state === 'uploading' || item.state === 'inspecting';
            const problem = failureText(item.failure, lang, t('wizard.product.duplicate'));
            return (
              <li key={item.id} className={`product-row is-${item.state}`}>
                <div className="product-row__head">
                  <span className="product-row__icon" aria-hidden>
                    {running ? <Loader2 size={16} className="spin" /> : item.state === 'done' ? <CheckCircle2 size={16} /> : item.state === 'skipped' ? <MinusCircle size={16} /> : <AlertCircle size={16} />}
                  </span>
                  <span className="product-row__name">{item.file.name}</span>
                  <Badge tone={item.state === 'done' ? 'success' : item.state === 'failed' ? 'danger' : 'neutral'}>{t(`wizard.product.state.${item.state}` as TKey)}</Badge>
                  {!running && (
                    <button type="button" className="xc-btn xc-btn--ghost xc-btn--sm" onClick={() => uploads.remove(item.id)} aria-label={t('wizard.product.removeNamed', { name: item.file.name })}>{t('wizard.product.remove')}</button>
                  )}
                </div>
                {running && <UploadMeter name={item.file.name} track={item} checking={item.state === 'inspecting'} onCancel={() => uploads.cancel(item.id)} />}
                {item.state === 'done' && item.inspection && <p className="xc-hint">{checkedText(item.inspection, lang, t)}</p>}
                {(item.state === 'done' || item.state === 'skipped') && warningTexts(item.inspection, lang).map((text) => <p key={text} className="xc-hint product-row__skip">{text}</p>)}
                {item.state === 'cancelled' && <p className="xc-hint">{t('wizard.upload.cancelled')}</p>}
                {problem && <p className="xc-field__error" role="alert">{problem}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Acquisition time in the screen language (local time): ko "2024. 8. 14. 11:15", en "Aug 14, 2024, 11:15". */
const acquiredText = (value: string, lang: Lang) => formatDate(value, { year: 'numeric', month: lang === 'ko' ? 'numeric' : 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, lang);

/** A date known only from a file name (00:00 UTC): the UTC date, with no time. */
const dayText = (value: string, lang: Lang) => formatDate(value, { year: 'numeric', month: lang === 'ko' ? 'numeric' : 'short', day: 'numeric', timeZone: 'UTC' }, lang);

/** "자동 검사 결과" of satellite products: one row per product (loose files merged per scene/date), notes, skipped files, the extent and the bands. */
export function ProductInspection({ kind, products, skipped = [] }: { kind: ProductKind; products: ProductInfo[]; skipped?: string[] }) {
  const { lang, t } = useLanguage();
  const bounds = unionBounds(products);
  const bands = productBands(products);
  const partial = partialBands(products);
  const sorted = [...products].sort((a, b) => a.acquiredAt.localeCompare(b.acquiredAt));
  const dateCount = (date: string) => products.filter((product) => productDate(product) === date).length;
  const s2 = kind === 'sentinel2';
  return (
    <div className="wizard-section">
      <div className="xc-table-wrap">
        <table className="xc-table product-table" aria-label={t('wizard.product.table')}>
          <thead>
            <tr>
              <th scope="col">{t('wizard.product.acquired')}</th>
              <th scope="col">{t('wizard.product.platform')}</th>
              <th scope="col">{t(s2 ? 'wizard.product.tile' : 'wizard.product.pathRow')}</th>
              <th scope="col" className="num">{t('wizard.product.cloud')}</th>
              {s2 && <th scope="col">{t('wizard.product.baseline')}</th>}
              <th scope="col">{t('wizard.product.note')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((product) => {
              const notes = [
                ...(isLoose(product) ? [t(`wizard.product.layoutNote.${layoutOf(product)}` as TKey, { count: product.bands.length })] : []),
                ...(product.timePrecision === 'day' ? [t('wizard.product.dayOnly')] : []),
                ...(product.boaAddOffset === -1000 ? [t('wizard.product.offsetNote')] : []),
                ...(dateCount(productDate(product)) > 1 ? [t('wizard.product.sameDate')] : []),
              ];
              return (
                <tr key={`${layoutOf(product)}:${product.productId}:${product.acquiredAt}`}>
                  <td className="date">{product.timePrecision === 'day' ? dayText(product.acquiredAt, lang) : acquiredText(product.acquiredAt, lang)}</td>
                  <td>{product.platform ?? '—'}</td>
                  <td className="tabular">{product.tile ?? product.pathRow ?? '—'}</td>
                  <td className="num">{product.cloudCover == null ? '—' : `${formatNumber(product.cloudCover, { maximumFractionDigits: 1 }, lang)}%`}</td>
                  {s2 && <td className="tabular">{product.processingBaseline ?? '—'}</td>}
                  <td className="product-table__note">{notes.length ? notes.join(' · ') : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {skipped.length > 0 && (
        <div className="product-skipped" role="note">
          <strong>{t('wizard.product.skippedTitle')}</strong>
          <ul aria-label={t('wizard.product.skippedTitle')}>{skipped.map((text) => <li key={text}>{text}</li>)}</ul>
        </div>
      )}
      <div className="inspect-grid">
        {bounds ? <BBoxMap bbox={[bounds.west, bounds.south, bounds.east, bounds.north]} /> : <div className="xc-hint inspect-grid__empty">{t('wizard.inspect.noBounds')}</div>}
        <dl className="meta-list">
          <dt>{t('wizard.product.extent')}</dt>
          <dd className="tabular">{bounds ? `${bounds.west.toFixed(4)}, ${bounds.south.toFixed(4)} → ${bounds.east.toFixed(4)}, ${bounds.north.toFixed(4)}` : '—'}</dd>
          <dt>{t('wizard.inspect.crs')}</dt><dd>{t('wizard.inspect.crsConverted')}</dd>
          <dt>{t('wizard.product.bands')}</dt>
          <dd>
            <ul className="summary-vars" aria-label={t('wizard.product.bands')}>
              {bands.map((band) => (
                <li key={band.source} className="tabular">
                  {t('wizard.product.bandLine', { name: band.name, source: band.source, resolution: band.resolution })}
                  {band.kind === 'categorical' && <span className="xc-hint"> · {t('wizard.product.categorical')}</span>}
                </li>
              ))}
            </ul>
            {partial.length > 0 && <p className="xc-hint">{t('wizard.product.partialBands', { bands: partial.join(', ') })}</p>}
          </dd>
        </dl>
      </div>
    </div>
  );
}
