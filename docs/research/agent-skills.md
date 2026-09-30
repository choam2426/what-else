# 좋은 Agent Skill 리서치 노트

- 작성일: 2026-09-28
- 목적: JevGrep setup skill과, 그 skill이 만들어내는 레포 전용 skill을 잘 쓰기 위한 기준 정리
- 관련 문서: [JevGrep 설계 노트](../design/jevgrep-design.md), [Jev 리서치 노트](jev.md)

## 요약

좋은 skill은 **짧고, 언제 쓸지가 분명하고, 실제 사용으로 검증된** skill이에요. 공식 문서와 실무 가이드가 공통으로 강조하는 원칙은 일곱 가지예요.

1. **description이 전부예요.** 에이전트는 이름과 description만 보고 skill을 쓸지 정해요. "무엇을 하는지"와 "언제 쓰는지"를 둘 다 쓰고, 핵심 트리거 단어를 앞에 둬요.
2. **에이전트는 이미 똑똑해요.** 모르는 것만 적어요. 한 문장씩 "이게 없으면 행동이 달라지나?"를 물어요.
3. **자유도를 작업의 위험도에 맞춰요.** 여러 방법이 다 괜찮으면 원칙만 주고, 깨지기 쉬운 작업이면 정확한 스크립트를 줘요.
4. **점진적 공개(progressive disclosure)로 나눠요.** `SKILL.md`는 500줄 이하의 목차 역할만 하고, 세부 내용은 한 단계 아래 파일로 빼요.
5. **결정적인 작업은 스크립트로 해요.** 에이전트에게 코드를 생성시키지 말고, 검증된 스크립트를 실행하게 해요.
6. **평가를 먼저 만들어요.** skill 없이 에이전트를 돌려서 실제로 어디서 실패하는지 확인하고, 그 실패를 고칠 만큼만 써요.
7. **쓰는 모습을 관찰하며 고쳐요.** 에이전트가 어떤 파일을 읽고 무엇을 놓치는지 보고 개선해요.

JevGrep에 가장 중요한 시사점은 이래요 (자세한 내용은 9절).

- setup skill은 **사용자가 직접 호출하는 skill**로 만드는 게 맞아요. 레포마다 한 번 실행하고 파일을 만들고 API 비용을 쓰기 때문이에요.
- 레포 전용 skill의 description은 "grep으로 충분한 작업"과 "JevGrep이 필요한 작업"을 가르는 경계가 핵심이에요. 이 경계는 비슷하지만 다른 요청(near-miss)으로 평가해야 해요.
- 서브에이전트가 작은 모델이라서, 서브에이전트용 지시는 **Haiku급 모델로 따로 테스트**해야 해요.

## 1. 구조와 로딩 방식

### 기본 구조 (Agent Skills 공개 표준)

```
skill-name/
├── SKILL.md       # 필수: frontmatter + 지시
├── scripts/       # 선택: 실행할 코드
├── references/    # 선택: 필요할 때 읽는 문서
└── assets/        # 선택: 템플릿, 데이터 파일 등
```

### 세 단계 로딩

| 단계 | 내용 | 언제 로딩 | 크기 기준 |
| --- | --- | --- | --- |
| 1. 메타데이터 | `name` + `description` | 항상 (모든 skill) | 약 100 tokens |
| 2. 본문 | `SKILL.md` 전체 | skill이 선택됐을 때 | 5,000 tokens 미만, 500줄 미만 권장 |
| 3. 리소스 | `scripts/`, `references/`, `assets/` | 필요할 때만 | 제한 없음. 스크립트는 실행 결과만 컨텍스트에 들어감 |

- 1단계는 **모든 대화, 모든 턴에** 비용이 들어요. description 한 단어가 가장 비싼 단어예요.
- 스크립트는 코드를 읽지 않고 실행만 하면 출력만 컨텍스트에 들어가요. 긴 로직일수록 스크립트로 빼는 게 이득이에요.

### frontmatter 필수 필드

