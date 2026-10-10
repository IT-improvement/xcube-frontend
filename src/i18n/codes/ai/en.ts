// English text of the AI Processing message codes (UR-53 stage 5). Same shape as ./ko.ts.
import type { AiCodesTranslation } from '../../types';

const enAiCodes: AiCodesTranslation = {
  aiCodes: {
    AI_FIELDS_REQUIRED: 'Choose the data and a model.',
    INVALID_JOB_NAME: 'The result name isn’t valid.',
    INVALID_PROJECT_ID: 'That project isn’t valid.',
    MODEL_CHECKPOINT_UNAVAILABLE: 'The model file isn’t ready yet, so this model can’t run now.',
    ORIGINAL_INPUT_REQUIRED: 'Only original data can be used as input.',
    S1_S2_DATE_GAP: 'The S1 and S2 acquisition dates are far apart (up to {days} days).',
    UNITS_VARY_BY_TIME: '{name}: the value format changes at time index {index} ({decision}).',
    UNIT_DECISION: '{name}: {decision}',
  },
};

export default enAiCodes;
