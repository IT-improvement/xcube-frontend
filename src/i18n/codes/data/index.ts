// Registers the Data Generation and Data Analysis message codes (UR-53 stage 5). Imported for its effect by
// the management screens' part (../../app: job center, data detail, band math), which the add-data wizard
// also loads, so these texts download with those screens, not with main or the Viewer.
import { registerDictionaries } from '../../core';
import en from './en';
import ko from './ko';

registerDictionaries({ ko, en });