| 필드 | 규칙 |
| --- | --- |
| `name` | 1~64자, 소문자·숫자·하이픈만. 하이픈으로 시작·끝 불가, 연속 하이픈 불가. **디렉터리 이름과 같아야 해요.** Anthropic 플랫폼에서는 `anthropic`, `claude`를 넣을 수 없어요. |
| `description` | 1~1,024자. 무엇을 하는지와 언제 쓰는지. XML 태그(`<`, `>`) 불가 |

선택 필드는 `license`, `compatibility`(환경 요구사항, 500자 이하), `metadata`(자유 형식), `allowed-tools`(실험적)가 있어요. 표준을 따르는 도구는 모르는 필드를 무시해요.

## 2. description 쓰기

description은 에이전트가 수십~수백 개 skill 중에서 이걸 고를지 정하는 유일한 근거예요.

- **무엇 + 언제를 둘 다 써요.** "Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when the user mentions PDFs, forms, or document extraction."
- **3인칭으로 써요.** description은 시스템 프롬프트에 들어가요. "I can help you..."나 "You can use this..."는 발견을 방해해요.
- **조금 적극적으로 써요.** 공식 skill-creator는 Claude가 skill을 **덜 쓰는(undertrigger) 경향**이 있다고 해요. 사용자가 이름을 말하지 않아도 필요한 상황을 description에 넣으라고 권해요.
- **핵심 단어를 앞에 둬요.** Claude Code는 skill 목록에서 `description`과 `when_to_use`를 합쳐 1,536자에서 자르고, Codex도 트리거 키워드를 앞에 두라고 권해요.
- **분기마다 트리거 하나씩 써요.** 같은 경우를 동의어로 여러 번 쓰는 건 낭비예요. 서로 다른 경우만 남겨요.
- **단순한 작업에는 skill이 트리거되지 않아요.** Claude는 스스로 쉽게 할 수 있는 한 단계짜리 작업이면 description이 맞아도 skill을 안 써요. 여러 단계이거나 전문적인 작업일 때 확실히 트리거돼요.

### 트리거 평가

skill-creator의 description 최적화 방법이에요.

- 실제 사용자가 칠 법한 구체적인 요청 20개를 만들어요. 트리거해야 하는 것 8~10개, 트리거하면 안 되는 것 8~10개예요.
- 트리거하면 안 되는 요청은 **비슷하지만 다른 요청(near-miss)**이어야 해요. 키워드는 겹치지만 실제로는 다른 도구가 맞는 경우예요. 전혀 무관한 요청은 아무것도 검증하지 못해요.
- 60%로 description을 고치고 40%로 검증해서, 특정 요청에 과적합되는 걸 막아요.

## 3. 본문 쓰기

### 짧게, 모르는 것만

- 기본 가정은 "Claude는 이미 똑똑하다"예요. PDF가 뭔지, 라이브러리를 어떻게 설치하는지는 쓰지 않아요.
- **no-op 문장을 지워요.** 모델이 기본적으로 이미 하는 행동을 지시하는 문장은 비용만 들어요. 판단 기준은 "이 문장이 기본 행동을 바꾸나?"예요.
- **환경에서 찾을 수 있는 건 쓰지 않아요.** `package.json` 스크립트, 설정 파일, 디렉터리 구조는 에이전트가 직접 보면 돼요. 문서에 옮겨 적으면 낡아요. 적을 가치가 있는 건 **보고도 알 수 없는 것**이에요. 쓰이지 않은 관례, 결정의 이유, 설정에 드러나지 않는 함정 같은 것들요.
- **한 의미는 한 곳에만 써요.** 같은 내용이 여러 곳에 있으면 고칠 때 빠뜨리고, 실제보다 중요해 보여요.

### 자유도 맞추기

| 자유도 | 형태 | 언제 |
| --- | --- | --- |
| 높음 | 원칙과 절차를 글로 | 여러 방법이 다 괜찮고, 상황에 따라 판단해야 할 때 |
| 중간 | 파라미터가 있는 의사코드나 스크립트 | 선호하는 패턴은 있지만 변형을 허용할 때 |
| 낮음 | 정확한 명령어, 수정 금지 | 깨지기 쉽고, 일관성이 중요하고, 순서가 정해져 있을 때 |

