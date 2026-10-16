# frontend
xcube frontend

## 관리자 콘솔 링크 (UR-62)

관리자 화면은 별도 앱 `xcube-admin-frontend`(`/admin`)로 옮겼다. 이 앱에는 관리자 화면이 없고, ADMIN 계정의 상단 바·모바일 메뉴·계정 메뉴에 있는 `관리자`가 그 콘솔로 보낸다(같은 탭). 예전 주소 `/app/admin`은 ADMIN이면 콘솔로 넘기고, 다른 등급은 일반 404를 본다.

| 환경 | 주소 |
|---|---|
| 배포 | 같은 출처 `/admin` (빌드 인자 `REACT_APP_ADMIN_URL=/admin`, 비어 있어도 production 빌드는 `/admin`) |
| 개발 | `REACT_APP_ADMIN_URL`(예: `.env.development.local`에 `REACT_APP_ADMIN_URL=http://192.168.75.112:3010/admin`). 없으면 지금 연 호스트의 `:3010/admin` |
