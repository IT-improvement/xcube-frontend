import { formatDate, Lang } from '../i18n';

/** Date of the Daecheong Lake scene shown on the home and login pages. */
const CASE_DATE = new Date(2024, 7, 14);

/** ko "2024년 8월 14일", en "August 14, 2024". */
export const caseDate = (lang: Lang) => formatDate(CASE_DATE, { year: 'numeric', month: 'long', day: 'numeric' }, lang);
