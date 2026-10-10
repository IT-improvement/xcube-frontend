import type ko from './ko';

export type Lang = 'ko' | 'en';

/** Korean is the source dictionary; every other language must have the same shape. */
export type Dict = typeof ko;

/** English-style count forms. `one` is used when the plural rule says "one" (count 1 in English). */
export type Plural = { one: string; other: string };

/** Same keys as `T`; each text may be a plain string or, where a language needs it, a Plural. */
export type DeepStringify<T> = { [K in keyof T]: T[K] extends string ? string | Plural : DeepStringify<T[K]> };

export type Translation = DeepStringify<Dict>;

/** Dot paths to the texts in `T`, e.g. "landing.hero.title". */
type Path<T> = { [K in keyof T & string]: T[K] extends string ? K : `${K}.${Path<T[K]>}` }[keyof T & string];

export type TKey = Path<Dict>;

export type TVars = Record<string, string | number>;

export type TFunction = (key: TKey, vars?: TVars) => string;
