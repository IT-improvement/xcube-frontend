import type ko from './ko';
import type koApp from './app/ko';
import type koWizard from './wizard/ko';
import type koViewer from './viewer/ko';

export type Lang = 'ko' | 'en';

/**
 * Korean is the source dictionary; every other language must have the same shape. It comes in parts:
 * the main part (landing, sign-in, shell, request errors) and the app part (management screens), which is
 * loaded with the app pages and registered then (see ./app/index.ts). The add-data wizard has a third part
 * (./wizard/), loaded and registered with the wizard (stage 3), and the Viewer a fourth (./viewer/, stage 4).
 */
export type Dict = typeof ko & typeof koApp & typeof koWizard & typeof koViewer;

/** English-style count forms. `one` is used when the plural rule says "one" (count 1 in English). */
export type Plural = { one: string; other: string };

/** Same keys as `T`; each text may be a plain string or, where a language needs it, a Plural. */
export type DeepStringify<T> = { [K in keyof T]: T[K] extends string ? string | Plural : DeepStringify<T[K]> };

/** Shape of en.ts (main part). */
export type Translation = DeepStringify<typeof ko>;
/** Shape of app/en.ts (app part). */
export type AppTranslation = DeepStringify<typeof koApp>;
/** Shape of wizard/en.ts (add-data wizard part). */
export type WizardTranslation = DeepStringify<typeof koWizard>;
/** Shape of viewer/en.ts (Viewer part). */
export type ViewerTranslation = DeepStringify<typeof koViewer>;

/** Dot paths to the texts in `T`, e.g. "landing.hero.title". */
type Path<T> = { [K in keyof T & string]: T[K] extends string ? K : `${K}.${Path<T[K]>}` }[keyof T & string];

export type TKey = Path<Dict>;

export type TVars = Record<string, string | number>;

export type TFunction = (key: TKey, vars?: TVars) => string;
