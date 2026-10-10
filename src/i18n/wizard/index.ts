// Registers the add-data wizard's text (UR-53 stage 3). Imported for its effect by the wizard's components
// (src/app/wizard/*.tsx), so it lands in the wizard's lazy chunk — not in main, the management pages or the
// Viewer. The wizard also uses management words (job status, orbit, project), so the app part comes too.
// Model files (areaModel, dateModel, sarModel) only look keys up; areaDemo and the dataset page import them
// without pulling this part in.
import '../app';
import { registerDictionaries } from '../core';
import en from './en';
import ko from './ko';

registerDictionaries({ ko, en });
