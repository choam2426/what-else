# Baseline: 순정 Claude Code on DeepSWE

- 시작: 2026-09-30
- 상태: 완료 (2026-10-02). 다음 방법들의 기준은 아래 "고정 baseline"
- 목적: 공개 벤치에서 순정 에이전트가 변경을 얼마나 완성하는지, 무엇을 놓치는지 재고, 그 위에서 what-else 같은 방법이 실패를 줄이는지 본다.

## 설계 (2026-09-30 합의)

모든 과제를 여러 번 돌리지 않고, 순정이 실패하는 과제에 집중한다.

1. **선별**: 113개 전부를 순정으로 1회 돌려 실패한 과제를 모은다. 이 실행은 비교에 쓰지 않는다.
2. **어려운 과제 집합**: 실패한 과제마다 순정을 새로 2회 더 돌린다. 이 새 실행이 비교 기준이다. 한 번 실패한 과제는 다시 돌리기만 해도 일부가 통과하므로(평균으로의 회귀), 선별 실행과 비교하면 방법의 효과가 부풀려진다.
3. **방법 적용**: 같은 과제에 INSTALL.md로 setup한 구성을 넣고 2회 돌린다. 통과율, f2p, 놓친 요구사항 수를 과제별로 짝지어 비교한다. setup이 진단에 쓰는 git 기록은 upstream에서 기준 커밋까지만 받는다. DeepSWE 정답은 upstream에 합쳐진 적이 없어 새지 않는다.
4. **대조군**: 선별에서 통과한 과제 약 10개에도 방법을 적용해, 멀쩡하던 과제를 망치지 않는지와 비용 증가를 본다.

외부 참고치: 공식 리더보드는 mini-swe-agent(bash 하나)로 쟀고, Claude Sonnet 5 [max] 54%, Opus 5 [max] 74%, Fable 5 [xhigh] 70%다 (2026-09-30 확인). Claude Code + Sonnet 5.5 기본 effort 공개 결과는 없다. harness와 모델이 달라 직접 비교하지 않는다.

## 왜 DeepSWE인가

