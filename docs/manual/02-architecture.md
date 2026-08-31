# 아키텍처

## 코드 레이어

```
ui/      입력, DOM 렌더, HUD, 패널, FX, rAF 루프
game/    인벤, 월드, 건물 시뮬, 저장 코드. DOM 금지
domain/  숫자·이름·레시피·공식. DOM·game·ui 금지
```

의존 방향은 `ui → game → domain` 한 방향이다. 게임 상태 변경은 이벤트로 UI에
알리고, 타일 객체에는 DOM 참조를 저장하지 않는다.

## 엔트리

`index.html`은 `src/js/ui/main.js` 하나만 `type="module"`로 로드한다. 하위 모듈
순서는 `import` 그래프가 결정하며 전역 `window.OF`는 사용하지 않는다.

## 모듈

| 파일 | 책임 |
|------|------|
| `src/js/domain/recipes.js` | 아이템, 판매가, 시간, 건물, 밸런스 공식 |
| `src/js/game/inventory.js` | 게임 상태, 경제, 발견, 이벤트 |
| `src/js/game/map.js` | 격자, 확장, 상점, 직렬화 가능한 월드 |
| `src/js/game/buildings.js` | 설치·철거, 제련, 채굴기, 레일 시뮬 |
| `src/js/game/power.js` | 지역 전력망, 발전·축전·공급률 |
| `src/js/game/progression.js` | 연구, 퀘스트, 현장 업그레이드 |
| `src/js/game/persistence.js` | `OF2` 저장 코드 인코딩·검증 |
| `src/js/ui/map-view.js` | 타일 DOM과 맵 렌더 |
| `src/js/ui/fx.js` | 이동·채굴 시각/음향, 충격파·파티클 캡. 판매는 400ms 스로틀 텍스트·효과음 |
| `src/js/ui/panels.js` | 연구·퀘스트 패널의 순수 마크업 |
| `src/js/ui/main.js` | 명령 연결, HUD·패널, 입력, rAF 루프 |

## 타일

```
{ x, y, ore, rail, building, powerNode, cargo, groundItems, moveAcc, shopPart }
```

- `ore` — 땅의 광석. 채굴기 조건
- `rail` — 연결 포트·출력·티어를 가진 운송 레이어
- `building` — furnace / miner / storage / router / generator / battery / lab / shop
- `powerNode` — 다른 레이어와 겹쳐 설치되는 pole
- `cargo` — 레일 위 화물 1개와 진입 방향
- `groundItems` — 바닥의 종류별 `{ type, amount }` 스택

레일은 `{ connections: { n, e, s, w }, output, routeCursor }`를 가진다.
`output`은 `auto` 또는 방향 하나다. 레일끼리는 서로 마주 보는 포트가 모두 열려야
연결되며, 방향 흐름·수동 출구·렌더가 같은 연결 판정을 사용한다.
화로와 필터 분배기는 `building` 레이어에서 같은 칸의 `rail`을 처리한다. 필터
분배기는 `{ routes: { n, e, s, w } }`에 방향별 품목을 저장하며 기존 단일
`filter`/`filterOutput` 데이터는 읽을 때 자동 변환한다.
연구소는 `{ stocks }` 버퍼를 가진다. 출력이 가리키는 인접 레일 화물과 검사 패널
수동 투입을 받고, `progression.js`가 버퍼에서 연구점 비용을 차감한다.

## 시스템 조립

`main.js`는 `GameStore`, `World`, `PowerSystem`, `ProgressionSystem`,
`FactorySimulation`을 조립한다. 프레임 순서는 전력 계산 → 진행 시스템 →
공장 시뮬레이션이다. 새 시스템도 상태를 직접 렌더하지 않고 이벤트만 발행한다.

## 저장 v2

진행은 브라우저에 남기지 않는다. 휴대용 저장 코드가 같은 v2 스냅샷 JSON을
`OF2.<checksum>.<base64url>` 형식으로 감싸며, 가져오기 전에 체크섬과
`parseSave` 구조 검증을 모두 통과해야 한다. UI는 같은 코드를 붙여넣거나
`.txt` 파일로 저장·연다. 예전 `localStorage` 키는 시작 시 제거한다.

## 결합 규칙

- `domain/`, `game/`에서 `document`, `window`, DOM 타입 사용 금지
- game은 `state`, `tile`, `money`, `cargoMove`, `sale` 같은 이벤트만 발행
- UI는 game 상태를 읽고 명령 API를 호출하며 상태를 직접 변경하지 않음
- 타일 시각 상태는 `map-view.js`가 단독 소유
- 밸런스 매직 넘버는 `recipes.js`만. 시뮬 파일에 가격·시간 하드코딩 금지
- 저장 스냅샷은 DOM·타이머·함수를 포함하지 않음

## 루프

`requestAnimationFrame` → `updateMining(dt)` + `updateHoldPickup(dt)` + 전력 → 진행 → 공장 시뮬.
`dt` 상한은 `recipes.js`의 밸런스 값으로 제한한다.

타일 DOM 자식은 생성 시 캐시한다. 채굴기·화로·연구소 진행률만 바뀌면 작업 게이지만
갱신하고, `state`는 이유별로 HUD·제작·연구 패널을 나눈다. 레일 경로·전력 변동은
설비·레일·화물이 있는 칸만 다시 그린다.

## 새 모듈

1. 순수 규칙인가, 상태/시뮬인가, 표현인가?
2. 하위 레이어가 상위 레이어를 import하지 않는가?
3. Node 테스트에서 DOM 없이 실행 가능한가?
