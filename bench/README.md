# 실험 도구

[실험 기록](../docs/records/README.md)을 만든 도구다. 각 파일 첫 주석에 하는 일과 쓰는 법이 있다. 실행은 Node 22.18 이상에서 `node bench/<파일>.mts ...`로 한다(TypeScript를 그대로 실행한다).

## DeepSWE 범위 실험 (R13~R17)

가장 최근이고 가장 근거가 강한 실험이다. 기록은 [baseline-deepswe.md](../docs/records/baseline-deepswe.md)에 있다.

### 준비

- [DeepSWE](https://github.com/datacurve-ai/deep-swe) 커밋 `0b9fabb`를 `git clone -c core.autocrlf=false`로 받는다. 작업 폴더(아래 `<bench>`) 안에 `deep-swe/`로 둔다.
- [Pier](https://pypi.org/project/datacurve-pier/) 0.3.1과 Docker. Windows에서는 Pier의 `pier/environments/agent_setup.py`에서 `write_text` 호출이 CRLF를 쓰지 않게 고쳐야 egress 프록시가 뜬다.
- Claude Code 구독 OAuth 토큰을 `CLAUDE_CODE_OAUTH_TOKEN` 환경변수에 둔다. 스크립트는 셸 환경이나 Windows 사용자 환경변수에서 읽는다.

### 흐름

1. **실행**: `bench/deepswe-batch.sh <bench> <from> <to> [job]`이 과제 목록의 일부를 Pier로 돌린다(동시 10개). Windows에서는 셸 시간 제한에 끊기지 않게 `bench/deepswe-batch-detached.ps1`로 띄운다. 환경변수 `TASKS_FILE`(과제 목록), `TASKS_DIR`(과제 폴더, 방법 변형을 쓸 때), `PIER_EXTRA`로 조건을 바꾼다.
2. **방법 변형 만들기**: `bench/whatelse-tasks.mts`
   - `setup`: 과제와 같은 이미지에서 INSTALL.md로 setup하는 과제를 만든다(레포 규칙 방법).
   - `variants`: setup 결과를 과제 이미지에 얹는다. 새 파일과 지침 파일만 넣고 기존 프로젝트 파일 수정은 뺀다.
   - `tool-variants`: `bench/tools/<방법>/`의 파일을 과제에 넣고 `CLAUDE.append.md`를 CLAUDE.md 끝에 붙인다.
3. **수집과 점검**: `bench/deepswe-collect.mts`(통과, f2p, 비용), `bench/deepswe-audit.mts`(정답·테스트·git 기록·원격 접근 점검).
4. **블라인드 판정 묶음**: `bench/deepswe-blind-multi.mts <bench> <과제 목록> <묶음 폴더> <방법별 실행 폴더>...`가 과제마다 각 방법의 패치를 A, B, C...로 무작위 배정하고 지침·노트 파일을 뺀다. 라벨이 어느 방법인지는 `<묶음>.key.json`에 따로 둔다. 판정자(모델) 2명에게 같은 묶음을 따로 판정하게 한다. 판정 지시문은 기록의 각 절에 있다.
5. **점수**: `bench/deepswe-score-multi.mts`가 [`results/deepswe-scope/`](results/deepswe-scope/packs.json)의 판정을 방법별 범위 누락, 판정자 일치, 과제별 표로 계산한다. 인자 없이 돌리면 기록의 모든 숫자가 다시 나온다.

### 방법 (`tools/`)

각 폴더의 `CLAUDE.append.md`가 그 방법의 지침 원문이다. 방법은 이 파일과 폴더 안 도구로만 정의된다.

| 폴더 | 방법 | 기록 |
| --- | --- | --- |
| `bm25/` | BM25 검색 도구(`.what-else/bm25.py`, 표준 라이브러리만) + 끝내기 전 한 번 돌리라는 지침 | R13~R14 |
| `check-only/` | 끝내기 전 확인 한 단락 | R14 |
| `jev/` | 확인 + Jev 사용 안내(키는 환경변수) | R15 |
| `jev-explore/` | 확인 + 떠올리지 못한 곳을 찾는 용도라고 적은 Jev 안내 | R16 |
| `review/` | 확인 + 맥락 없는 서브에이전트의 두 번째 검토 | R17 |
| `review-accept/` | 확인 + 두 번째 검토 + 받아들이는 기준. 가이드의 기본 두 단계 | R17 |

레포 규칙 방법은 고정 파일이 아니라 매 비교마다 INSTALL.md로 새로 setup했다(`whatelse-tasks.mts setup`).

### 목록

- `deepswe-scope-set.txt`: 범위 실험 집합 14과제(순정이 범위를 반복해서 놓친 과제).
- `deepswe-hard-3x.txt`: 순정이 세 번 모두 실패한 18과제(통과율 기준선).

## 이전 실험 (R1~R12)

Django, pydantic 등에서 케이스를 직접 만들어 돌린 실험이다. 기록은 [phase0-experiment.md](../docs/records/phase0-experiment.md)와 [e2e-benchmark.md](../docs/records/e2e-benchmark.md)에 있다.

| 단계 | 파일 |
| --- | --- |
| 케이스 만들기 | `list-cases.mts`, `make-case.mts`, `commit.mts`, `make-real-case.mts`, `make-pro-case.mts`, `snapshot.mts`, `check-syntax.mts` |
| setup과 실행 | `setup.mts`, `run-agent.mts`, `run-task.mts`, `run-e2e.mts`, `run-cascade.mts`, `prompts/` |
| Jev 검색 | `jevgrep.mts`, `scan.mts`, `units.mts`, `make-query.mts`, `simulate-shortlist.mts`, `../src/jev/` |
| 채점과 비교 | `score.mts`, `score-real.mts`, `judge-misses.mts`, `compare.mts`, `summary.mts`, `findability.mts`, `conformance.mts`, `cochange.mts` |

원시 실행 데이터(에이전트 기록, 패치)는 크기 때문에 레포에 넣지 않았다. 판정 결과와 수치는 기록 문서와 `results/`에 있다.
