// Example data (UR-63 UX1): datasets an admin marked so every signed-in user can read them. Backoffice sends
// `isExample` on the list and detail; someone else's example keeps `accessType: "SHARED"`. Example data is read-only
// on every screen: no delete, no project link (the server refuses those with 404 anyway).
import type { ZarrDataset } from './viewerAdapter';

export type ExampleFlag = { isExample?: boolean };
/** Copies `isExample` from a Backoffice summary onto the mapped dataset. */
export const withExampleFlag = <T extends object>(dataset: T, dto: object): T & ExampleFlag =>
  ((dto as { isExample?: unknown }).isExample === true ? { ...dataset, isExample: true } : dataset);
export const isExample = (dataset: ZarrDataset | (ZarrDataset & ExampleFlag) | null | undefined) => (dataset as (ZarrDataset & ExampleFlag) | undefined)?.isExample === true;
