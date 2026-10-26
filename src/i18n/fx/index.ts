// Registers the UR-63 screens' text (FX-F). Imported for its effect by the app shell (notification bell), the
// management screens' part (../app) and the pages that use it, so it loads with the signed-in app, not with main.
import { registerDictionaries } from '../core';
import '../codes/fx';
import en from './en';
import ko from './ko';

registerDictionaries({ ko, en });
