---
name: deploy
description: Serve or check the static Ore Factory game. Use when the user says deploy, 서버, 실행, 로컬 서버, GitHub Pages, or ship.
---

# Deploy (static)

백엔드 없음. 배포 = 정적 파일 제공.

## Local

```powershell
cd c:\dev\ore-factory
npm run check
powershell -File tools/serve.ps1
```

http://127.0.0.1:8877/

정적 검증이나 회귀 테스트가 실패하면 서버를 띄우지 않는다.

설정: [deploy-config.md](deploy-config.md)

## Pages (아직 없음)

GitHub Pages를 넣을 때는 `docs/manual/` 에 배포 문서를 추가한 뒤, 이 스킬과 `deploy-config.md` 만 고친다. `src/` 레이어는 그대로 둔다.
