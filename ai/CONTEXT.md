# Context — Ore Factory

## What

확장형 격자 공장 게임. 수동 채굴 → 판매 → 제련 → 연구 → 채굴기 자동화.

## Stack

바닐라 HTML/CSS/JS, 브라우저 네이티브 ES 모듈. 서버·번들러 없음.
진행은 `OF2` 저장 코드·`.txt` 파일로만 보존. 브라우저 저장소 없음.

## Architecture

- `domain/`: 밸런스·아이템·건물 SSOT
- `game/`: 상태·월드·시뮬레이션·저장. DOM 금지
- `ui/`: 입력·타일 렌더·HUD·패널·FX
- 의존 방향 `ui → game → domain`

## Current focus

방향 기반 독립 물류 v2. 레일 위 인라인 화로, 바닥 드롭/수집, 창고·필터,
연구·퀘스트·현장 업그레이드·지역 전력망이 통합됐다.
이후 변경은 `npm run check`와 브라우저 플레이를 모두 통과해야 한다.

## Key paths

- 규칙: `docs/manual/01-game-design.md`
- 레이어: `docs/manual/02-architecture.md`
- 밸런스: `src/js/domain/recipes.js`
- 엔트리: `src/js/ui/main.js`
- 전력: `src/js/game/power.js`
- 진행: `src/js/game/progression.js`
- 저장 코드: `src/js/game/persistence.js`
- 테스트: `tests/game.test.js`, `tests/persistence.test.js`

## Do not

- `.claude/` 생성
- 매뉴얼 없이 `src/` 수정
- `domain/`, `game/`에서 DOM 접근
- `window.OF`, 번들러, 런타임 프레임워크 추가
