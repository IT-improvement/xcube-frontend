# xcube-frontend

소개 홈, 로그인, 관리 화면, Viewer (포트 `3000`). 기본은 Codex가 구현하고 Claude는 읽기만 한다. 사용자가 지시한 단계는 Claude가 직접 구현한다(M3·M4·M5).

- 기준 문서: [Frontend](../docs/Frontend/CLAUDE.md), [UI/UX 화면 명세](../docs/UI-UX/screens.md)
- 진입점: `src/App.tsx`(라우트), `src/auth/`(AuthProvider·RequireAuth), `src/pages/`(LandingPage·AuthPage), `src/app/`(M4 관리 화면: AppShell, pages, wizard, `api.ts`), `src/components/ui/`(공통 UI, `kit.tsx`), `src/styles/tokens.css`, `src/views/Viewer/`(Viewer, ViewerTour, `viewer.css`)
- API client: `src/api/` (`authApi`, `backofficeApi`, `generationApi`, `viewerAdapter`는 demo용)
- 현재 상태와 다음 할 일은 [docs/Frontend/CLAUDE.md](../docs/Frontend/CLAUDE.md)에서 관리한다.
