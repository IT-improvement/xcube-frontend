// Registers the AI Processing message codes (UR-53 stage 5). Imported for its effect by the Viewer's part
// (../../viewer) and the management screens' part (../../app, the job center lists AI jobs), so these
// texts download with those screens, not with main.
import { registerDictionaries } from '../../core';
import en from './en';
import ko from './ko';

registerDictionaries({ ko, en });
