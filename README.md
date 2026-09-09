# xcube frontend

React/TypeScript 기반 xcube 웹 애플리케이션입니다.

## 실행

```bash
npm ci
npm start
```

프로덕션 이미지는 `docker build -t xcube-frontend .`로 빌드합니다. 전체 스택은
`xcube-database` 저장소의 Docker Compose 또는 Kubernetes 매니페스트로 실행합니다.
