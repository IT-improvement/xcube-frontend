/* UR-53 stage 5: server message codes → dictionary text, and userMessage's resolution order. */
import fs from 'fs';
import path from 'path';
import { ApiError, userMessage } from '../api/httpClient';
import { hasText, translate } from './core';
import { codeKey, failureText, serverItems, serverText } from './serverText';
// The parts that hold the service codes (registered by the screens that show them).
import './codes/ai';
import './codes/data';
import './wizard';

/**
 * Every code of the Backend guide's "코드 목록 (I18N5)" table, by where its text lives. The estimate's own codes
 * are worded by the wizard (`wizard.estimate.warnings|blockers`, with advice); the rest by `serverText`.
 */
const SERVER_CODES = {
  common: ['INTERNAL_ERROR', 'INVALID_REQUEST', 'NOT_FOUND', 'UNAUTHORIZED', 'WORKER_FAILED', 'INVALID_JOB_STATUS', 'INVALID_JSON'],
  ai: ['AI_FIELDS_REQUIRED', 'INVALID_JOB_NAME', 'INVALID_PROJECT_ID', 'MODEL_CHECKPOINT_UNAVAILABLE', 'ORIGINAL_INPUT_REQUIRED', 'S1_S2_DATE_GAP', 'UNITS_VARY_BY_TIME', 'UNIT_DECISION'],
  analysis: ['FORMULA_VARIABLES_REQUIRED', 'FUSION_FIELDS_REQUIRED', 'INVALID_BINDING', 'NORMALIZATION_MISSING'],
  generation: [
    'ADMIN_LEVEL_MISMATCH', 'AOI_PROCESSING_FAILED', 'AOI_TIMEOUT', 'AREA_CHOICE_REQUIRED', 'AREA_FLAG_MUST_BE_BOOLEAN', 'AREA_INPUT_READ_FAILED',
    'AREA_SHAPEFILE_COMPONENTS_REQUIRED', 'AREA_SHAPEFILE_MISSING', 'AUTO_TILE_SPLIT', 'BAND_STYLES_REQUIRED', 'BAND_STYLE_MISSING', 'BOX_COORDINATES_REQUIRED',
    'CAS500_AUX_MISSING', 'CAS500_BANDS_MISSING', 'CAS500_CHECKED', 'CAS500_NORMALIZATION_UNCONFIRMED', 'CAS500_READ_FAILED', 'CAS500_ZIP_REQUIRED',
    'CATEGORICAL_KIND_REQUIRED', 'COLLECTION_BAND_REQUIRED', 'COLLECTION_NOT_VERIFIED', 'COORDINATE_TRANSFORM_FAILED', 'FILE_INSPECTION_REQUIRED',
    'FILE_URI_REQUIRED', 'GDAL_INSPECTION_FAILED', 'GDAL_INTERRUPTED', 'GDAL_RESPONSE_INVALID', 'GDAL_UNAVAILABLE', 'GEOJSON_REQUIRED', 'GEOTIFF_CHECKED',
    'GEOTIFF_EXTENSION_REQUIRED', 'GEOTIFF_READ_FAILED', 'IDEMPOTENCY_KEY_TOO_LONG', 'INSPECTION_READ_FAILED', 'INSPECTION_TYPE_MISMATCH', 'INVALID_ADMIN_LEVEL',
    'INVALID_AREA', 'INVALID_AREA_BOX', 'INVALID_AREA_MODE', 'INVALID_AREA_NAME', 'INVALID_BAND_STYLES', 'INVALID_BOUNDS', 'INVALID_CATALOG_PAGE',
    'INVALID_CATALOG_URL', 'INVALID_CLIP_MODE', 'INVALID_COLLECTION_BANDS', 'INVALID_DATE_RANGE', 'INVALID_INPUT_KIND', 'INVALID_POINT_SIZE',
    'INVALID_RETAINED_UPLOAD', 'INVALID_RGB_BAND', 'INVALID_SELECTED_DATES', 'INVALID_STYLE_LIMITS', 'INVALID_STYLE_RANGE', 'INVALID_VARIABLE',
    'INVALID_VARIABLE_SELECTION', 'JOB_NOT_RETRYABLE', 'JOB_SERIALIZATION_FAILED', 'MAX_SCENES_LIMITED', 'NO_FULL_COVER_DATE', 'NO_S1_MATCH',
    'PARTIAL_COVER_DATES_DROPPED', 'POINT_FIELDS_REQUIRED', 'REGISTRATION_FAILED', 'RESERVED_VARIABLE_NAME', 'RETAINED_SHAPEFILE_REQUIRED',
    'RETAINED_UPLOAD_UNAVAILABLE', 'S1_UNPAIRED', 'SAR_PAIRING_COLLECTION_REQUIRED', 'SAVED_GENERATION_REQUEST_READ_FAILED', 'SAVED_REQUEST_READ_FAILED',
    'SELECTED_DATE_HAS_NO_SCENE', 'SGIS_ADMDONGKOR', 'SHAPEFILE_CHECKED', 'SHAPEFILE_COMPONENTS_MISSING', 'SHAPEFILE_COMPONENTS_REQUIRED',
    'SHAPEFILE_INSPECTION_REQUIRED', 'SHAPEFILE_JOB_REQUIRED', 'SHAPEFILE_READ_FAILED', 'SHAPEFILE_ZIP_REQUIRED', 'SHAPE_AREA_ID_REQUIRED',
    'UNSUPPORTED_FILE_JOB_TYPE', 'UPLOADED_FILE_NOT_FOUND', 'UPLOADED_FILE_REQUIRED', 'VARIABLE_REQUIRED', 'VERIFIED_COLLECTION_REQUIRED',
    'ZIP_SIZE_LIMIT_EXCEEDED', 'ZIP_TOO_MANY_ENTRIES', 'ZIP_UNSAFE_PATH',
  ],
  estimateWarnings: ['DATE_LIST_TRUNCATED', 'ESTIMATED_SIZE_EXCEEDS_5_GIB', 'ESTIMATE_USES_MAX_SCENES', 'ESTIMATE_USES_SELECTED_DATES', 'GEE_SCENE_COUNT_UNAVAILABLE', 'MAX_SCENES_LIMIT', 'NOISE_UNAVAILABLE', 'SIDE_EXCEEDS_100_KM', 'STORAGE_USAGE_UNAVAILABLE'],
  estimateBlockers: ['DATE_LIST_UNAVAILABLE', 'QUOTA_EXCEEDED'],
};
/**
 * UR-55 satellite product codes (Backend guide "위성 원본 제품 업로드"), not in the I18N5 table yet: they need text
 * now, and the table check accepts them whether the table lists them or not. Move them into `generation` once the
 * table has them.
 */
