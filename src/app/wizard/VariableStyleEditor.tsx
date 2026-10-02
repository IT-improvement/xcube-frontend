// Pick only the bands/attributes you need, then set a colour bar and display
// range for each (FR-GEN-10·11). The range is pre-filled from the inspection's
// 2–98 percentile and can be edited or reset to the automatic value.
import { CheckSquare, Plus, RotateCcw, Square } from 'lucide-react';
import { useState } from 'react';
import { ColorBarOption, InspectionField, ValueStats, VariableSpec } from '../../api/generationApi';
import { Badge } from '../../components/ui/kit';

export type VariableChoice = {
  source: string;
  name: string;
  kind: 'continuous' | 'categorical';
  colorBar: string;
  min: string;
  max: string;
};

const TYPE_LABEL = { integer: '정수', real: '실수', string: '문자' } as const;

export function autoRange(stats?: ValueStats): { min: number; max: number } | null {
  if (!stats) return null;
  const min = stats.p2 ?? stats.min;
  const max = stats.p98 ?? stats.max;
  return Number.isFinite(min) && Number.isFinite(max) && min < max ? { min, max } : null;
}

// Thousands separators only from 10,000 so years and small codes read naturally (2016, not 2,016).
const formatValue = (value: number) => (Math.abs(value) >= 10000 ? value.toLocaleString('ko-KR', { maximumFractionDigits: 1 }) : String(Number(value.toPrecision(Math.abs(value) >= 1000 ? 6 : 4))));

export function defaultChoice(field: InspectionField, colorBars: ColorBarOption[]): VariableChoice {
  const range = autoRange(field.approxStats);
  const categorical = field.type === 'string';
  const colorBar = colorBars.find((item) => item.id === (categorical ? 'tab10' : 'viridis'))?.id ?? colorBars[0]?.id ?? '';
  return { source: field.name, name: field.name, kind: categorical ? 'categorical' : 'continuous', colorBar, min: range ? String(range.min) : '', max: range ? String(range.max) : '' };
}

