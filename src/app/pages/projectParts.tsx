// Parts of the projects screens (S6) that explain what a project is and show its data as pictures (FB1 §4).
import { lazy, ReactNode, Suspense } from 'react';
import { X } from 'lucide-react';
import DatasetThumb from '../../components/thumb/DatasetThumb';
import type { ZarrDataset } from '../api';
import { useLanguage } from '../../i18n';

type Bbox = [number, number, number, number];
// OpenLayers loads only when a project with extents opens.
const ExtentMap = lazy(() => import('./ExtentMap'));

/**
 * What a project is, in three ruled columns: ① make it ② put data in ③ see it together by login id. Each column
 * carries a small piece of the real screen it refers to (the name field, the user's own data pictures, the member
 * row) as a static, muted example tagged "예시": spans only, nothing focusable, hidden from screen readers. The one
 * real control is the `새 프로젝트` button in step 1 (when the page passes it). Shown when there are no projects, and on a
 * first visit until it is folded away.
 */
export function ProjectIntro({ datasets, action, onHide }: { datasets: ZarrDataset[]; action?: ReactNode; onHide?: () => void }) {
  const { t } = useLanguage();
  const samples = datasets.slice(0, 3);
  return (
    <section className="project-intro" aria-labelledby="project-intro-title">
      <div className="project-intro__head">
        <div>
          <h2 id="project-intro-title" className="project-intro__title">{t('projects.intro.title')}</h2>
          <p className="project-intro__text">{t('projects.intro.text')}</p>
        </div>
        {onHide && <button type="button" className="xc-btn xc-btn--quiet xc-btn--sm" onClick={onHide}><X size={14} aria-hidden />{t('projects.intro.hide')}</button>}
      </div>
      <ol className="project-intro__steps" aria-label={t('projects.intro.stepsLabel')}>
        <li>
          <span className="project-intro__num" aria-hidden>1</span>
          <h3>{t('projects.intro.step1Title')}</h3>
          <p>{t('projects.intro.step1Text')}</p>
          {action && <div className="project-intro__action">{action}</div>}
          <div className="project-intro__shot" aria-hidden>
            <span className="shot-tag">{t('projects.intro.example')}</span>
            <span className="shot-field"><span className="shot-label">{t('projects.name')}</span><span className="shot-input">{t('projects.intro.step1Example')}</span></span>
            <span className="shot-btn shot-btn--ink">{t('projects.create')}</span>
          </div>
        </li>
        <li>
          <span className="project-intro__num" aria-hidden>2</span>
          <h3>{t('projects.intro.step2Title')}</h3>
          <p>{t('projects.intro.step2Text')}</p>
          <div className="project-intro__shot project-intro__shot--data" aria-hidden>
            <span className="shot-tag">{t('projects.intro.example')}</span>
            {samples.length ? samples.map((item) => (
              <DatasetThumb key={item.id} dataset={item} size={52} />
            )) : [0, 1, 2].map((index) => <span key={index} className="thumb thumb--empty" style={{ ['--thumb' as string]: '52px' }} />)}
          </div>
        </li>
        <li>
          <span className="project-intro__num" aria-hidden>3</span>
          <h3>{t('projects.intro.step3Title')}</h3>
          <p>{t('projects.intro.step3Text')}</p>
          <div className="project-intro__shot" aria-hidden>
            <span className="shot-tag">{t('projects.intro.example')}</span>
            <span className="shot-field"><span className="shot-label">{t('members.username')}</span><span className="shot-input">{t('projects.intro.step3Example')}</span></span>
            <span className="shot-btn">{t('roles.VIEWER')}</span>
          </div>
        </li>
      </ol>
    </section>
  );
}

/** Every extent of the project's data on one small map: an OSM base and an overprint frame per dataset. */
export function ProjectExtents({ datasets }: { datasets: ZarrDataset[] }) {
  const { t } = useLanguage();
  const boxes = datasets.map((item) => item.bbox).filter((box): box is Bbox => !!box);
  if (!boxes.length) return null;
  const west = Math.min(...boxes.map((box) => box[0]));
  const south = Math.min(...boxes.map((box) => box[1]));
  const east = Math.max(...boxes.map((box) => box[2]));
  const north = Math.max(...boxes.map((box) => box[3]));
  const padX = Math.max((east - west) * 0.25, 0.05);
  const padY = Math.max((north - south) * 0.25, 0.05);
  const frame = { w: west - padX, e: east + padX, s: south - padY, n: north + padY };
  const width = 480;
  const height = 200;
  const x = (lon: number) => ((lon - frame.w) / (frame.e - frame.w)) * width;
  const y = (lat: number) => ((frame.n - lat) / (frame.n - frame.s)) * height;
  const label = t('projects.extentsLabel', { count: boxes.length });
  const sketch = (
    <svg className="bbox-map project-extents__sketch" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <g className="grid">
        {[0.25, 0.5, 0.75].map((ratio) => <line key={`v${ratio}`} x1={width * ratio} y1={0} x2={width * ratio} y2={height} vectorEffect="non-scaling-stroke" />)}
        {[0.25, 0.5, 0.75].map((ratio) => <line key={`h${ratio}`} x1={0} y1={height * ratio} x2={width} y2={height * ratio} vectorEffect="non-scaling-stroke" />)}
      </g>
      {boxes.map((box, index) => (
        <rect key={index} className="area" x={x(box[0])} y={y(box[3])} width={Math.max(2, x(box[2]) - x(box[0]))} height={Math.max(2, y(box[1]) - y(box[3]))} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
  return (
    <figure className="project-extents">
      <Suspense fallback={sketch}><ExtentMap bboxes={boxes} label={label} fallback={sketch} className="extent-map--wide" /></Suspense>
      <figcaption className="xc-hint">{label}</figcaption>
    </figure>
  );
}
