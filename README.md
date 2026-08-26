# Ore Factory

광석을 캐고, 제련하고, 레일 자동화로 판매하는 산업/SF 격자 공장 게임.
프레임워크·번들러 없이 네이티브 ES 모듈로 실행된다.

## 주요 기능

- 길게 누르는 수동 채굴과 레일 위 인라인 제련
- 상점 연결 없이 동작하는 방향 레일, 막다른 바닥 드롭·클릭 수집
- 창고·필터 분배기와 현장 T2/T3 업그레이드
- 발전기·전봇대·배터리 지역 전력망
- 연구 트리·자동 연구소·이벤트 퀘스트와 즉시 보상
- 연속 레일 설치, 전액 회수 철거, 맵 확대·축소
- 레일 클릭 후 북·동·남·서 포트와 자동/수동 화물 출구 개별 설정
- `OF2` 저장 코드·`.txt` 파일로만 진행 보존. 브라우저 저장소·쿠키 없음
- 마우스·터치·키보드 조작 및 반응형 제작 패널

## 실행

```powershell
git clone https://github.com/shngeunwoo/ore-factory.git
cd ore-factory
npm run check
powershell -File tools/serve.ps1
```

브라우저: http://127.0.0.1:8877/

저장은 브라우저에 남지 않는다. 설정에서 OF2 코드를 복사하거나 `.txt`로 내려받고, 붙여넣기 또는 파일 열기로 복원한다. GitHub는 소스만 보관한다.

저장소: https://github.com/shngeunwoo/ore-factory

## 조작

- 광석 길게 누르기: 수동 채굴
- 바닥 화물 클릭: 해당 타일 화물 전량 수집
- 설비/레일 클릭: 흐름·필터·연료·업그레이드 설정
- 숫자 `1`–`9`: 제작 도구 선택
- `0`: 철거 모드
- 방향키: 맵 타일 이동
- `Space`: 키보드 채굴
- `Esc` / 우클릭: 현재 도구 취소

## 문서

- [개요](docs/manual/00-overview.md)
- [게임 규칙](docs/manual/01-game-design.md)
- [아키텍처](docs/manual/02-architecture.md)
- [AI 레이어](docs/manual/03-vibe-layers.md)
- [AI 브리프](AGENTS.md)

`src/` 수정 전 `docs/manual/index.md`부터 읽는다.