/** Problems that block submission, keyed by source name. */
export function validateChoices(choices: VariableChoice[], colorBars: ColorBarOption[]) {
  const errors: Record<string, string> = {};
  const names = new Set<string>();
  for (const choice of choices) {
    if (!choice.name.trim()) errors[choice.source] = '변수 이름을 입력하세요.';
    else if (names.has(choice.name.trim())) errors[choice.source] = '변수 이름이 겹칩니다.';
    else if (colorBars.length && !colorBars.some((item) => item.id === choice.colorBar)) errors[choice.source] = '색상표를 고르세요.';
    else if (choice.kind === 'continuous') {
      const min = Number(choice.min);
      const max = Number(choice.max);
      if (choice.min === '' || choice.max === '' || !Number.isFinite(min) || !Number.isFinite(max)) errors[choice.source] = '표시 최솟값과 최댓값을 입력하세요.';
      else if (min >= max) errors[choice.source] = '최솟값은 최댓값보다 작아야 합니다.';
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
  const selected = options.find((item) => item.id === value);
  const categories = Array.from(new Set(options.map((item) => item.category || '기타')));
  return (
    <label className="vse-colorbar">
      <span className="xc-label">색상표</span>
      <span className="vse-colorbar__control">
        <span className="vse-colorbar__swatch" aria-hidden>
          {selected?.preview ? <img src={`data:image/png;base64,${selected.preview}`} alt="" /> : <i data-name={value} />}
        </span>
        <select className="xc-select" value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} disabled={!options.length}>
          {!options.length && <option value="">색상표 없음</option>}
          {categories.map((category) => (
            <optgroup key={category} label={category}>
              {options.filter((item) => (item.category || '기타') === category).map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}
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
}: {
  fields: InspectionField[];
  value: VariableChoice[];
  onChange: (next: VariableChoice[]) => void;
  colorBars: ColorBarOption[];
  noun?: 'band' | '속성';
  allowCustom?: boolean;
  /** GEE keeps band names and only supports continuous styles. */
  renamable?: boolean;
  continuousOnly?: boolean;
  errors?: Record<string, string>;
}) {
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
  const label = noun === 'band' ? 'band' : '속성';

  return (
    <div className="vse">
      {fields.length > 0 && (
        <fieldset className="vse-pick">
          <legend className="vse-pick__legend">
            <span><strong>Zarr로 만들 {label}</strong> <span className="xc-hint">고른 것만 변수로 만듭니다 · {value.length} / {fields.length}개 선택</span></span>
            <button type="button" className="xc-btn xc-btn--ghost xc-btn--sm" onClick={() => onChange(allSelected ? [] : fields.map((field) => value.find((item) => item.source === field.name) ?? defaultChoice(field, colorBars)))}>
              {allSelected ? <><Square size={14} aria-hidden />모두 해제</> : <><CheckSquare size={14} aria-hidden />모두 선택</>}
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
                    <small>
                      {field.type ? TYPE_LABEL[field.type] : '형식 미확인'}
                      {range ? ` · ${formatValue(range.min)} ~ ${formatValue(range.max)}` : field.categories ? ` · 값 ${field.categories.length}종` : ''}
                    </small>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {allowCustom && (
        <div className="vse-custom">
          <label className="xc-field" style={{ flex: 1 }}>
            <span className="xc-label">변수 이름 추가</span>
            <input className="xc-field__input" style={{ height: 40 }} value={custom} placeholder="예: ndvi" onChange={(event) => setCustom(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addCustom(); } }} />
          </label>
          <button type="button" className="xc-btn xc-btn--secondary" onClick={addCustom} disabled={!custom.trim()}><Plus size={16} aria-hidden />추가</button>
        </div>
      )}

      {value.length > 0 && (
        <div className="vse-rows">
          {value.map((choice) => {
            const field = fieldBySource.get(choice.source);
            const stats = field?.approxStats;
            const range = autoRange(stats);
            const isString = field?.type === 'string';
            const error = errors[choice.source];
            const autoText = range ? `자동값 ${formatValue(range.min)} ~ ${formatValue(range.max)}${stats?.p2 != null ? ' (2~98%)' : ''}` : '';
            return (
              <section key={choice.source} className={`vse-row ${error ? 'has-error' : ''}`} aria-label={`${choice.source} 표시 설정`}>
                <div className="vse-row__head">
                  <strong>{choice.source}</strong>
                  {field?.type && <Badge>{TYPE_LABEL[field.type]}</Badge>}
                  <span className="toolbar__spacer" />
                  {field && <button type="button" className="xc-btn xc-btn--ghost xc-btn--sm" onClick={() => toggle(field)} aria-label={`${choice.source} 선택 해제`}>제외</button>}
                  {!field && <button type="button" className="xc-btn xc-btn--ghost xc-btn--sm" onClick={() => onChange(value.filter((item) => item.source !== choice.source))} aria-label={`${choice.source} 삭제`}>삭제</button>}
                </div>
                <div className="vse-row__grid">
                  {renamable && <label className="xc-field">
                    <span className="xc-label">변수 이름</span>
                    <input className="xc-field__input" style={{ height: 40 }} value={choice.name} maxLength={64} onChange={(event) => update(choice.source, { name: event.target.value })} aria-label={`${choice.source} 변수 이름`} />
                  </label>}
                  {!continuousOnly && <div className="xc-field">
                    <span className="xc-label">표현</span>
                    <div className="segmented" role="group" aria-label={`${choice.source} 표현 방식`}>
                      <button type="button" aria-pressed={choice.kind === 'continuous'} disabled={isString} title={isString ? '문자 속성은 범주형만 가능합니다' : undefined} onClick={() => update(choice.source, { kind: 'continuous' })}>연속값</button>
                      <button type="button" aria-pressed={choice.kind === 'categorical'} onClick={() => update(choice.source, { kind: 'categorical' })}>범주형</button>
                    </div>
                  </div>}
                  <ColorBarField value={choice.colorBar} options={colorBars} onChange={(next) => update(choice.source, { colorBar: next })} label={`${choice.source} 색상표`} />
                </div>
                {choice.kind === 'continuous' ? (
                  <div className="vse-range">
                    <label className="xc-field">
                      <span className="xc-label">표시 최솟값</span>
                      <input className="xc-field__input" style={{ height: 40 }} type="number" step="any" value={choice.min} onChange={(event) => update(choice.source, { min: event.target.value })} aria-label={`${choice.source} 표시 최솟값`} />
                    </label>
                    <label className="xc-field">
                      <span className="xc-label">표시 최댓값</span>
                      <input className="xc-field__input" style={{ height: 40 }} type="number" step="any" value={choice.max} onChange={(event) => update(choice.source, { max: event.target.value })} aria-label={`${choice.source} 표시 최댓값`} />
                    </label>
                    <div className="vse-range__auto">
                      {range ? (
                        <>
                          <span className="xc-hint">{autoText}{stats && (stats.min !== range.min || stats.max !== range.max) ? ` · 실제 ${formatValue(stats.min)} ~ ${formatValue(stats.max)}` : ''}</span>
                          <button type="button" className="xc-btn xc-btn--ghost xc-btn--sm" disabled={choice.min === String(range.min) && choice.max === String(range.max)} onClick={() => update(choice.source, { min: String(range.min), max: String(range.max) })}>
                            <RotateCcw size={14} aria-hidden />자동값으로 되돌리기
                          </button>
                        </>
                      ) : (
                        <span className="xc-hint">자동 범위를 계산할 수 없어 직접 입력합니다. 생성 후 Viewer에서 바꿀 수 있습니다.</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="xc-hint">
                    값마다 색이 하나씩 지정됩니다{field?.categories ? ` · ${field.categories.slice(0, 6).map((item) => item.value).join(', ')}${field.categories.length > 6 ? ' …' : ''}` : ''}
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
