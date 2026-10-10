// Registers the Viewer's text (UR-53 stage 4). Imported for its effect by the Viewer's modules
// (src/views/Viewer/*.tsx), so it lands in the Viewer's lazy chunk — not in main, the management pages or
// the wizard. The Viewer does not need the app part: words it shares with the management screens (job
// status, model names, "shared with you") have their own copies here.
import { registerDictionaries } from '../core';
import en from './en';
import ko from './ko';

registerDictionaries({ ko, en });
