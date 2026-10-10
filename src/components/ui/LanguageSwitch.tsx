import { Languages } from 'lucide-react';
import { LANGS, LANGUAGE_NAMES, useLanguage } from '../../i18n';

/**
 * `한국어 | English` as a small segmented group. Each option is written in its own language (and
 * marked with `lang`), so a visitor can find theirs whatever the page is showing.
 */
export function LanguageSwitch({ className, block }: { className?: string; block?: boolean }) {
  const { lang, setLang, t } = useLanguage();
  return (
    <div role="group" aria-label={t('language.label')} className={['xc-lang', block && 'xc-lang--block', className].filter(Boolean).join(' ')}>
      <Languages size={14} aria-hidden className="xc-lang__icon" />
      {LANGS.map((code) => (
        <button key={code} type="button" lang={code} aria-pressed={lang === code} onClick={() => setLang(code)}>
          {LANGUAGE_NAMES[code]}
        </button>
      ))}
    </div>
  );
}
