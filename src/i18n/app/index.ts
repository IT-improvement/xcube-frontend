// Registers the management screens' text (UR-53 stage 2). Imported for its effect by each page under
// src/app/pages, so it lands in the lazy page chunks — not in main, and not in the Viewer, which also uses
// app/api.ts and app/jobs.tsx. Helpers there that use these keys are called only from those pages. The server
// message codes these pages show (job failures, band math warnings, request errors) come with them (stage 5).
import '../codes/data';
import '../codes/ai';
import { registerDictionaries } from '../core';
import en from './en';
import ko from './ko';

registerDictionaries({ ko, en });