공식 문서의 비유: 양쪽이 절벽인 좁은 다리에서는 난간을 세우고, 위험이 없는 들판에서는 방향만 알려줘요.

### 표현 방식

- **이유를 설명해요.** 대문자 ALWAYS/NEVER를 늘어놓는 건 경고 신호예요. 왜 중요한지 설명하면 모델이 처음 보는 상황에서도 의도대로 판단해요.
- **금지보다 목표를 써요.** "X 하지 마"는 X를 오히려 떠올리게 해요. 원하는 행동을 긍정형으로 써요. 금지가 꼭 필요하면 목표 행동과 짝지어요.
- **용어를 통일해요.** "API endpoint", "URL", "route"를 섞지 말고 하나만 써요.
- **leading word를 활용해요.** 모델이 이미 아는 짧은 개념어(예: *tight* loop, *tracer bullet*)를 반복해서 쓰면, 긴 설명 없이 일관된 행동을 끌어낼 수 있어요.
- **선택지를 늘어놓지 말고 기본값을 줘요.** "pypdf, pdfplumber, PyMuPDF 중에..." 대신 "pdfplumber를 써요. 스캔본이면 OCR을 써요." 같은 식으로 기본값 하나와 예외 하나만 줘요.
- **시간이 지나면 틀리는 정보는 넣지 않아요.** 옛 방식은 "Old patterns" 섹션에 접어둬요.

### 절차와 완료 기준

- 복잡한 작업은 **번호 매긴 단계**로 쓰고, 에이전트가 복사해서 체크할 수 있는 **체크리스트**를 줘요.
- **단계마다 완료 기준을 명확히 써요.** "이해가 될 때까지" 같은 모호한 기준은 에이전트가 단계를 서둘러 끝내게 만들어요. 뒤에 남은 단계가 보이면 더 그래요. "수정된 모델을 모두 확인함"처럼 확인할 수 있고 빠짐없는 기준이 가장 강해요.
- 그래도 서두르는 게 관찰되면 단계를 **다른 컨텍스트로 분리**해요. 서브에이전트에게 넘기거나 skill을 나누는 식이에요. 같은 컨텍스트 안에서 파일만 나누는 건 효과가 없어요.
- **검증 루프**를 넣어요. 검증 → 고침 → 다시 검증을 통과할 때까지 반복하는 패턴이 품질을 크게 올려요.
- 결과 형식이 중요하면 **템플릿**이나 **입력·출력 예시**를 줘요. 엄격해야 하면 "이 형식을 정확히 따라요", 유연해도 되면 "기본 형식이지만 상황에 맞게 조정해요"라고 써요.

## 4. 파일 구성

- `SKILL.md` 본문은 **500줄 미만**으로 유지해요. 넘으면 나눠요.
- 참조는 **`SKILL.md`에서 한 단계 깊이까지만** 해요. 참조한 파일이 또 다른 파일을 참조하면 에이전트가 `head -100`처럼 일부만 읽어서 정보를 놓쳐요.
- 100줄이 넘는 참조 파일은 맨 위에 **목차**를 둬요. 일부만 읽어도 전체 범위를 알 수 있어요.
- **영역별로 나눠요.** 여러 영역을 다루면 영역별 파일로 나눠서, 필요한 파일만 읽게 해요. (예: `reference/aws.md`, `reference/gcp.md`)
- 판단 기준은 **분기**예요. 모든 경우에 필요한 건 `SKILL.md`에 두고, 일부 경우에만 필요한 건 파일로 빼요.
- 파일 이름은 내용을 알 수 있게 지어요. (`form_validation_rules.md`, `doc2.md` 아님)
- 경로는 항상 슬래시(`/`)로 써요. 역슬래시는 Unix 환경에서 깨져요.
- 파일을 가리킬 때 **실행할 건지 읽을 건지** 분명히 써요. "`analyze.py`를 실행해요"와 "알고리즘은 `analyze.py`를 참고해요"는 달라요.

## 5. 스크립트

