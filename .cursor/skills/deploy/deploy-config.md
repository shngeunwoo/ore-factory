# Deploy config

| 항목 | 값 |
|------|-----|
| 포트 | 8877 |
| 바인드 | 127.0.0.1 |
| 루트 | `c:\dev\ore-factory` (`index.html` 이 여기) |
| 엔트리 | `/` → `index.html` |
| Pages | Actions `.github/workflows/pages.yml` → https://shngeunwoo.github.io/ore-factory/ |

캐시: `index.html` 스크립트/CSS `?v=` 쿼리. 파일 바꿀 때 증가.
