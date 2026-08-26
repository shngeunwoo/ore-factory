# Ore Factory

AI 브리프. 세션 시작 시 이 파일과 `docs/manual/index.md`를 기준으로 한다.

## 한 줄

바닐라 격자 공장 게임. 캐고 · 굽고 · 레일로 팔기.
네이티브 ES 모듈, `OF2` 저장 코드·`.txt` 파일.

## 필독

`src/` 수정 전 `docs/manual/index.md` → 해당 매뉴얼.

## 명령

```powershell
cd c:\dev\ore-factory
powershell -File tools/serve.ps1
# 또는
python -m http.server 8877 --bind 127.0.0.1
```

브라우저: http://127.0.0.1:8877/

## 레이어

- Agent: `.cursor/rules`, `.cursor/commands`, `.cursor/skills`, `ai/agents`
- Context / Memory: `ai/`
- Tool: `tools/`
- Knowledge: `docs/manual/`
- Infra: `index.html`, `src/`

상세: `docs/manual/03-vibe-layers.md`

## 코드

엔트리: `src/js/ui/main.js` (`type="module"`)  
의존 방향: `ui → game → domain`  
도메인 숫자: `src/js/domain/recipes.js` 만.

## 금지

- React/Vue/번들러
- `domain/`, `game/` 에서 DOM
- `window.OF` 전역
- `.claude/` 추가
- 매뉴얼 없이 `src/` 수정