- **문제를 해결하고 떠넘기지 않아요.** 에러가 나면 그냥 실패시키지 말고 스크립트가 처리해요.
- **이유 없는 상수를 쓰지 않아요.** 타임아웃, 재시도 횟수 같은 값에는 왜 그 값인지 주석을 달아요. 작성자가 모르는 값을 에이전트가 알 리 없어요.
- **검증할 수 있는 중간 산출물을 만들어요.** 여러 곳을 한꺼번에 바꾸거나 되돌리기 어려운 작업은 계획 → 검증 → 실행 순서로 해요. 먼저 계획 파일(예: `changes.json`)을 만들고, 스크립트로 검증한 뒤, 실행해요.
- **검증 에러 메시지를 구체적으로 써요.** "필드 'signature_date'가 없어요. 있는 필드: customer_name, order_total, signature_date_signed"처럼 에이전트가 바로 고칠 수 있게요.
- **의존성을 가정하지 않아요.** 필요한 패키지와 설치 방법을 명시해요.
- 테스트 실행에서 에이전트들이 **매번 같은 보조 스크립트를 새로 짜고 있다면**, 그 스크립트를 skill에 넣으라는 신호예요.

## 6. 평가와 반복

### 평가 먼저

1. skill 없이 에이전트를 대표 작업에 돌려서 실패 지점을 기록해요.
2. 그 실패를 확인하는 시나리오를 최소 3개 만들어요.
3. skill 없는 기준 성능을 재요.
4. 실패를 고칠 만큼만 지시를 써요.
5. 평가를 돌리고, 기준과 비교해서 다듬어요.

상상한 문제가 아니라 실제 문제를 풀게 하려는 순서예요.

### Claude A / Claude B

- Claude A와 함께 skill을 설계하고, **새 인스턴스인 Claude B**에게 실제 작업을 시켜 테스트해요.
- Claude B가 헤매거나 놓친 부분을 구체적으로 Claude A에게 가져가서 고쳐요.

### 관찰할 것

- **예상과 다른 탐색 경로**: 파일을 예상과 다른 순서로 읽으면 구조가 직관적이지 않다는 뜻이에요.
- **놓친 연결**: 중요한 파일의 참조를 따라가지 않으면 참조 문구를 더 분명하게 써야 해요.
- **특정 파일에 대한 과의존**: 같은 파일을 계속 읽으면 `SKILL.md`로 올려야 할 수 있어요.
- **무시된 파일**: 한 번도 안 읽히면 불필요하거나 안내가 부족한 거예요.

### 반복할 때의 원칙

- **일반화해요.** skill은 수많은 다른 요청에 쓰여요. 테스트 몇 개에만 맞는 세세한 수정이나 억압적인 MUST는 피해요.
- **군더더기를 지워요.** 결과물뿐 아니라 실행 기록(transcript)을 읽어요. skill 때문에 에이전트가 쓸데없는 일을 하고 있으면 그 부분을 지워봐요.
- **쓸 모델 모두로 테스트해요.** Opus에게 충분한 설명이 Haiku에게는 부족할 수 있어요. Haiku는 "안내가 충분한가", Opus는 "과하게 설명하지 않나"를 봐요.
- **쌓이는 층을 경계해요.** 추가는 안전해 보이고 삭제는 위험해 보여서, 낡은 내용이 계속 쌓여요. 정기적으로 가지치기해요.

## 7. Claude Code 전용 기능

### skill 위치

| 범위 | 경로 |
| --- | --- |
| 개인 (모든 프로젝트) | `~/.claude/skills/<name>/SKILL.md` |
| 프로젝트 (레포에 커밋) | `.claude/skills/<name>/SKILL.md` |
| 하위 디렉터리 (모노레포) | `<subdir>/.claude/skills/<name>/SKILL.md` |
| 플러그인 | `<plugin>/skills/<name>/SKILL.md` (`/plugin:name`으로 호출) |

skill 파일을 고치면 세션 중에도 바로 반영돼요. 새 skill 디렉터리를 추가하면 `/reload-skills`가 필요해요.

