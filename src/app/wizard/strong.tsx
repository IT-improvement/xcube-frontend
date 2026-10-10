import { Fragment, ReactNode } from 'react';
import type { TFunction, TKey, TVars } from '../../i18n';

const MARK = '\u0001';

/** A dictionary sentence with one value set in bold: `{name}` is filled with `<strong>{value}</strong>`. */
export function withStrong(t: TFunction, key: TKey, name: string, value: ReactNode, vars: TVars = {}): ReactNode {
  const parts = t(key, { ...vars, [name]: MARK }).split(MARK);
  return parts.map((part, index) => (
    <Fragment key={index}>{part}{index < parts.length - 1 && <strong>{value}</strong>}</Fragment>
  ));
}
