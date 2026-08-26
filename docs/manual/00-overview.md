# Ore Factory — 개요

격자 위에서 광석을 캐고, 화로로 굽고, 레일로 실어 파는 공장 게임.

프레임워크·번들러 없이 브라우저 네이티브 ES 모듈로 실행하는 HTML/CSS/JS 게임.
진행은 `OF2` 휴대용 저장 코드(붙여넣기 또는 `.txt` 파일)로만 보존한다. 브라우저 저장소·쿠키는 쓰지 않는다.

## 핵심 루프

1. 광석을 길게 눌러 채굴 (50% 돌 보너스)
2. 3×3 상점에서 판매
3. 방향 레일 위 인라인 화로 → 석탄+원광 → 주괴
4. 창고·필터·채굴기로 상점과 무관한 물류 자동화
5. 연구·퀘스트·지역 전력망·현장 업그레이드
6. 맵 가장자리를 돈으로 한 줄 확장

## 저장소 구조

```
AGENTS.md            AI 세션 시작용 브리프
docs/manual/         Knowledge — 설계 SSOT. src 수정 전 필독
.cursor/rules/       Agent — 지속 규칙
.cursor/commands/    Agent — 반복 워크플로
.cursor/skills/      Agent — 필요할 때만 로드
ai/                  Context + Memory
ai/agents/           서브에이전트 역할
tools/               Tool — 로컬 서버·검증
tests/               순수 게임 규칙 회귀 테스트
src/                 Infrastructure 위 게임 런타임
  js/domain/         데이터·상수 (DOM 금지)
  js/game/           상태·월드·시뮬·저장 (DOM 금지)
  js/ui/             입력·렌더·HUD·FX·루프
  css/               토큰·레이아웃·게임 렌더
index.html           엔트리
```

왜 이렇게 나눴는지는 `03-vibe-layers.md`.

## 스택

| 영역 | 선택 |
|------|------|
| 언어 | 브라우저 JavaScript |
| 모듈 | 네이티브 ES 모듈 (`type="module"`) |
| 서버 | `python -m http.server` (tools/serve) |
| 저장 | `OF2` 코드·`.txt` 파일, 스키마 v2 · 브라우저 저장소 없음 |

## 용어

| 용어 | 의미 |
|------|------|
| 타일 | `{ x, y, ore, rail, building, powerNode, cargo, groundItems, moveAcc, shopPart }` |
| 화물 | 레일 칸의 `cargo` 1개. 목적지 없으면 `groundItems` 스택 |
| 해금 | 연구 기술로 건물·티어 잠금 해제. 설치·업그레이드는 별도 재료 |
| 발견 | 획득·자동 판매를 포함해 처음 접한 아이템. 그 전에는 UI에 `???` |
| 연구 | 연구점을 써 기술·건물·상위 티어를 해금 |
| 전력망 | 발전기·전봇대·배터리·소비 설비가 만든 지역 연결망 |
