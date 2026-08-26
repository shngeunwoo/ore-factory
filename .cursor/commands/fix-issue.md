---
description: Investigate and fix an Ore Factory issue from a short description
argument-hint: [what is broken]
---

이슈: $ARGUMENTS

1. `ai/CONTEXT.md` 와 `docs/manual/` 해당 문서를 읽는다.
2. `src/js/` 에서 증상과 연결된 ES 모듈만 연다 (`domain` / `game` / `ui`).
3. 원인을 고친다. 레이어를 건너뛰는 임시 패치 금지.
4. `npm run check` 를 돌린다.
5. `ai/changelog.md` 에 한 줄, `ai/CONTEXT.md` 초점을 갱신한다.
6. HUD·맵·설치·화로 중 건드린 흐름은 브라우저로 확인했다고 적는다.
