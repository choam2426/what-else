# Baseline: 순정 Claude Code on DeepSWE

- 시작: 2026-09-30
- 상태: 선별과 순정 재실행 완료 (2026-10-01). 다음은 what-else 적용
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
