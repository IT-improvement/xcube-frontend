# Frontend authentication policy (v1)

- The Access Token is held in `sessionStorage` under `xcube-access-token` so it is removed when the browser session ends.
- Passwords are never stored. Tokens are never placed in URLs or logs.
- There is no Refresh Token endpoint in v1. Any HTTP 401 clears the local session and returns the user to the login flow.
- Logout is currently client-side token removal because Authentication Service has no logout/revocation endpoint.
- Production should prefer short-lived Access Tokens and an HttpOnly, Secure, SameSite Refresh Token cookie once the Backend contract exists.
- Real API mode is the default. Demo data requires the explicit `REACT_APP_USE_MOCK_API=true` opt-in.
- Dataset/project metadata and protected management operations go through Backoffice (`http://localhost:8082`).
- Raster visualization tiles: in development they come straight from the official XCube Server (`http://localhost:8080`, public tiles) or the owner's pod. In deployment (SEC1) Backoffice gives same-origin `tileBaseUrl`s (`/xcube/u{id}`, `/xcube/main`) and the build sets `REACT_APP_XCUBE_URL=/xcube/main`; every same-origin tile request carries `Authorization: Bearer` (refreshed once on 401) and the gateway asks Backoffice whether this user may read that dataset.