- **요청이 구현 전에 쓴 기능 요청이다.** 엔지니어가 과제를 처음부터 쓰고 upstream에 합치지 않았다. 요청은 약 2,000자이고 인터페이스 힌트가 없다 ([논문](https://arxiv.org/abs/2607.07946)).
- **동작 검증기로 채점한다.** 공개 API와 출력만 보므로 구현 방식이 달라도 요청한 기능이 되면 통과한다. 이 레포가 배운 "누락은 에이전트 자신의 구현 기준으로 판정한다"와 맞는다.
- **여러 파일에 걸친 변경이다.** 참조 정답은 과제당 평균 7.4개 파일(테스트 제외), 590줄을 추가한다. 113개 중 111개가 3개 파일 이상, 72개가 5개 파일 이상이다.
- **오염 위험이 낮다.** 과제가 원본이고 얕은 클론으로 주어져 git 기록으로 정답을 볼 수 없다.
- **논문이 우리 문제를 직접 관찰했다.** Claude 구성이 요청에 나열된 요구사항을 가장 자주 놓치고, 그 약 2/3가 "한 갈래만 구현" 유형이다.
- 한계: 문서 파일이 든 과제가 3개뿐이라 문서·릴리스 노트 누락은 재지 못한다. 그쪽은 Django 기록(R10~R11)이 다룬다.

## 조건

| 항목 | 값 |
| --- | --- |
| 벤치 | DeepSWE (datacurve-ai/deep-swe, 커밋 `0b9fabb`, 2026-08-26), 과제 113개 (TS 35, Go 34, Python 34, Rust 5, JS 5) |
| 실행기 | Pier 0.3.1 (Harbor 0.23.0), 로컬 Docker (Docker Desktop 29.8, WSL2) |
| 에이전트 | Claude Code 2.1.285, 순정 (추가 지시·skill·MCP 없음), Pier 기본 설정 (`--permission-mode=bypassPermissions`, 과제 요청 그대로) |
| 모델 | `claude-sonnet-5-5`, effort 기본값 |
| 인증 | 구독 OAuth 토큰. 비용은 Claude Code가 보고한 정가 환산값 |
| 과제 순서 | 과제 이름 정렬 후 `random.Random(0).shuffle` (`order-seed0.txt`). 배치는 이 순서대로 10개씩 |
| 동시 실행 | 배치 1은 2, 배치 2부터 10 (컨테이너당 상한 CPU 2, RAM 8GB. 실제 사용은 1GB 안팎) |
| 반복 | 선별 1회. 실패한 48개만 순정 1회 더 (설계 2를 1회로 줄임, 2026-10-01 합의) |

도구: `bench/deepswe-batch.sh` (배치 실행), `bench/deepswe-collect.mts` (수치 수집).

## 지표

- **주 지표**: 검증기의 통과(reward), 새 기능 테스트 통과율(f2p), 기존 테스트 통과율(p2p).
- **참고 지표**: 참조 정답 파일 중 에이전트가 건드린 비율. 구현이 다르면 참조 파일을 안 건드리고도 통과한다(파일럿의 tengo: `call.go` 대신 새 파일 `callable.go`에 구현하고 통과). 그래서 누락으로 세지 않고, 실패한 과제의 원인을 볼 때만 쓴다.
- **실패 분석**: 실패한 과제마다 놓친 요구사항과 그 종류(요구사항 갈래, 형제 구현, 호출부, 경계 등)를 분류한다.
- 비용, 에이전트 시간, 턴 수.

## 무결성 점검

- 실행마다 도구 호출을 훑어 정답 폴더(`solution`), 테스트 폴더, git 기록(`git log`/`show`), 원격 접근이 있었는지 본다. 파일럿 3개에서는 없었다.
- 인프라 실패(모델 호출 전 실패)는 `jobs/_infra-failed/`로 옮기고 결과에서 뺀다.

## 결과

### 파일럿 (순서 1~3)

| 과제 | 언어 | 결과 | 비용 | 시간 | 턴 | 참조 파일 |
| --- | --- | --- | --- | --- | --- | --- |
| true-myth-iterable-collection-combinators | TS | 통과 | $0.45 | 119초 | 14 | 4/4 |
| testem-per-launcher-reports | JS | 통과 | $0.22 | 67초 | 7 | 6/6 |
| tengo-callable-instance-isolation | Go | 통과 | $0.37 | 137초 | 12 | 3/4 |

### 선별 (순서 4~113)

배치 1 (4~13, 동시 2): 6/10 통과. 실패 4개(eicrud-keyset-pagination-cursor f2p 0.71, igel-persist-feature-schema 0.96, koota-query-predicates 0.95, sqlfmt-create-table-ddl-formatting 0.94)는 모두 기능의 일부만 빠진 경우였다. 평균 $0.76, 348초 (파일럿 포함 13개 기준).

배치 2 (14~23, 동시 10): 6/10 통과. 실패 4개: actionlint-action-pinning-lint f2p 0.98, claude-code-by-agents-recursive-delegation 0.29, koota-deferred-mutation-buffer 0.97, optique-conditional-option-dependencies 0.94. 평균 $0.55, 281초. 무결성 점검 0건.

배치 3 (24~33, 동시 10): 채점된 9개 중 4개 통과. 실패 5개: bandit-incremental-cache-control f2p 0.99, effect-sse-httpapi-streaming 0.98, httpx-streaming-json-iteration 0.96, katex-multicolumn-array-spans 0.98, textual-kitty-key-phases 0.83. 평균 $0.48, 266초. scriggo-method-declarations는 에이전트가 끝낸 뒤(167턴, $9.44) 패치 수집 단계에서 docker.exe가 0xC0000142로 죽은 인프라 실패라 다시 돌린다(아래 환경 함정).

배치 4 (34~43, 동시 10) + scriggo 재실행: 11개 중 8개 통과. 실패 3개: boa-hierarchical-evaluation-cancellation f2p 0.94, goreleaser-retry-publish-auditing 0.24, httpx-deterministic-cookie-store(f2p 1.00이지만 기존 테스트 `test_exported_members` 하나를 깨뜨림: 새 공개 API `CookieStore`를 `__all__` 정렬 규칙에 맞게 넣지 않음. 새 공개 API에 딸린 export 목록이라는 레포 관례를 놓친 전형적인 누락). scriggo는 재실행에서 통과($2.82, 67턴). 평균 $0.77, 466초.

누적 43개: 27개 통과(63%), 평균 $0.66, 345초. 무결성 점검 0건.

배치 5 (44~53): 7/10 통과. 실패 3개: anko-typed-variable-bindings f2p 0.33, participle-grammar-conflict-analysis 0.99, ytt-jsonpath-query-api 0.96. 평균 $0.38, 189초. 점검 1건(`git branch -a; git remote -v`, 목록 조회라 정답에 닿지 않음).

누적 53개: 34개 통과(64%), 평균 $0.60, 316초.

배치 6 (54~63): 5/10 통과. 실패 5개: clack-async-autocomplete-options f2p 0.99, dateutil-rfc5545-timezone-interop 0.97, obsidian-linter-link-format-conversion 0.97, superjson-error-stack-serialization 0.99, tengo-destructuring-bindings 0.97. 평균 $0.40, 146초. 점검 0건.

누적 63개: 39개 통과(62%), 평균 $0.57, 289초.

배치 7 (64~73): 5/10 통과. 실패 5개: arcane-drift-detection-baselines f2p 0.80, bandit-interprocedural-taint-checks 0.98, quill-shared-toolbar-focus 0.92, updo-policy-alerting 0.94, vulture-persistent-analysis-cache(f2p 1.00, 기존 테스트 하나를 깨뜨림). 평균 $0.47, 234초. 점검 0건.

누적 73개: 44개 통과(60%), 평균 $0.56, 281초.

배치 8 (74~83): 8/10 통과. 실패 2개: obsidian-linter-auto-table-of-contents f2p 0.90, scc-bounded-memory-spilling 0.90. 평균 $0.53, 236초. 점검 0건.

누적 83개: 52개 통과(63%), 평균 $0.55, 276초.

배치 9 (84~93, 한도 초과로 재실행): 5/10 통과. 실패 5개: csstree-shorthand-expansion-compression f2p 0.92, go-critic-doc-link-checker 0.67(기존 테스트도 0.94), helm-array-merge-strategies(f2p 1.00, 기존 테스트 0.83으로 깨뜨림), obsidian-linter-scoped-ignore-markers 0.00, prometheus-typed-label-sorting 0.94. 평균 $0.43, 304초. 점검 0건.

누적 93개: 57개 통과(61%), 평균 $0.54, 279초.

배치 10 (94~103): 3/10 통과. 실패 7개(f2p 0.93~0.99): bandit-structured-nosec-directives(기존 테스트도 0.99), expr-try-catch-errors, gql-incremental-graphql-delivery, happy-dom-deterministic-intersectionobserver, ink-grid-box-layout, meriyah-explicit-resource-declarations, termenv-preserve-ansi-resets. 평균 $0.61, 288초. 한도 초과 0건, 점검 0건.

누적 103개: 60개 통과(58%), 평균 $0.55, 280초.

배치 11 (104~113): 5/10 통과. 실패 5개: kea-atomic-signal-selectors f2p 0.92, kombu-single-active-consumer-priority 0.98, mnamer-daemon-watch-lifecycle 0.98, numba-stencil-boundary-modes 0.79, testem-bail-on-test-failure 0.96. 평균 $0.77, 303초. 한도 초과 0건, 점검 0건.

### 선별 요약 (113개 × 1회)

| 항목 | 값 |
| --- | --- |
| 통과 | 65/113 (58%) |
| 언어별 통과 | TS 18/35, Go 20/34, Python 21/34, JS 2/5, Rust 4/5 |
| 평균 f2p (새 기능 테스트 통과율) | 0.95 |
| 실패 48개 중 f2p 0.9 이상 | 39개 (거의 다 하고 일부 요구사항을 빠뜨림) |
| 실패 48개 중 기존 테스트를 깨뜨림 (p2p < 1) | 8개. 그중 3개는 새 기능은 완벽(f2p 1.00)하고 기존 동작만 깨뜨림 (httpx-deterministic-cookie-store, vulture-persistent-analysis-cache, helm-array-merge-strategies) |
| 비용 | 합계 $64.20, 평균 $0.57 |
| 시간 | 평균 282초 (에이전트 기준) |
| 무결성 점검 | 113개 중 1건 (목록 조회 `git branch -a; git remote -v`, 정답에 닿지 않음) |
| 인프라 실패로 다시 돌린 것 | 11개 (셸 종료 1, 사용 한도 10). 결과에서 뺐다 |

외부 참고치(mini-swe-agent, 공식 리더보드)와는 harness와 모델이 달라 직접 비교하지 않는다. 실패 48개 목록은 `what-else-bench/hard-set.txt`, 실행별 수치는 `what-else-bench/screening.json`에 있다.

**실패의 모양.** 실패는 대부분 "기능은 거의 다 구현했는데 요구사항 한두 갈래를 빠뜨림"이다. 이 레포가 풀려는 "함께 바꿔야 할 곳을 놓침"과 같은 모양이고, 논문의 관찰("나열된 요구사항 누락", "한 갈래만 구현")과도 맞는다. 새 기능은 완벽하지만 기존 동작을 깨뜨린 3개는 경계·관례 축의 누락이다(예: httpx는 새 공개 API를 `__all__` 정렬 규칙에 맞게 넣지 않음).

## 환경 함정

- 전역 `core.autocrlf=true`로 DeepSWE를 받으면 셸 스크립트와 패치가 CRLF가 되어 채점이 깨진다. `git clone -c core.autocrlf=false`로 받는다.
- 구독 세션 한도에 걸리면 Claude Code가 429("You've hit your session limit")로 끝나고 Pier는 `NonZeroAgentExitCodeError`로 기록한다. 배치 9 첫 시도 10개가 5~11턴 만에 모두 이렇게 끝났다. 모델 실패로 세지 않고 `jobs/_infra-failed/usage-limit/`로 옮겨 한도가 풀린 뒤 다시 돌린다.
- Pier를 부른 셸이 제한 시간에 끊기면 Pier는 살아남지만, 그 뒤 Pier가 띄우는 docker.exe가 0xC0000142(콘솔 초기화 실패)로 죽는다. 에이전트가 끝낸 작업도 패치 수집에서 잃는다. 배치는 `bench/deepswe-batch-detached.ps1`로 셸과 분리해 띄운다. 같은 초에 두 배치를 띄우면 작업 폴더 이름이 겹쳐 하나가 실패한다.
- Pier 0.3.1은 Windows에서 egress 프록시 스크립트와 Dockerfile을 `write_text`로 써서 CRLF가 되고, 프록시가 뜨지 않는다. 설치된 `pier/environments/agent_setup.py`의 `write_text` 4곳에 `newline="\n"`을 주어 고쳤다 (원본은 `.orig`).

### 순정 재실행 (선별 실패 48개 × 1회)

| 항목 | 값 |
| --- | --- |
| 다시 돌려 통과 | 19/48 (40%) |
| 두 번 모두 실패 | 29개, 레포 26개 (`what-else-bench/hard-core.txt`) |
| 그중 두 번 모두 f2p 0.9 이상 | 23개 |
| 비용 | 합계 $24.98, 평균 $0.52 |
| 무결성 점검 | 2건, 모두 목록 조회 `git branch -a; git remote -v` |

선별에서 한 번 실패한 과제의 40%는 순정을 다시 돌리기만 해도 통과했다. 선별 실행과 비교했다면 이 몫이 방법의 효과로 보였을 것이다. 방법의 효과는 이 재실행(19/48)과 비교한다. 실행별 수치는 `what-else-bench/rerun.json`.

두 번 모두 실패한 29개는 대부분 매번 기능의 일부만 빠뜨린다(23개가 두 번 다 f2p 0.9 이상). 방법이 효과를 내야 할 곳이 여기다.

## what-else 적용 (레포 규칙, 기본값 setup)

### 방법

- **setup**: (레포, 기준 커밋)마다 과제와 같은 이미지에 `/what-else`(INSTALL.md, guide/ 사본)를 넣고, 순정 Claude Code(Sonnet 5.5)에게 "what-else를 이 프로젝트에 세팅해 줘. 답할 사람이 없으니 기본값으로"라고 요청했다. 44개, 합계 $9.33(평균 $0.21, 약 1분). 모든 setup이 레포 규칙을 항상 읽히는 지침(CLAUDE.md, 없으면 기존 AGENTS.md)에 넣었다. Claude Code 2.1.285가 AGENTS.md를 읽는 것은 따로 확인했다.
- **적용**: setup이 새로 만든 파일과 CLAUDE.md, AGENTS.md, `.claude/` 변경만 과제 이미지에 넣고, 기존 프로젝트 파일 수정은 뺐다(numba setup이 llvmlite 최소 버전 검사를 낮춘 것, gql setup의 MANIFEST.in). 새 파일은 `.git/info/exclude`, 바뀐 지침은 skip-worktree로 두어 채점 패치에 섞이지 않게 했다. 도구: `bench/whatelse-tasks.mts`.
- **비교 기준**: 선별에서 실패한 과제만 골랐으므로, 비교는 고른 뒤 새로 돌린 순정 실행과 한다. 순정 재실행에서도 실패한 29개("두 번 실패")에는 순정을 한 번 더(3차) 돌려 그와 비교했다. 재실행 결과로 집합을 나눈 뒤 그 재실행과 비교하면 양쪽 모두 치우치기 때문이다.

### 결과

**두 번 실패한 29개, 순정 3차와 짝 비교 (주 분석)**

| 지표 | 순정 3차 | what-else |
| --- | --- | --- |
| 통과 | 11/29 (37.9%) | 9/29 (31.0%) |
| 순정만 통과 / what-else만 통과 | 5 | 3 |
| f2p 평균 | 94.5% | 95.1% (+0.6%p, 95% CI −3.5 ~ +5.2) |
| partial 평균 | 98.7% | 98.8% |
| 비용 | $0.58 | $0.71 |

- what-else만 통과: tengo-destructuring-bindings, go-critic-doc-link-checker, ink-grid-box-layout
- 순정 3차만 통과: eicrud-keyset-pagination-cursor, textual-kitty-key-phases, katex-multicolumn-array-spans, prometheus-typed-label-sorting, testem-bail-on-test-failure
- 둘 다 통과 6, 둘 다 실패 15

**선별 실패 46개 전체, 순정 재실행과 짝 비교 (참고)**: 통과 17/46 → 19/46, f2p 92.8% → 92.9% (+0.1%p, 95% CI −6.7 ~ +7.3), 비용 $0.50 → $0.71.

**결론: DeepSWE에서 레포 규칙(what-else 기본값)은 효과가 없었다.** 통과율과 f2p 모두 실행 편차 안이고, 비용만 20~40% 늘었다. 강도: 보통(한 벤치, 레포 41개, 과제마다 1회씩, 짝 비교).

**왜인가.** DeepSWE 실패는 대부분 요청에 적힌 요구사항의 세부를 놓치는 것이다(실패 과제 대부분이 f2p 90% 이상). 레포 규칙은 레포 관례상 함께 바뀌는 곳(export 목록, 문서, 형제 구현)을 겨냥한다. 에이전트는 규칙을 따랐고(최종 보고에 규칙별 확인 항목을 달았다), 관례 누락은 실제로 막았지만(예: httpx의 `__all__`), 그런 누락은 이 벤치의 실패 원인에서 드물다. Django 기록(R11)에서 규칙이 효과를 낸 것은 실패가 관례 파일 누락이었기 때문이다.

**또 배운 것.**
- 한 번 실패한 과제의 40%, 두 번 실패한 과제의 38%가 순정을 다시 돌리면 통과했다. 실패한 과제만 골라 한 번 비교했다면 what-else는 29개 중 9개를 "고친" 것으로 보였을 것이다.
- what-else 실행 하나(ytt)는 git 작성자 정보가 없자 커밋을 하지 않고 사용자에게 물어 빈 패치로 채점됐다(f2p 0). 순정 실행들은 `git -c user.name=...`으로 커밋했다. 규칙 때문인지는 확인하지 못했다.

**비용**: setup $9.33, what-else 실행 $32.46, 순정 3차 $16.71.

**다음 후보**: 요구사항 누락을 겨냥하는 방법(예: 끝내기 전에 요청의 요구사항을 목록으로 대조). 같은 29개와 순정 3차를 기준으로 비교할 수 있다.

## 고정 baseline (2026-10-02)

앞으로 시험할 방법은 이 기준과 비교한다.

- **조건**: DeepSWE v1.1 (`0b9fabb`), Pier 0.3.1 로컬 Docker, 순정 Claude Code 2.1.285, `claude-sonnet-5-5` 기본 effort.
- **전체 113개**: 1회 65/113 통과 (58%).
- **어려운 집합 18개 (`hard-3x`)**: 순정 3회 모두 실패한 과제. 대부분 매번 같은 요구사항을 놓친다(14개가 세 번 모두 f2p 90% 이상이고 점수가 거의 같다). 다시 돌리기만 해서 통과하는 몫이 거의 없어 방법의 효과를 가장 깨끗하게 본다. 순정 기준: 0/18 통과(3회), 평균 f2p 94%. 비교 때는 이 집합에 방법을 적용하고, 필요하면 순정 4차를 함께 돌려 0/18이 우연이 아닌지 확인한다.

| 과제 | 언어 | 순정 1·2·3차 f2p | what-else |
| --- | --- | --- | --- |
| go-critic-doc-link-checker | go | 67%* 67%* 67%* | 통과 |
| termenv-preserve-ansi-resets | go | 94% 94% 63% | 94% |
| csstree-shorthand-expansion-compression | javascript | 92% 94% 89% | 91% |
| kea-atomic-signal-selectors | typescript | 92% 92% 92% | 92% |
| obsidian-linter-auto-table-of-contents | typescript | 90% 95% 90% | 95% |
| ink-grid-box-layout | typescript | 96% 96% 84% | 통과 |
| happy-dom-deterministic-intersectionobserver | typescript | 93% 93% 93% | 79% |
| sqlfmt-create-table-ddl-formatting | python | 94%* 94%* 94%* | 94%* |
| optique-conditional-option-dependencies | typescript | 94% 94% 94% | 97% |
| meriyah-explicit-resource-declarations | typescript | 94% 94% 98% | 94% |
| gql-incremental-graphql-delivery | python | 94%* 100%* 94% | 100%* |
| tengo-destructuring-bindings | go | 97% 97% 96% | 통과 |
| bandit-structured-nosec-directives | python | 97%* 97%* 97%* | 100%* |
| koota-deferred-mutation-buffer | typescript | 97% 97% 97% | 99% |
| obsidian-linter-link-format-conversion | typescript | 97% 98% 97% | 97% |
| dateutil-rfc5545-timezone-interop | python | 97% 97% 99% | 99% |
| mnamer-daemon-watch-lifecycle | python | 98% 98% 98% | 98% |
| vulture-persistent-analysis-cache | python | 100%* 100%* 100%* | 100%* |

`*`: 기존 테스트(p2p)도 일부 깨뜨림. 새 기능은 완성하고 기존 동작을 깨뜨리는 과제가 5개(sqlfmt, bandit-structured-nosec, vulture, gql, go-critic)다. what-else는 18개 중 3개(go-critic, ink, tengo)를 통과시켰다(각 1회).

순정 baseline 전체 비용: 선별 $64.20, 재실행 $24.98, 3차 $16.71.

## what-else v2: 자기 추천안 setup (2026-10-02)

INSTALL.md를 바꿔 답할 사람이 없으면 고정 기본값 대신 자기 추천안으로 진행하게 했다(코드는 밖으로 보내지 않고, 비용은 작게, 검증은 그 안에서, 프로젝트 코드와 설정은 건드리지 않음). 어려운 집합 18개(레포 17개)에서 다시 setup하고 돌렸다.

**setup 17개**: 모두 대안(그대로 두기, 규칙, 순위 검색, 위임)을 따져 레포 규칙만 골랐다. 이 레포들의 누락이 관례 파일 쪽이고 레포가 작다는 이유였다. 검증 실행(규칙 유무로 과거 누락 사건 재실행)을 한 것은 4개(csstree, vulture, kea, dateutil), 13개는 하지 않았다. 코드나 설정을 고친 setup은 없었다. 비용 합계 약 $7.4(레포당 $0.18~1.63, setup 안에서 따로 띄운 Claude 실행 비용 일부는 빠짐).

**결과 (18개, 각 1회)**

| | 순정 (3회) | what-else v1 | what-else v2 |
| --- | --- | --- | --- |
| 통과 | 0/18 × 3 | 3/18 | 3/18 |
| 평균 f2p | 93.0% (3회 평균) | 96.0% | 94.3% |
| 과제당 비용 | $0.65 (3차) | $0.73 | $0.75 |

- v1과 v2 모두 통과: go-critic-doc-link-checker, tengo-destructuring-bindings. 순정은 세 번 모두 같은 곳에서 실패했다(각각 f2p 67%, 96~97%).
- 한쪽만 통과: ink-grid-box-layout(v1), mnamer-daemon-watch-lifecycle(v2).
- 나머지 14개는 v1, v2 모두 순정과 같은 f2p로 실패했다. 새 기능은 완성하고 기존 동작을 깨는 3개(vulture, bandit-structured-nosec, gql 일부)도 그대로였다.

**해석.** 순정 54회 중 통과 0회, what-else 36회 중 6회. 과제 2개(go-critic, tengo)에서는 효과가 반복해서 보인다. 다만 이 18개는 순정이 세 번 실패해서 고른 집합이라, 순정의 다음 실행 통과율이 0이라고 단정할 수 없다. 순정 4차를 돌려 확인해야 공정한 비교가 된다. v2로 바뀐 것(자기 추천안, 검증)은 결과를 바꾸지 못했다. setup이 고른 구성이 v1과 같았기 때문이다.

**setup 쪽 발견.** "검증은 한다"고 적어도 대부분 건너뛴다. 검증한 4개는 규칙 유무로 누락 사건을 재실행했고, 규칙이 막은 누락(vulture `ast_whitelist.py`, dateutil changelog, csstree 문서)과 규칙이 부른 불필요한 수정(csstree)을 찾아 규칙을 고쳤다.

## 실패 원인 분류: 범위 누락인가 (2026-10-02)

이 레포가 다루는 것은 **범위 누락**(바뀌어야 할 곳을 건드리지 않음)뿐이다. 구현 오류(맞는 곳을 고쳤지만 동작이 틀림)는 범위 밖이다. 어려운 집합 18개의 순정 3회 실패를 서브에이전트 3개가 실패 테스트, 에이전트 패치, 참조 정답을 대조해 분류했다(에이전트 자신의 설계 기준).

| 판정 | 과제 수 | 과제 |
| --- | --- | --- |
| 범위 누락이 주원인 (3회 중 2회 이상) | **3** | kea-atomic-signal-selectors (`src/kea/kea.ts` `proxyFields()`의 예약 키 목록에 새 필드 누락, 3/3), koota-deferred-mutation-buffer (`trait.ts` `removeTraitFromEntity`의 구독 처리 미수정, 3/3), gql-incremental-graphql-delivery (새 `execute_incremental`이 형제 메서드가 지키는 `parse_results` 옵션을 무시, 2/3, 경계 사례) |
| 구현 오류 | 14 | go-critic, termenv, csstree, obsidian-auto-toc, ink, happy-dom, sqlfmt, optique, meriyah, tengo, bandit-nosec, obsidian-link-format, dateutil, mnamer |
| 기타 | 1 | vulture (설정 기본값 순서를 바꿔 파라미터 테스트 ID가 바뀜. 동작은 맞음) |

**결론.** DeepSWE의 어려운 과제는 대부분 범위 문제가 아니다. 그래서 DeepSWE 통과율은 범위 찾기 방법의 효과를 재는 지표로 맞지 않는다. what-else로 통과한 과제(go-critic, tengo, ink, mnamer)도 모두 구현 오류 과제였으므로, 그 통과는 범위를 더 찾아서가 아니라 다른 이유(규칙의 확인 줄이 부른 재검토, 또는 실행 편차)로 보인다.

범위 누락 3개는 모두 "새 기능을 넣을 때 기존 구조의 다른 자리(프록시 목록, 공유 제거 경로, 형제 메서드의 공통 옵션)를 맞추지 않은" 경우다. 이 레포가 겨냥하는 유형 그대로다.

## 범위 누락 판정과 범위 실험 집합 (2026-10-02)

통과율은 범위 찾기를 재지 못하므로(위 분류), 순정 실행 전부에서 **범위 누락**을 직접 판정했다. 어려운 집합 18개 밖의 95개 과제, 순정 136회를 서브에이전트 8개(Sonnet)가 판정했다. 기준: 테스트 통과와 무관하게, 에이전트 자신의 설계에서 함께 바꿔야 했는데 건드리지 않은 곳(형제 구현, 두 번째 경로, 등록·export 목록, 호출부, 타입·스키마, 설정, 요청하거나 테스트가 보는 문서). 구현 오류는 세지 않는다.

- 판정한 136회 중 범위 누락 27회, 그중 10회는 **테스트를 통과한 실행**이었다(테스트가 잡지 않은 누락).
- 종류: 두 번째 경로 19, 형제 구현 9, 타입·스키마 2. 같은 기능을 처리하는 다른 경로를 빠뜨리는 것이 주된 모양이다.
- 113개 중 범위 누락이 한 번이라도 나온 과제는 21개.
- 1회만 돌려 누락이 나온 3개(onedump, kombu-virtual-queue-dead-lettering, python-statemachine)를 순정 2회 더 돌렸더니 6회 모두 테스트는 통과했고, 6회 모두 같은 곳을 놓쳤다. 이 판정자에게는 이전에 놓친 곳을 알려 주고 확인하게 했으므로 찾는 쪽으로 치우쳤을 수 있다.

**범위 실험 집합 (14개, `bench/deepswe-scope-set.txt`)**: 범위 누락이 2회 이상 나온 과제.

| 과제 | 누락 | 놓친 곳 |
| --- | --- | --- |
| textual-kitty-key-phases | 3/3 | 드라이버의 Kitty 플래그 (linux, windows) |
| kea-atomic-signal-selectors | 3/3 | `kea.ts` `proxyFields()` 예약 키 목록 |
| koota-deferred-mutation-buffer | 3/3 | `trait.ts` 공유 제거 경로 |
| onedump-dump-encryption-pipeline | 3/3 | `storage/storage.go` `PathGenerator` |
| kombu-virtual-queue-dead-lettering | 3/3 | memory·filesystem 전송의 `_put_fanout` |
| python-statemachine-state-data-scoping | 3/3 | dot 렌더러의 병렬 상태 라벨 |
| claude-code-by-agents-recursive-delegation | 2/2 | Anthropic provider의 도구 노출 |
| updo-policy-alerting | 2/2 | TUI 모니터링 경로 |
| boa-hierarchical-evaluation-cancellation | 2/3 | Promise job 등록 경로 |
| numba-stencil-boundary-modes | 2/3 | `parallel=True` stencil 경로 |
| obsidian-linter-scoped-ignore-markers | 2/3 | `Rule.apply` 진입점 |
| testem-bail-on-test-failure | 2/3 | `onTestsStart` 가드 |
| gql-incremental-graphql-delivery | 2/3 | 형제 메서드의 `parse_results` 옵션 |
| eicrud-keyset-pagination-cursor | 2/3 | OpenAPI `CrudOptions` 스키마 (확신도 낮음) |

순정 기준: 이 14개에서 순정 실행 40회 중 범위 누락 34회(85%). kea, koota, gql 9회는 실패 원인 분류로, 나머지 31회는 범위 누락 판정으로 셌다. 앞으로 범위 찾기 방법은 이 집합에서 **범위 누락 여부**로 비교한다(같은 판정자, 같은 기준, 판정자는 어느 쪽 실행인지 모르게). 판정자 흔들림이 있으므로(예: httpx `__all__` 누락을 누락으로 보지 않음) 비교 때는 양쪽 실행을 같은 판정 묶음에서 판정한다.

## 방법 1: what-else 레포 규칙, 범위 실험 집합 (2026-10-02)

범위 실험 집합 14개 레포를 현재 가이드(v2)로 **새로 setup**했다(합계 약 $6.8, 모두 레포 규칙 선택, 검증한 setup 2개, numba setup이 또 `numba/__init__.py`를 고쳐 그 부분은 뺐다). 적용 과제 14개와, 집합을 고른 뒤 **새로 돌린 순정** 14개를 1회씩 돌렸다. 두 쪽 패치를 과제마다 A/B로 무작위 배정하고 지침·노트 파일을 뺀 블라인드 팩으로 만들어(`bench/deepswe-blind-pack.mts`), 이전 기록을 모르는 판정자 2명(Sonnet)이 같은 기준으로 판정했다.

| 지표 | 순정 (새 실행) | what-else |
| --- | --- | --- |
| 범위 누락 | **8/14** | **4/14** |
| what-else만 누락 없음 | | 4 (updo, boa, numba, eicrud) |
| 순정만 누락 없음 | | 0 |
| 둘 다 누락 | | 4 (textual, onedump, kombu-dead-lettering, claude-code-by-agents) |
| 둘 다 없음 | | 6 |

- **규칙이 놓친 곳을 직접 가리킨 경우에 고쳐졌다.** updo 규칙은 "`simple.Config`와 `tui.Config` 양쪽"을, numba 규칙은 "parallel(`numba/parfors/`) 변형"을, eicrud 규칙은 "server와 client", `cli/templates`를 적었다. boa는 해당 규칙이 없는데도 고쳐졌다(편차일 수 있다).
- **규칙이 있어도 못 고친 경우**: onedump 규칙은 `storage.PathGenerator`를 공유 함수로 적었지만 두 쪽 다 놓쳤다. textual, kombu, claude-code-by-agents 규칙에는 놓친 곳(드라이버 플래그, fanout 경로, provider 도구 노출)이 없었다.
- **판정자 차이**: 이전 판정에서 3/3 누락이던 kea, koota, python-statemachine이 이번 판정자에게는 두 쪽 모두 누락 없음(확신도 낮음~중간)이었다. 양쪽을 같은 판정자가 같은 기준으로 봤으므로 비교에는 영향이 없지만, 누락 판정이 판정자에 따라 흔들린다.

**해석.** 순정 대비 범위 누락이 8 → 4로 줄었고, 엇갈린 4쌍이 모두 what-else 쪽이었다(부호 검정 단측 p ≈ 0.06). 방향은 분명하지만 14개 × 1회라 근거는 약하다. 한 번 더 양쪽을 돌려 확인할 가치가 있다. 비용: 순정 $0.5 안팎, what-else는 setup 포함 과제당 약 $1.2.

### 2회차 (2026-10-06)

같은 절차를 처음부터 다시 했다: setup 14개를 새로($6.59, numba setup의 `numba/__init__.py` 수정은 다시 뺐다), what-else 14개와 순정 14개를 새로 돌리고, 1회차와 다른 판정자 2명이 블라인드로 판정했다.

| | 1회차 | 2회차 | 합계 |
| --- | --- | --- | --- |
| 순정 범위 누락 | 8/14 | 5/14 | **13/28 (46%)** |
| what-else 범위 누락 | 4/14 | 3/14 | **7/28 (25%)** |
| 엇갈린 쌍: what-else 쪽 / 순정 쪽 | 4 / 0 | 3 / 1 | **7 / 1** |

- 엇갈린 8쌍 중 7쌍이 what-else 쪽이다(부호 검정 단측 p ≈ 0.035, 양측 ≈ 0.07).
- **두 회차 모두 what-else만 누락이 없었던 과제: updo**(규칙이 `simple.Config`와 `tui.Config` 양쪽을 적었다).
- 순정 쪽만 누락이 없던 1쌍: numba 2회차. what-else가 `parallel=True` 경로는 고쳤지만, 판정자가 다른 경로(`inline_closurecall.py`의 jit 내부 stencil)를 누락으로 봤다.
- 두 쪽 다 늘 놓친 곳: textual(드라이버 플래그), claude-code-by-agents(provider 도구 노출). 두 레포의 setup 규칙 모두 이 위치를 담지 못했다.
- 판정자 사이의 흔들림이 크다. onedump, kombu는 1회차 판정자는 두 쪽 다 누락, 2회차 판정자는 두 쪽 다 누락 없음이었다. 같은 판정자가 같은 묶음에서 양쪽을 보므로 비교는 유지되지만, 누락률의 절대값은 판정자에 따라 다르다.

**결론(범위 실험 집합 14개, 2회).** what-else 레포 규칙은 범위 누락을 46%에서 25%로 줄였다. 강도: 약함~보통(한 벤치, 14과제 × 2회, 블라인드 판정, 판정자 흔들림 있음). 효과는 setup의 진단이 그 레포의 두 번째 경로나 형제 구현을 규칙에 적었을 때 나타났고, 규칙에 없는 위치는 고치지 못했다. 비용은 setup 과제당 약 $0.5, 실행 과제당 +$0.2 안팎.

## 방법 2: BM25 검색 도구, 범위 실험 집합 (2026-10-06)

순정 Claude Code에 표준 라이브러리만 쓰는 BM25 도구(`bench/tools/bm25/.what-else/bm25.py`, git이 추적하는 파일을 식별자 단위로 색인해 변경 설명과 가까운 파일 15개와 관련 줄을 보여줌)를 넣고, 지침에 "끝내기 전에 변경 설명으로 도구를 돌려, 고치지 않은 상위 파일이 같은 변경을 필요로 하는지 확인한다"는 한 줄을 붙였다(`CLAUDE.append.md`). 레포 규칙은 넣지 않았다. 14개 모두 에이전트가 도구를 실제로 썼다. 순정 1회차 새 실행과 짝지어 블라인드로 판정했다(새 판정자 2명).

| 지표 | 순정 | BM25 |
| --- | --- | --- |
| 범위 누락 | 9/14 | **4/14** |
| 엇갈린 쌍 (BM25 쪽 / 순정 쪽) | | **6 / 1** |

- BM25만 누락이 없던 과제: textual, koota, updo, boa, numba, eicrud. 순정만 누락이 없던 과제: python-statemachine(확신도 낮음).
- **textual**: 순정과 what-else가 지금까지 한 번도 고치지 못한 드라이버 Kitty 플래그를 BM25 실행은 세 드라이버(linux, linux_inline, windows) 모두 `[>1u` → `[>7u`로 고쳤다. 레포 규칙에 없던 위치를 검색으로 찾은 사례다.
- 두 쪽 다 놓친 곳: onedump(`PathGenerator`), claude-code-by-agents(provider 도구 노출), obsidian-scoped(기존 customIgnore 경로).
- 같은 순정 실행이 이 판정자들에게는 9/14, 방법 1의 1회차 판정자들에게는 8/14였다. 판정자 흔들림은 여전하지만 비교는 같은 판정자 안에서 한다.

**해석.** 1회 비교에서 BM25는 레포 규칙(1회차 4/14, 엇갈림 4/0)과 비슷하거나 조금 넓게 효과를 냈고, 규칙이 담지 못한 위치(textual)도 찾았다. setup이 필요 없고 비용도 적다(도구 실행 0.2초). 강도: 약함(14과제 × 1회). 다음은 2회차로 반복하고, 규칙과 BM25를 함께 쓴 조합을 같은 방식으로 본다.
