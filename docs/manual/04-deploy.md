# 배포

정적 파일만 제공한다. 서버 로직 없음.

## 로컬

```powershell
cd c:\dev\ore-factory
npm run check
powershell -File tools/serve.ps1
```

http://127.0.0.1:8877/

## GitHub Pages

소스: GitHub Actions 워크플로 `.github/workflows/pages.yml`.
`index.html`과 `src/`만 올린다. 진행 중인 배포는 취소하지 않는다.

플레이 URL: https://shngeunwoo.github.io/ore-factory/
