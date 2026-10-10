// Pick only the bands/attributes you need, then set a colour bar and display
// range for each (FR-GEN-10·11). The range is pre-filled from the inspection's
// 2–98 percentile and can be edited or reset to the automatic value.
import { CheckSquare, Plus, RotateCcw, Square } from 'lucide-react';
import { useState } from 'react';
import { ColorBarOption, InspectionField, ValueStats, VariableSpec } from '../../api/generationApi';
import { Badge } from '../../components/ui/kit';
import { formatNumber, getLanguage, translate, useLanguage } from '../../i18n';
import type { Lang } from '../../i18n';
import '../../i18n/wizard';
import { PRESET_STYLE } from './sarModel';

export type VariableChoice = {
  source: string;
  name: string;
  kind: 'continuous' | 'categorical';
  colorBar: string;
  min: string;
  max: string;
  /** Where the display values came from when not from the file statistics: the water preset (UR-41). Not sent. */
  origin?: 'preset';
};


export function autoRange(stats?: ValueStats): { min: number; max: number } | null {
  if (!stats) return null;
  const min = stats.p2 ?? stats.min;
  const max = stats.p98 ?? stats.max;
  return Number.isFinite(min) && Number.isFinite(max) && min < max ? { min, max } : null;
}

// Thousands separators only from 10,000 so years and small codes read naturally (2016, not 2,016).
const formatValue = (value: number, lang: Lang) => (Math.abs(value) >= 10000 ? formatNumber(value, { maximumFractionDigits: 1 }, lang) : String(Number(value.toPrecision(Math.abs(value) >= 1000 ? 6 : 4))));

export function defaultChoice(field: InspectionField, colorBars: ColorBarOption[]): VariableChoice {
  const range = autoRange(field.approxStats);
  const categorical = field.type === 'string';
  const colorBar = colorBars.find((item) => item.id === (categorical ? 'tab10' : 'viridis'))?.id ?? colorBars[0]?.id ?? '';
  return { source: field.name, name: field.name, kind: categorical ? 'categorical' : 'continuous', colorBar, min: range ? String(range.min) : '', max: range ? String(range.max) : '' };
}

/** Problems that block submission, keyed by source name. */
export function validateChoices(choices: VariableChoice[], colorBars: ColorBarOption[], lang: Lang = getLanguage()) {
  const say = (key: 'name' | 'duplicate' | 'colorBar' | 'range' | 'order') => translate(lang, `wizard.style.errors.${key}`);
  const errors: Record<string, string> = {};
  const names = new Set<string>();
  for (const choice of choices) {
    if (!choice.name.trim()) errors[choice.source] = say('name');
    else if (names.has(choice.name.trim())) errors[choice.source] = say('duplicate');
    else if (colorBars.length && !colorBars.some((item) => item.id === choice.colorBar)) errors[choice.source] = say('colorBar');
    else if (choice.kind === 'continuous') {
      const min = Number(choice.min);
      const max = Number(choice.max);
      if (choice.min === '' || choice.max === '' || !Number.isFinite(min) || !Number.isFinite(max)) errors[choice.source] = say('range');
      else if (min >= max) errors[choice.source] = say('order');
    }
    names.add(choice.name.trim());
  }
  return errors;
}

export function toVariableSpecs(choices: VariableChoice[]): VariableSpec[] {
  return choices.map((choice) => ({
    source: choice.source,
    name: choice.name.trim(),
    kind: choice.kind,
    style: { colorBar: choice.colorBar, ...(choice.kind === 'continuous' ? { min: Number(choice.min), max: Number(choice.max) } : {}) },
  }));
}

function ColorBarField({ value, options, onChange, label }: { value: string; options: ColorBarOption[]; onChange: (value: string) => void; label: string }) {
  const { t } = useLanguage();
  const other = t('wizard.style.otherCategory');
  const selected = options.find((item) => item.id === value);
  const categories = Array.from(new Set(options.map((item) => item.category || other)));
  return (
    <label className="vse-colorbar">
      <span className="xc-label">{t('wizard.style.colorBar')}</span>
      <span className="vse-colorbar__control">
        {/* The server's preview only; without one the swatch stays an empty sunken box (no hand-made gradients). */}
        <span className="vse-colorbar__swatch" aria-hidden>
          {selected?.preview && <img src={`data:image/png;base64,${selected.preview}`} alt="" />}
        </span>
        <select className="xc-select" value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} disabled={!options.length}>
          {!options.length && <option value="">{t('wizard.style.noColorBars')}</option>}
          {categories.map((category) => (
            <optgroup key={category} label={category}>
              {options.filter((item) => (item.category || other) === category).map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}
            </optgroup>
          ))}
        </select>
      </span>
    </label>
  );
}

