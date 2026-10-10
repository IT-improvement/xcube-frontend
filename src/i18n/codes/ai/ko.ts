// Korean text of the AI Processing message codes (UR-53 stage 5, Backend guide "코드 목록 (I18N5)").
// Where the server's `message` is Korean the text is the same sentence, so Korean screens look as before.
// Codes every service shares (INVALID_JSON, NOT_FOUND…) are in the main dictionary's `errors.code`.
const koAiCodes = {
  aiCodes: {
    AI_FIELDS_REQUIRED: '데이터와 모델을 골라 주세요.',
    INVALID_JOB_NAME: '결과 이름이 올바르지 않습니다.',
    INVALID_PROJECT_ID: '프로젝트가 올바르지 않습니다.',
    MODEL_CHECKPOINT_UNAVAILABLE: '모델 파일이 아직 준비되지 않아 지금은 실행할 수 없습니다.',
    ORIGINAL_INPUT_REQUIRED: '원본 데이터만 입력으로 쓸 수 있습니다.',
    S1_S2_DATE_GAP: 'S1·S2 촬영 날짜 차이가 큽니다 (최대 {days}일)',
    UNITS_VARY_BY_TIME: '{name}: 시점 {index}부터 값 형식이 달라집니다({decision}).',
    UNIT_DECISION: '{name}: {decision}',
  },
};

export default koAiCodes;