### 주요 frontmatter 필드

| 필드 | 효과 |
| --- | --- |
| `disable-model-invocation: true` | 사용자만 `/name`으로 호출해요. description이 컨텍스트에 안 들어가서 **평소 비용이 0**이에요. 배포, 커밋처럼 부작용이 있는 작업용이에요. |
| `user-invocable: false` | Claude만 호출해요. `/` 메뉴에 안 보여요. 배경 지식용이에요. |
| `when_to_use` | 트리거 문구와 예시를 따로 적어요. description과 합쳐 1,536자에서 잘려요. |
| `allowed-tools` | 이 skill이 실행되는 턴 동안 권한 확인 없이 쓸 도구예요. 예: `Bash(${CLAUDE_SKILL_DIR}/scripts/*)` |
| `context: fork` + `agent` | skill을 격리된 서브에이전트에서 실행해요. 대화 기록을 못 보니 지시가 그 자체로 완결돼야 해요. |
| `model`, `effort` | 이 skill 실행에 쓸 모델과 노력 수준이에요. `context: fork`와 함께 쓰면 서브에이전트의 모델이 돼요. |
| `paths` | 이 glob에 맞는 파일을 다룰 때만 자동으로 로딩해요. |
| `arguments`, `argument-hint` | 이름 붙은 인자(`$issue`)와 입력 힌트예요. |

- 본문에서 쓸 수 있는 치환: `$ARGUMENTS`, `${CLAUDE_SKILL_DIR}`(skill 디렉터리), `${CLAUDE_PROJECT_DIR}`(프로젝트 루트) 등이 있어요.
- **동적 컨텍스트 주입**: 본문에 `` !`git diff --stat` ``처럼 쓰면, Claude가 skill을 보기 전에 명령을 실행하고 그 출력으로 바꿔 넣어요. 명령이 실패하면 skill 호출 전체가 중단되니, 실패할 수 있는 명령에는 `|| true`를 붙여요.
- skill 내용은 한 번 로딩되면 이후 턴에도 컨텍스트에 남아요. 자동 압축 때는 skill마다 처음 5,000 tokens, 전체 25,000 tokens까지만 다시 붙여요. **중요한 건 앞쪽에** 써야 해요.

### 서브에이전트 정의

JevGrep의 스캔 서브에이전트에 바로 쓰이는 기능이에요.

- 위치: `.claude/agents/<name>.md` (프로젝트, 커밋해서 공유), `~/.claude/agents/` (개인)
- 필수 필드는 `name`과 `description`이에요. description에 "use proactively" 같은 문구를 넣으면 위임이 더 잘 일어나요.
- `tools`: 허용할 도구 목록이에요. (예: `Read, Grep, Glob, Bash`)
- `model`: `haiku`, `sonnet`, `opus`, `fable`, 전체 ID, 또는 `inherit`이에요.
- `skills`: 시작할 때 미리 로딩할 skill 목록이에요. 전체 내용이 들어가요.
- `memory: project`: `.claude/agent-memory/<name>/`에 세션을 넘어 기억을 남겨요. `MEMORY.md`의 앞 200줄이 시스템 프롬프트에 들어가요.
- **이어서 일 시키기**: 끝난 서브에이전트에 `SendMessage`로 메시지를 보내면 이전 맥락을 모두 가진 채 이어서 일해요. 단, **내장 Explore·Plan 에이전트는 일회성이라 이어서 쓸 수 없어요.** 직접 정의한 에이전트나 general-purpose를 써야 해요.
- 서브에이전트도 서브에이전트를 만들 수 있어요. 기본 3단계까지예요.

## 8. 다른 에이전트와의 호환성

같은 `SKILL.md` 형식이라도 **찾는 위치가 달라요.**

| 에이전트 | 레포 skill 위치 | 명시적 호출 | 추가 설정 |
| --- | --- | --- | --- |
| Claude Code | `.claude/skills/` | `/name` | frontmatter 확장 필드 (7절) |
| Codex | `.agents/skills/` (현재 디렉터리와 레포 루트) | `$name` | `agents/openai.yaml` (UI 정보, 자동 호출 허용 여부, MCP 의존성) |