const PENDING_CODES = ['PRODUCT_TYPE_MISMATCH', 'PRODUCT_LEVEL_UNSUPPORTED', 'PRODUCT_METADATA_MISSING', 'PRODUCT_BAND_MISSING', 'PRODUCT_SENSOR_MIXED', 'PRODUCT_OFFSET_MIXED', 'PRODUCT_READ_FAILED', 'SENTINEL2_CHECKED', 'LANDSAT_CHECKED'] as const;
const ALL_CODES = Object.values(SERVER_CODES).flat();
const HANGUL = /[가-힣]/;

describe('every I18N5 code has Korean and English text', () => {
  const keyOf = (code: string) =>
    SERVER_CODES.estimateWarnings.includes(code) ? `wizard.estimate.warnings.${code}`
      : SERVER_CODES.estimateBlockers.includes(code) ? `wizard.estimate.blockers.${code}`
        : codeKey(code);

  test.each([...ALL_CODES, ...PENDING_CODES])('%s', (code) => {
    const key = keyOf(code);
    expect(key).toBeDefined();
    expect(hasText(key!)).toBe(true);
    const ko = translate('ko', key as never);
    const en = translate('en', key as never);
    expect(ko).not.toBe(key);
    expect(en).not.toBe(key);
    expect(en).not.toMatch(HANGUL);
    // The same placeholders in both languages.
    const slots = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
    expect(slots(en)).toEqual(slots(ko));
  });

  // The table itself, when the docs repository sits next to this one (local checkouts; CI has only the list).
  const docPath = ['../docs', '../../docs'].map((dir) => path.resolve(process.cwd(), dir, 'Backend/technical-guide.md')).find((file) => fs.existsSync(file));
  (docPath ? test : test.skip)('the list above matches the Backend guide table', () => {
    const text = fs.readFileSync(docPath!, 'utf8');
    const start = text.indexOf('### 코드 목록 (I18N5');
    const end = text.indexOf('\n#', start + 1);
    const rows = text.slice(start, end === -1 ? undefined : end).split('\n').filter((line) => /^\| [^-]/.test(line));
    const codes = new Set(rows.map((line) => /`([A-Z0-9_]+)`/.exec(line)?.[1]).filter((code): code is string => !!code));
    expect(codes.size).toBeGreaterThan(100);
    const listed = PENDING_CODES.filter((code) => codes.has(code));
    expect(Array.from(codes).sort()).toEqual(Array.from(new Set([...ALL_CODES, ...listed])).sort());
  });
});

