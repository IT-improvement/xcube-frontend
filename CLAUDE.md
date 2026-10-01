# xcube-frontend

React Viewer와 사용자 화면 (포트 `3000`). Claude는 이 폴더의 코드를 읽기만 하고 수정하지 않는다. 기획 결과는 `docs/`에 쓴다.

- 기준 문서: [Frontend](../docs/Frontend/CLAUDE.md), [UI/UX 화면 명세](../docs/UI-UX/screens.md)
- 진입점: `src/App.tsx`(인증·화면 분기), `src/views/Viewer/index.tsx`(Viewer 전체, 약 3,600줄)
- API client: `src/api/` (`authApi`, `backofficeApi`, `generationApi`, `viewerAdapter`는 demo용)
- 현재 상태와 다음 할 일은 [docs/Frontend/CLAUDE.md](../docs/Frontend/CLAUDE.md)에서 관리한다.
