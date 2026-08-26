---
description: Review Ore Factory diff against manuals and OF layers
---

현재 워크트리 변경을 리뷰한다.

1. `docs/manual/index.md` 기준으로 어떤 매뉴얼이 해당하는지 고른다.
2. `src/` 가 `docs/manual/02-architecture.md` 레이어를 지키는지 본다.
3. 밸런스 숫자가 `src/js/domain/recipes.js` 밖으로 새었는지 본다.
4. 파일 단위로: 버그 / 레이어 위반 / 매뉴얼 불일치. 스타일 취향은 적지 않는다.

출력:

- 막아야 할 것
- 고쳐야 할 것
- 나중에 해도 되는 것