test('product codes fill their values in both languages (UR-55)', () => {
  expect(serverText({ code: 'PRODUCT_BAND_MISSING', params: { bands: ['B02', 'SCL'] } }, 'en')).toBe('The product is missing band files: B02, SCL');
  expect(serverText({ code: 'PRODUCT_METADATA_MISSING', params: { file: 'MTD_MSIL2A.xml' } }, 'ko')).toBe('제품 메타데이터 파일이 없습니다: MTD_MSIL2A.xml');
});

describe('serverText', () => {
  test('a code with values in Korean (the server sentence) and English', () => {
    const item = { code: 'S1_S2_DATE_GAP', params: { days: 12 }, message: 'S1·S2 촬영 날짜 차이가 큽니다 (최대 12일)' };
    expect(serverText(item, 'ko')).toBe('S1·S2 촬영 날짜 차이가 큽니다 (최대 12일)');
    expect(serverText(item, 'en')).toBe('The S1 and S2 acquisition dates are far apart (up to 12 days).');
    expect(serverText({ code: 'PARTIAL_COVER_DATES_DROPPED', params: { dates: ['2024-08-01', '2024-08-06'] } }, 'en')).toBe('Left out because they don’t cover the whole area: 2024-08-01, 2024-08-06');
  });

  test('without a known code: the sentence (Korean only in Korean), else a generic line', () => {
    expect(serverText({ code: 'NEW_CODE', message: '새 문장' }, 'ko')).toBe('새 문장');
    expect(serverText({ code: 'NEW_CODE', message: '새 문장' }, 'en')).toBe('Something went wrong (code NEW_CODE).');
    expect(serverText({ message: 'Plain English note' }, 'en')).toBe('Plain English note');
    expect(serverText({ message: '코드 없는 한국어' }, 'en')).toBe('The server added a note that isn’t available in English.');
    expect(serverText({}, 'en')).toBe('');
  });

  test('diagnostic codes show their sentence when the language allows', () => {
    expect(serverText({ code: 'WORKER_FAILED', message: 'Traceback: KeyError band' }, 'en')).toBe('Traceback: KeyError band');
    expect(serverText({ code: 'WORKER_FAILED', message: '작업자 오류' }, 'ko')).toBe('작업자 오류');
    expect(serverText({ code: 'WORKER_FAILED', message: '작업자 오류' }, 'en')).toBe('Processing stopped because of an unexpected error.');
  });

  test('failure reasons and plain warning lists', () => {
    expect(failureText({ errorCode: 'JOB_NOT_RETRYABLE', errorParams: { status: 'SUCCEEDED' }, errorMessage: '실패하거나 취소된 작업만 다시 실행할 수 있습니다.' }, 'en')).toBe('Only failed or cancelled jobs can be run again.');
    expect(failureText({ errorCode: 'INVALID_INPUT', errorMessage: '' }, 'en')).toBe('INVALID_INPUT');
    expect(failureText({ errorCode: null, errorMessage: '옛 오류' }, 'en')).toBe('Something went wrong.');
    expect(failureText({ errorCode: null, errorMessage: '옛 오류' }, 'ko')).toBe('옛 오류');
    expect(failureText({}, 'en')).toBe('');
    expect(serverItems(undefined, ['SIDE_EXCEEDS_100_KM', '문장'])).toEqual([{ code: 'SIDE_EXCEEDS_100_KM', message: 'SIDE_EXCEEDS_100_KM' }, { message: '문장' }]);
    expect(serverItems([{ code: 'A_B' }], ['ignored'])).toEqual([{ code: 'A_B' }]);
  });
});

