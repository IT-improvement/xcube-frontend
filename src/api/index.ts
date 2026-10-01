import { backofficeAdapter } from './backofficeApi';
import { viewerAdapter as demoAdapter } from './viewerAdapter';
export const useMockApi = process.env.REACT_APP_USE_MOCK_API === 'true';
export const activeViewerAdapter = useMockApi ? demoAdapter : backofficeAdapter;