- `name`, `description`과 `scripts/`, `references/`, `assets/` 구조는 공통이에요.
- `${CLAUDE_SKILL_DIR}`, `context: fork`, 동적 컨텍스트 주입, `.claude/agents/`는 **Claude Code 전용**이에요. 다른 에이전트에서도 쓸 skill이라면 skill 루트 기준 상대 경로로 쓰고, 전용 기능은 없어도 동작하게 해야 해요.
- Codex의 서브에이전트 지원 여부는 이번 조사에서 확인하지 못했어요.

## 9. JevGrep에 대한 시사점

### setup skill

- **사용자가 직접 호출하는 skill로 만들어요** (`disable-model-invocation: true`). 레포마다 한 번 실행하고, 파일을 만들고, API 비용을 쓰는 작업이에요. 자동으로 트리거될 이유가 없고, description이 매 턴 컨텍스트를 차지할 이유도 없어요.
- **본문은 단계와 완료 기준 중심으로** 써요. 인터뷰 → 탐색 → 설계 → 커스텀 → 검증 → 산출물 생성이에요.
    - 가장 서두르기 쉬운 단계는 **검증**이에요. 뒤에 "skill 생성"이 보이니까요. 완료 기준을 "과거 커밋 N개로 recall을 측정했고, grep만 쓴 경우와 비교한 수치를 보고함"처럼 확인할 수 있게 써야 해요.
    - 그래도 서두르면 검증을 서브에이전트로 분리하는 걸 고려해요.
- **자유도를 단계별로 다르게** 줘요.

    | 단계 | 자유도 | 이유 |
    | --- | --- | --- |
    | 인터뷰, 설계 | 높음 | 레포마다 답이 달라요 |
    | 보일러플레이트 커스텀 | 중간 | 출발점은 있고 변형을 허용해요 |
    | 평가 관문 | 낮음 | 정확한 스크립트로 돌려야 결과를 비교할 수 있어요 |

- **파일 구성 초안**이에요. 모두 `SKILL.md`에서 한 단계 깊이로 참조해요.

    ```
    jevgrep-setup/
      SKILL.md                  # 단계 + 완료 기준 + 어떤 파일을 언제 읽는지
      references/
        jev.md                  # Jev 사실: 한도, 약점, 측정값 (설계 결정에 필요한 것만)
        design-decisions.md     # 탐색 단위, 필터, 질문 설계의 선택지와 결정 기준
        repo-skill-checklist.md # 생성할 레포 전용 skill이 지켜야 할 기준 (이 문서의 요약)
        case-*.md               # 설계 사례. 사례마다 파일 하나
      assets/
        boilerplate/            # 커스텀할 출발점 코드 (src/jev/*.mts)
        repo-skill-template/    # 레포 전용 skill의 뼈대
        scanner-agent.md        # 서브에이전트 정의 템플릿
      scripts/
        eval.mts                # 평가 관문 (낮은 자유도)
    ```

    - 보일러플레이트는 **실행하는 스크립트가 아니라 커스텀할 출발점**이라 `scripts/`보다 `assets/`가 맞아요.
    - **설계 리뷰 후 변경**: 커스텀의 기본 수단이 코드 수정에서 설정 파일로 바뀌었어요. 그래서 `assets/boilerplate/` 대신 번들된 CLI(`jevgrep.mjs`)와 설정 템플릿을 넣게 돼요. 최신 구성은 [설계 문서](../design/jevgrep-design.md) 2절과 9절이 기준이에요.
- "Claude는 이미 똑똑하다" 원칙에 따라, 일반적인 개발 지식은 쓰지 않아요. **Jev에 대해 모델이 모르는 것**에 집중해요. (간접 추론에 약함, 무관한 내용이 많으면 정확도 하락, 문구 민감성, 요청당 약 270 tokens 오버헤드 등)

### 레포 전용 skill