describe('userMessage', () => {
  test('a code with params: the dictionary text in Korean and English', () => {
    const error = new ApiError(400, 'ZIP_SIZE_LIMIT_EXCEEDED', '압축 해제 크기가 허용 한도 2 GiB를 초과합니다.', 't1', { limit: '2 GiB' });
    expect(userMessage(error, 'ko')).toBe('압축 해제 크기가 허용 한도 2 GiB를 초과합니다.');
    expect(userMessage(error, 'en')).toBe('The unzipped size is over the 2 GiB limit.');
    // A code whose server sentence was English gets Korean words too.
    expect(userMessage(new ApiError(400, 'INVALID_DATE_RANGE', 'startDate must precede exclusive endDate'), 'ko')).toBe('시작일이 종료일보다 앞서야 합니다.');
  });

  test('an unknown code: Korean shows the server sentence; English an English sentence or the code', () => {
    expect(userMessage(new ApiError(400, 'BRAND_NEW', '새로운 서버 문장'), 'ko')).toBe('새로운 서버 문장');
    expect(userMessage(new ApiError(400, 'BRAND_NEW', '새로운 서버 문장'), 'en')).toBe('Something went wrong (code BRAND_NEW).');
    expect(userMessage(new ApiError(400, 'BRAND_NEW', 'Band B9 is not available'), 'en')).toBe('Band B9 is not available');
  });

  test('a Hangul-only message without a code never shows in English', () => {
    expect(userMessage(new ApiError(500, 'HTTP_500', '서버 내부 오류'), 'en')).toBe('The request couldn’t be completed.');
    expect(userMessage(new ApiError(500, 'HTTP_500', '서버 내부 오류'), 'ko')).toBe('서버 내부 오류');
    expect(userMessage(new ApiError(500, 'HTTP_500', ''), 'ko')).toBe('요청을 처리하지 못했습니다.');
  });

  test('status mappings stay for codes without text; network and session come first', () => {
    expect(userMessage(new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Duplicate'), 'en')).toBe('This already exists or conflicts with the current state.');
    expect(userMessage(new ApiError(409, 'DATASET_NOT_REGISTERED', 'x'), 'en')).toBe('XCube registration is still syncing. Try again in a moment.');
    expect(userMessage(new ApiError(401, 'UNAUTHORIZED', '로그인이 필요합니다.'), 'en')).toBe('Your session has expired. Please sign in again.');
    expect(userMessage(new ApiError(0, 'NETWORK_ERROR', '서버에 연결할 수 없습니다.'), 'en')).toBe('Can’t reach the server. Check that it’s running.');
  });

  test('diagnostic codes: Korean keeps the server sentence, English shows it only without Hangul', () => {
    expect(userMessage(new ApiError(404, 'NOT_FOUND', '작업을 찾을 수 없습니다.'), 'ko')).toBe('작업을 찾을 수 없습니다.');
    expect(userMessage(new ApiError(404, 'NOT_FOUND', '작업을 찾을 수 없습니다.'), 'en')).toBe('Not found. It may have been deleted.');
    expect(userMessage(new ApiError(400, 'INVALID_REQUEST', 'Invalid normalization'), 'en')).toBe('Invalid normalization');
  });

  test('a client fallback (no server sentence) goes through the dictionary', () => {
    const error = new ApiError(500, 'HTTP_500', '');
    error.fallbackKey = 'wizard.upload.areaSaveFailed';
    expect(userMessage(error, 'ko')).toBe('영역을 저장하지 못했습니다.');
    expect(userMessage(error, 'en')).toBe('Couldn’t save the area.');
  });
});
