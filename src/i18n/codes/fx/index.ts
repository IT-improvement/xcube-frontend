// Registers the UR-63 server codes (FX). Imported for its effect by the sign-in pages and the management screens'
// part (../../app), so password reset, settings, the job center and the comparison page can word them.
import { registerDictionaries } from '../../core';
import en from './en';
import ko from './ko';

registerDictionaries({ ko, en });