- **모델이 호출하는 skill**이어야 해요. 에이전트가 스스로 "이건 grep으로 부족하다"고 판단해서 써야 하니까요.
- **description의 경계가 핵심이에요.** 트리거해야 할 경우와 하지 말아야 할 경우를 구분해야 해요.
    - 트리거: 스키마·API 계약 변경, 여러 계층에 걸친 변경, 보안 수정, 동작 변경처럼 grep 패턴으로 범위를 정하기 어려운 경우
    - 트리거 안 함 (near-miss): 단순 이름 변경, 한 파일 안의 수정, grep 패턴 하나로 범위가 확실한 경우
    - 이 경계는 트리거 평가(2절)로 검증하고, 개선 루프에서 계속 다듬어요.
- **Claude는 skill을 덜 쓰는 경향이 있어요.** description을 적극적으로 쓰되, near-miss로 과잉 트리거도 확인해요.
- 생성된 skill도 이 문서의 기준을 지켜야 해요. setup skill에 **생성물 체크리스트**(`repo-skill-checklist.md`)를 넣어서, 생성 후 스스로 점검하게 해요.

### 서브에이전트

- 작은 모델에서 돌아가니까 **Haiku급 모델로 따로 테스트**해야 해요. Opus 기준으로 쓴 지시는 Haiku에게 부족할 수 있어요.
- 작업 완료 후 회고 때 **같은 서브에이전트를 다시 불러야** 하니까, 내장 Explore가 아니라 **직접 정의한 에이전트**여야 해요.
- 보고 형식은 템플릿으로 엄격하게 고정해요. 메인이 기계적으로 읽을 수 있어야 하니까요.
- `tools`는 읽기와 스크립트 실행만 줘요. (`Read, Grep, Glob, Bash`) 코드를 고치는 건 메인의 일이에요.

### 개선 루프

- 이 문서의 "쌓이는 층" 경고가 개선 루프에 그대로 적용돼요. `learnings.md`와 `targets/`는 계속 늘어나기 쉬우니까, **개선 단계에 가지치기를 포함**시켜요. 해결된 원인과 중복된 템플릿을 정리하는 거예요.
- 개선 루프는 공식 가이드의 "실제 사용을 관찰하며 고친다"를 자동화한 거예요. 사람이 Claude B를 관찰하는 대신, 케이스와 회고가 관찰 기록 역할을 해요.
- Claude Code의 서브에이전트 `memory: project`도 학습 기록 장소로 쓸 수 있어요. 하지만 Claude Code 전용이라, 에이전트와 무관하게 쓰려면 skill 디렉터리 안의 `learnings.md`가 기준이 돼야 해요.

### 호환성 (결정됨: harness 중립)

- Claude Code는 `.claude/skills/`, Codex는 `.agents/skills/`를 봐요.
- 결정 (2026-09-28): 특정 harness에 묶지 않아요. 핵심(스캐너, 케이스, 학습 기록, 스캔 워커 지시서)은 레포의 `.jevgrep/` 한 곳에 두고, harness마다 얇은 진입점 `SKILL.md`만 만들어요. 자세한 내용은 설계 노트 2절 "harness 중립"에 있어요.
- 서브에이전트나 이어서 부르기가 없는 harness에서도 동작하도록, 스캔 상태는 파일(`.jevgrep/runs/<id>/`)로 넘겨요.

## 출처

공식:
- [Skill authoring best practices (Claude Platform Docs)](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- [Agent Skills Specification (agentskills.io)](https://agentskills.io/specification)
- [Equipping agents for the real world with Agent Skills (Anthropic Engineering, 2025-10-16)](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
- [Skills (Claude Code Docs)](https://code.claude.com/docs/en/skills)
- [Subagents (Claude Code Docs)](https://code.claude.com/docs/en/sub-agents)
- [Build skills (OpenAI Codex)](https://learn.chatgpt.com/docs/build-skills)

로컬에 설치된 skill 작성 가이드:
- `skill-creator` (claude-plugins-official): 작성 → 테스트 → 평가 → 개선 루프, description 최적화 방법
- `writing-for-agents` (mattpocock-skills 1.2.3): context pointer, 정보 계층, 완료 기준, leading word, 가지치기
