# 바이브 코딩 레이어

AI는 프롬프트만 넣는 게 아니라, 아래 7층 위에서 일한다.
Claude Code의 rules / commands / skills / agents / hooks 를 **Cursor 쪽 위치**에 대응시킨다. `.claude/` 폴더는 쓰지 않는다.

```
01 Agent          누가, 어떤 규칙으로 코드를 만지나
02 Context        지금 세션에서 뭐가 열려 있나
03 Memory         예전에 뭘 바꿨고 뭘 결정했나
04 Tool           에이전트가 실행하는 스크립트
05 Model          Cursor (저장소 밖). 레포에 LLM 없음
06 Knowledge      게임·구조의 진실
07 Infrastructure 브라우저에서 실제로 도는 것
```

| # | 층 | 이 레포 |
|---|-----|---------|
| 01 | Agent | `AGENTS.md`, `.cursor/rules/`, `.cursor/commands/`, `.cursor/skills/`, `ai/agents/` |
| 02 | Context | `ai/CONTEXT.md`, `ai/plan.md` |
| 03 | Memory | `ai/changelog.md`, `ai/qa.md` |
| 04 | Tool | `tools/serve.ps1`, `tools/validate.js`, `node --test` |
| 05 | Model | Cursor. 모델 파일 없음 |
| 06 | Knowledge | `docs/manual/` |
| 07 | Infrastructure | `index.html`, `src/`, 로컬 정적 서버 |

## 작업 순서

1. Knowledge (`docs/manual/`) 해당 문서
2. Context (`ai/CONTEXT.md`) — 지금 초점
3. `src/` 수정
4. `npm run check`
5. Memory (`ai/changelog.md`) 한 줄
6. Tool로 서버 띄워 브라우저 확인

## 하지 말 것

- 게임 코드를 `agent/` `memory/` 같은 메타 폴더에 넣기
- Claude Code용 `.claude/` 를 이 레포에 복제
- Knowledge를 `src/` 주석에만 남기고 매뉴얼을 안 고치기