export default function VariableStyleEditor({
  fields,
  value,
  onChange,
  colorBars,
  noun = 'band',
  allowCustom = false,
  renamable = true,
  continuousOnly = false,
  errors = {},
  show = 'all',
  channels = {},
}: {
  fields: InspectionField[];
  value: VariableChoice[];
  onChange: (next: VariableChoice[]) => void;
  colorBars: ColorBarOption[];
  noun?: 'band' | 'attribute';
  allowCustom?: boolean;
  /** GEE keeps band names and only supports continuous styles. */
  renamable?: boolean;
  continuousOnly?: boolean;
  errors?: Record<string, string>;
  /** `pick`: only the band/attribute checklist (GEE "자료" step); `style`: only the display rows (review); `all`: both. */
  show?: 'all' | 'pick' | 'style';
  /** RGB channel of a source, shown as a tag on its row ("RGB R"). */
  channels?: Record<string, 'R' | 'G' | 'B'>;
}) {
  const { lang, t } = useLanguage();
  const fmt = (number: number) => formatValue(number, lang);
  const [custom, setCustom] = useState('');
  const selected = new Set(value.map((item) => item.source));
  const fieldBySource = new Map(fields.map((field) => [field.name, field]));
  const toggle = (field: InspectionField) =>
    onChange(selected.has(field.name) ? value.filter((item) => item.source !== field.name) : [...value, defaultChoice(field, colorBars)]);
  const update = (source: string, patch: Partial<VariableChoice>) => onChange(value.map((item) => (item.source === source ? { ...item, ...patch } : item)));
  const allSelected = fields.length > 0 && fields.every((field) => selected.has(field.name));
  const addCustom = () => {
    const name = custom.trim();
    if (!name || selected.has(name)) return;
    onChange([...value, defaultChoice({ name }, colorBars)]);
    setCustom('');
  };
  const typeLabel = (type: NonNullable<InspectionField['type']>) => t(`wizard.style.types.${type}`);

  return (
    <div className="vse">
      {fields.length > 0 && show !== 'style' && (
        <fieldset className="vse-pick">
          <legend className="vse-pick__legend">
            <span><strong>{t('wizard.style.pickTitle', { noun: t(noun === 'band' ? 'wizard.style.band' : 'wizard.style.attribute') })}</strong> <span className="xc-hint">{t('wizard.style.pickHint', { picked: value.length, count: fields.length })}</span></span>
            <button type="button" className="xc-btn xc-btn--ghost xc-btn--sm" onClick={() => onChange(allSelected ? [] : fields.map((field) => value.find((item) => item.source === field.name) ?? defaultChoice(field, colorBars)))}>
              {allSelected ? <><Square size={14} aria-hidden />{t('wizard.style.clearAll')}</> : <><CheckSquare size={14} aria-hidden />{t('wizard.style.selectAll')}</>}
            </button>
          </legend>
          <div className="vse-pick__grid">
            {fields.map((field) => {
              const range = autoRange(field.approxStats);
              return (
                <label key={field.name} className={`vse-option ${selected.has(field.name) ? 'is-on' : ''}`}>
                  <input type="checkbox" checked={selected.has(field.name)} onChange={() => toggle(field)} />
                  <span className="vse-option__text">
                    <strong>{field.name}</strong>
                    {(field.type || range || field.categories) && (
                      <small>
                        {[field.type && typeLabel(field.type), range ? t('wizard.style.range', { min: fmt(range.min), max: fmt(range.max) }) : field.categories ? t('wizard.style.categoryCount', { count: field.categories.length }) : ''].filter(Boolean).join(' · ')}
                      </small>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {allowCustom && show !== 'pick' && (
        <div className="vse-custom">
          <label className="xc-field vse-custom__field">
            <span className="xc-label">{t('wizard.style.addName')}</span>
            <input className="xc-field__input" value={custom} placeholder={t('wizard.style.addPlaceholder')} onChange={(event) => setCustom(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addCustom(); } }} />
          </label>
          <button type="button" className="xc-btn xc-btn--secondary" onClick={addCustom} disabled={!custom.trim()}><Plus size={16} aria-hidden />{t('wizard.style.add')}</button>
        </div>
      )}

      {value.length > 0 && show !== 'pick' && (
        <div className="vse-rows">
          {value.map((choice) => {
            const field = fieldBySource.get(choice.source);
            const stats = field?.approxStats;
            const range = autoRange(stats);
            const isString = field?.type === 'string';
            const error = errors[choice.source];
            const autoText = range ? `${t('wizard.style.auto', { min: fmt(range.min), max: fmt(range.max) })}${stats?.p2 != null ? t('wizard.style.autoPercentile') : ''}` : '';
            return (
              <section key={choice.source} className={`vse-row ${error ? 'has-error' : ''}`} aria-label={t('wizard.style.rowLabel', { name: choice.source })}>
                <div className="vse-row__head">
                  <strong>{choice.source}</strong>
                  {field?.type && <Badge>{typeLabel(field.type)}</Badge>}
                  {channels[choice.source] && <Badge tone="primary">{t('wizard.style.rgbBadge', { channel: channels[choice.source] })}</Badge>}
                  {choice.name !== choice.source && !renamable && <span className="xc-hint">{choice.name}</span>}
                  <span className="toolbar__spacer" />
                  {field && <button type="button" className="xc-btn xc-btn--ghost xc-btn--sm" onClick={() => toggle(field)} aria-label={t('wizard.style.excludeNamed', { name: choice.source })}>{t('wizard.style.exclude')}</button>}
                  {!field && <button type="button" className="xc-btn xc-btn--ghost xc-btn--sm" onClick={() => onChange(value.filter((item) => item.source !== choice.source))} aria-label={t('wizard.style.removeNamed', { name: choice.source })}>{t('wizard.style.remove')}</button>}
                </div>
                <div className="vse-row__grid">
                  {renamable && <label className="xc-field">
                    <span className="xc-label">{t('wizard.style.name')}</span>
                    <input className="xc-field__input" value={choice.name} maxLength={64} onChange={(event) => update(choice.source, { name: event.target.value })} aria-label={t('wizard.style.nameNamed', { name: choice.source })} />
                  </label>}
                  {!continuousOnly && <div className="xc-field">
                    <span className="xc-label">{t('wizard.style.kind')}</span>
                    <div className="segmented" role="group" aria-label={t('wizard.style.kindNamed', { name: choice.source })}>
                      <button type="button" aria-pressed={choice.kind === 'continuous'} disabled={isString} title={isString ? t('wizard.style.stringOnly') : undefined} onClick={() => update(choice.source, { kind: 'continuous' })}>{t('wizard.style.continuous')}</button>
                      <button type="button" aria-pressed={choice.kind === 'categorical'} onClick={() => update(choice.source, { kind: 'categorical' })}>{t('wizard.style.categorical')}</button>
                    </div>
                  </div>}
                  <ColorBarField value={choice.colorBar} options={colorBars} onChange={(next) => update(choice.source, { colorBar: next })} label={t('wizard.style.colorBarNamed', { name: choice.source })} />
                </div>
                {choice.kind === 'continuous' ? (
                  <div className="vse-range">
                    <label className="xc-field">
                      <span className="xc-label">{t('wizard.style.min')}</span>
                      <input className="xc-field__input" type="number" step="any" value={choice.min} onChange={(event) => update(choice.source, { min: event.target.value })} aria-label={t('wizard.style.minNamed', { name: choice.source })} />
                    </label>
                    <label className="xc-field">
                      <span className="xc-label">{t('wizard.style.max')}</span>
                      <input className="xc-field__input" type="number" step="any" value={choice.max} onChange={(event) => update(choice.source, { max: event.target.value })} aria-label={t('wizard.style.maxNamed', { name: choice.source })} />
                    </label>
                    <div className="vse-range__auto">
                      {range ? (
                        <>
                          <span className="xc-hint">{autoText}{stats && (stats.min !== range.min || stats.max !== range.max) ? t('wizard.style.actual', { min: fmt(stats.min), max: fmt(stats.max) }) : ''}</span>
                          <button type="button" className="xc-btn xc-btn--ghost xc-btn--sm" disabled={choice.min === String(range.min) && choice.max === String(range.max)} onClick={() => update(choice.source, { min: String(range.min), max: String(range.max) })}>
                            <RotateCcw size={14} aria-hidden />{t('wizard.style.reset')}
                          </button>
                        </>
                      ) : (
                        <span className="xc-hint">{choice.origin === 'preset' ? t('wizard.style.presetRange', { min: fmt(Number(PRESET_STYLE.min)), max: formatNumber(Number(PRESET_STYLE.max), {}, lang) }) : t('wizard.style.noAuto')}</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="xc-hint">
                    {t('wizard.style.categoricalHint')}{field?.categories ? ` · ${field.categories.slice(0, 6).map((item) => item.value).join(', ')}${field.categories.length > 6 ? ' …' : ''}` : ''}
                  </p>
                )}
                {error && <p className="xc-field__error" role="alert">{error}</p>}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
