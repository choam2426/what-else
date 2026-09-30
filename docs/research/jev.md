# Jev 리서치 노트

- 작성일: 2026-09-28
- 대상 버전: `jev-1.13.0` (early access)
- 목적: JevGrep(에이전트가 "수정해야 할 곳"을 빠르게 스캔하는 도구) 아이디어의 기반 모델로 Jev가 적합한지 판단

## 요약

Jev는 LLM이 아니라 **분류·판정 전용 모델**이에요. 텍스트를 생성하지 않고, 입력 상태(state)에 대한 질문에 **선택지·점수·확률**로만 답해요. 가격은 입력 100만 토큰당 $0.042이고 출력은 무료예요. 응답 시간은 70~500ms예요.

JevGrep 관점에서는 "이 코드 조각을 이번 변경 때문에 고쳐야 하나?"라는 yes/no 판정을 레포 전체에 싸게 뿌리는 용도로 잘 맞아요. 30만 줄 레포 전체를 한 번 스캔하는 비용은 약 $0.13, 시간은 20초~1분대로 추정돼요(아래 계산 참고). 반면 **간접 추론(multi-hop)에 약하고, 무관한 내용이 많으면 정확도가 떨어져요.** 그래서 "호출하는 함수가 바뀌었으니 호출부도 바뀌어야 한다" 같은 판단은 필요한 정보를 state에 직접 넣어줘야 해요.

## 1. Jev 개요

| 항목 | 내용 |
| --- | --- |
| 개발사 | TypeSafe AI (2024년 설립, 샌프란시스코) |
| 창업자 | Diogo Almeida (CEO, 전 OpenAI RLHF·InstructGPT·ChatGPT 담당), Erik Gafni, Sasha Sheng |
| 공개일 | 2026-09-15, 제한적 early access |
| 현재 버전 | `jev-1.13.0` (별칭 `jev-latest`, `jev-preview`) |
| 구조 | Transformer 기반, 비자기회귀(non-autoregressive), 병렬 샘플러 |
| 학습 | 합성 데이터만 사용, RLCD(Reinforcement Learning for Calibrated Decisions) |
| 투자 | 시드 $40M (DCVC 리드) |
| 이름 유래 | 경제학자 William Stanley Jevons와 제번스의 역설 |

TypeSafe는 이걸 "System One 모델"이라고 불러요. 빠르고 직관적인 판단(카너먼의 System 1)을 하는 모델이라는 뜻이에요. 공식 문서도 Claude Code나 Cursor 뒤에 있는 LLM을 **대체하는 모델이 아니라**, 에이전트 코드 안에서 호출하는 판정 함수라고 설명해요.

### 질문 유형 (primitive 3종)

| 타입 | 용도 | 제약 | 응답 |
| --- | --- | --- | --- |
| `noul` | yes/no 판정 | `criteria`(true/false 설명)는 선택 | 0~1 확률 |
| `choice` | 선택지 중 하나 고르기 | 선택지 **최대 255개** | 선택값 + 전체 확률 분포 + confidence |
| `score` | 순서 있는 등급 평가 | 등급 2~10개 | 확률 가중 점수 + 분포 + confidence |

출력은 스키마를 벗어나지 않아요. 독립 테스트에서 23,703회 호출 동안 잘못된 형식의 응답은 0건이었어요. "환각이 없다"는 홍보 문구는 **형식이 틀리지 않는다**는 뜻이지, **판정이 틀리지 않는다**는 뜻은 아니에요.

## 2. 스펙, 가격, 한도

| 항목 | 값 | 비고 |
| --- | --- | --- |
| 입력 가격 | $0.042 / 1M tokens ($42 / 1B tokens) | 공식 |
| 출력 가격 | 무료 | 공식 |
| 컨텍스트 | 요청당 64k tokens, 그중 **state + 가장 긴 질문 합이 32k** | 공식 |
| 처리량 한도 | 250,000 tokens/s | early access 중 수시로 변경 가능 |
| 요청 한도 | 1,200 requests/min (= 20 req/s) | 위와 같음 |
| 지연 시간 | 70~500ms (end-to-end) | 공식. 독립 측정에서 중앙값 0.34s |
| 입력 형식 | 텍스트만 (string / JSON object / array) | 이미지·오디오 불가 |
| 언어 | 영어 우선. CJK 등은 지원하지만 정확도 낮음 | 공식 |

- state는 한 번 읽히고, 모든 질문이 그 state에 대해 **병렬로, 서로 독립적으로** 평가돼요. 질문을 여러 개 붙여도 응답 시간은 거의 늘지 않아요(fan-out 패턴).
- 같은 요청 안의 질문끼리는 서로의 답을 참조할 수 없어요.
- 여러 요청에 걸쳐 state를 캐싱하는 기능은 문서에 없어요.

### 정확도 (벤더 주장과 독립 테스트)

| 출처 | 설정 | Jev | 비교 대상 |
| --- | --- | --- | --- |
| TypeSafe 자체 평가 | 4개 워크플로우. 정답 = GPT-6 Astra와 Claude Fable 5.1 응답의 평균 | 67.8% | GPT-5.6 Sol 74.1%, Claude Opus 5 73.1% |
| 독립 종합 (arXiv 2609.24574 인용) | 사람이 라벨링한 7,977건, 15개 태스크 | 72.5% (ECE 0.161) | Fable 5.1 84.0%, GPT-6 Astra 79.0%, DeepSeek V4.1 Flash 76.0% |

- 벤더 평가의 "정확도"는 프런티어 모델과의 **일치율**이지, 실제 정답률이 아니에요.
- "193.6배 빠르고 444.6배 싸다"는 수치는 비교 대상 모델을 밝히지 않았어요. 독립 비교에서는 Haiku 4.5 대비 약 2.9배 빠르고 12배 싸다는 결과가 나왔고, 로컬 Gemma 4 26B보다는 오히려 느렸어요.
- 결론적으로 **정확도는 중간 가격대 LLM 수준, 강점은 가격과 지연 시간**이에요.

## 3. 사용 방법

- 엔드포인트: `POST https://api.typesafe.ai/v1/systemone`
- 인증: `Authorization: Bearer <API_KEY>` (콘솔: console.typesafe.ai)
- SDK: Python `typesafe-sdk` (sync·async 클라이언트, 자동 재시도), JavaScript/TypeScript
- 에러: 401 인증, 422 요청 검증 실패, 429 rate limit, 529 과부하. 429·529는 exponential backoff로 재시도하라고 안내해요.
- 제3자 경로: OpenRouter, AI/ML API, Pydantic AI에도 연동돼 있어요.
- Claude Code, Codex 같은 에이전트가 Jev 연동 코드를 짤 수 있도록 공식 "Agent skill"을 제공해요.

```python
from typesafe_sdk import Choice, Noul, TypeSafeClient

with TypeSafeClient() as client:
    response = client.system_one(
        state={"document": "I was charged twice. Please fix this ASAP."},
        questions={
            "billing": Noul(instructions="Is this ticket about billing?"),
            "tone": Choice(
                instructions="What is the customer's tone?",
                criteria={"calm": None, "frustrated": None, "angry": None},
            ),
        },
    )
    print(response.nouls["billing"].noul)
```

## 4. 코드 관련 근거

공식 벤치마크에는 코드 태스크가 없어요. 대신 독립 테스트 두 개가 코드를 다뤄요.

| 테스트 | 설정 | 결과 |
| --- | --- | --- |
| APPS 백도어 탐지 (LessWrong, 2026-09-18) | 문제 설명 + Python 코드, 약 1,050 tokens. 백도어 600건, 정상 코드 1,200건 | AUROC 0.976 (LLM 작성 코드 대비), 0.970 (사람 작성 코드 대비). FPR 2%에서 89.5% 탐지. 1,000건당 약 $0.044 |
| 취약 코드 탐지 (jev-sec-bench, 2026-09-16) | 같은 태스크를 푼 취약/안전 코드 200쌍 | 쌍 중 취약 코드를 더 높게 평가한 비율 89.0%. 0.5 기준 recall 79.5%, precision 68.5%. 400건에 13.5초 |

- 짧은 코드 조각(1k tokens 안팎)에서 "이 코드에 특정 성질이 있나?"를 판정하는 능력은 쓸 만한 수준이에요.
- 백도어 테스트에서는 동일한 입력을 5번 채점했을 때 표준편차가 0.008이었어요. 결과가 매우 일관적이에요.
- 언어별로는 Python·C#·C++는 좋았고, Go·Kotlin은 약했어요(표본이 작아 참고만).

### 검색·랭킹 쿡북 (공식)

- **Semantic find**: 문서의 각 줄에 `L001|` 같은 ID를 붙여 state에 넣어요. 그다음 `choice`로 가장 관련 있는 줄 ID를 고르고, 같은 요청 안에서 `noul`로 "답이 문서에 존재하는가"를 따로 물어요. 존재 점수 0.7 이상이면 있음, 0.35 미만이면 없음으로 봐요. **JevGrep의 줄 단위 위치 찾기에 그대로 가져다 쓸 수 있는 패턴이에요.**
- **Rerank**: BM25로 후보 30개를 뽑고, Jev `noul`로 재정렬했어요. top-10 정답률이 38%에서 62%로 올랐어요. 1,200회 호출에 총 $0.0645가 들었어요.

## 5. 알려진 약점

공식 문서(model jaggedness 페이지)와 독립 테스트에서 확인된 약점이에요.

| 약점 | 출처 | JevGrep에 미치는 영향 |
| --- | --- | --- |
| 간접 추론(multi-hop)에 약함 | 공식 | "A가 바뀌어서 이걸 호출하는 B도 바뀌어야 함" 같은 판단이 어려워요. 변경 내용(바뀐 시그니처나 계약)을 state에 직접 넣어줘야 해요. |
| 무관한 내용이 많을수록 정확도 하락 | 공식 | 파일 전체보다 함수·블록 단위의 작은 청크가 유리해요. |
| 질문을 쓴 그대로 해석함 | 공식 | 질문 문구가 곧 성능이에요. 프롬프트 튜닝이 필요해요. |
| 선택지 문구에 민감함. yes/no 기준을 뒤바꾸면 답의 32.5%가 바뀜 | arXiv 2609.26758 | 질문 템플릿을 고정하고 평가셋으로 검증해야 해요. |
| choice 확률의 70.4%가 정확히 0으로 나옴 | 독립 테스트 | 순위 동점이 많아요. 순위를 매길 때는 후보별 `noul` 점수가 더 나아요. |
| 비영어권 언어에서 정확도 하락 | 공식 + 독립 테스트 | 질문은 영어로 쓰세요. 한국어 주석이나 문자열이 많은 코드는 확인이 필요해요. |
| 산수, 개수 세기, 날짜 비교가 부정확함 | 공식 | "이 함수가 인자를 3개 받나?" 같은 판정은 정적 분석에 맡기세요. |
| 보정(calibration)이 독립적으로 검증되지 않음 | 독립 리뷰 | 임계값은 자체 평가셋으로 정해야 해요. |

## 6. JevGrep에 대한 시사점

### 비용·시간 추정

가정: 30만 줄 레포, 줄당 약 10 tokens면 약 3M tokens예요. 질문과 오버헤드는 무시했어요. (실측한 코드 토큰 밀도로는 줄당 약 15 tokens라서 토큰 수와 비용은 약 1.5배가 돼요. 7절 참고)

| 청크 크기 | 요청 수 | 비용 | 처리량 기준 최소 시간 (250k tok/s) | 요청 한도 기준 최소 시간 (20 req/s) |
| --- | --- | --- | --- | --- |
| 8k tokens | 약 375 | 약 $0.13 | 약 12초 | 약 19초 |
| 2k tokens | 약 1,500 | 약 $0.13 | 약 12초 | 약 75초 |

- 레포 전체를 매번 훑어도 비용은 사실상 무시할 수준이에요. **병목은 가격이 아니라 요청 한도(RPM)예요.**
- 청크를 작게 자를수록 정확도는 오르지만(무관한 내용이 줄어드니까), 요청 수가 늘어 느려져요. 청크 하나에 여러 질문을 fan-out으로 붙이는 게 이득이에요.
- 따라서 grep, 심볼 그래프, 임베딩 같은 사전 필터는 **비용 때문이 아니라 속도와 정확도 때문에** 여전히 쓸모 있어요.

### 설계 방향

1. **청크 판정**: 청크마다 `noul` "Does this code need to change to implement: <intent>?"를 물어요. recall을 높이려면 임계값을 낮게 잡아요.
2. **줄 위치 찾기**: semantic find 패턴을 써요. 줄 ID를 `choice` 선택지로 주는데, 한 번에 255개까지 가능해요.
3. **multi-hop 보완**: 메인 에이전트(LLM)가 먼저 변경 요약을 만들어요. 예를 들면 "`User.email` is now required (non-null)" 같은 거예요. 이걸 state에 넣어서 판정을 한 단계짜리로 만들어요.
4. **변경 유형별 질문 fan-out**: 한 요청에 로직 변경 필요, 테스트 수정 필요, 설정·문서 수정 필요 같은 질문을 같이 보내요.
5. **최종 검증은 LLM이**: Jev는 후보를 좁히는 필터로만 쓰고, 실제 수정과 확인은 메인 에이전트가 해요.

### 리스크

- early access 단계라 한도와 가격이 수시로 바뀔 수 있어요.
- 코드 태스크에 대한 공식 벤치마크가 없어요. 레포 커밋 기반 평가셋으로 직접 검증하는 게 첫 단계예요.
- 벤더 종속이에요. 모델은 공개되지 않았고 API로만 쓸 수 있어요.

## 7. 직접 측정한 사실 (2026-09-28, jev-1.13.0)

| 항목 | 측정 결과 |
| --- | --- |
| 요청당 고정 오버헤드 | 거의 빈 요청이 입력 약 270 tokens로 과금돼요 |
| 질문 추가 비용 | 짧은 noul 질문 하나당 입력 약 17 tokens. 질문 1개 303, 2개 320, 5개 371, 10개 456 tokens |
| state 과금 | **질문 수와 관계없이 요청당 한 번**이에요. 위 수치에서 state 몫은 일정했어요 |
| 코드 토큰 밀도 | 코드 51,779자 = 20,058 tokens, 약 2.6자당 1토큰 |
| 지연 시간 | 첫 요청 약 460ms, 이후 약 190~220ms (질문 1~10개 사이 차이 거의 없음) |
| 컨텍스트 초과 | 약 20k tokens는 성공, 약 51k tokens 이상은 `400 {"detail":{"error_type":"max_tokens_exceeded"}}` |
| choice 선택지 256개 | `400 {"detail":"Too many choices. Must have at most 255 choices."}` |
| 잘못된 질문 타입 | `400 {"detail":{"error_type":"api_usage_error","message":"Invalid request."}}`. **문서의 422가 아니라 400**이에요 |
| 인증 실패 | `401 {"detail":{"error_type":"authentication_error",...}}` |
| choice 선택지 설명 | `null`을 허용해요 |
| 응답 헤더 | `x-typesafe-request-id`는 있고, rate limit 관련 헤더는 보이지 않았어요 |

- **실제 청구는 `usage` 기반 계산과 같아요.** Django 전체 스캔(15,672회 요청)에서 응답의 `usage.input_tokens` 합계는 23,569,185였고, 공시 단가로 약 $0.99예요. 대시보드에는 처음에 $0.22로 나왔다가, 나중에 계산값과 같게 반영됐어요 (2026-09-28, 사용자 확인). **대시보드는 늦게 반영돼요.** 비용은 응답의 `usage`로 재면 돼요.
- 서버 오류 **520**(Cloudflare HTML 페이지)이 15,672회 중 1회 나왔어요. 일시적인 오류라 재시도 대상에 넣었어요.
- 처리 속도는 초당 20.0 요청으로 일정했어요. 분당 1,200회 한도에 정확히 맞춰졌고, 429는 한 번도 나오지 않았어요.
- 에러 `detail`이 문자열일 때도 있고 객체일 때도 있어요. 보일러플레이트(`src/jev/client.mts`)가 두 형태를 모두 처리해요.
- 코드 토큰 밀도를 반영하면 6절 비용 추정은 낮게 잡힌 거예요. 평균 한 줄이 40자라면 줄당 약 15 tokens라서, 30만 줄 레포는 약 4.6M tokens, 전체 스캔 약 $0.19가 돼요. 여전히 무시할 수준이에요.

## 8. 미확인 사항

- [x] 한 요청에 질문을 여러 개 붙이면 state가 질문마다 과금되는지 → 한 번만 과금돼요 (7절)
- [ ] 요청당 최대 질문 수 (문서에 명시 없음, 10개까지는 확인)
- [ ] 코드 입력에 대한 공식 가이드와 한국어 정확도 수치
- [ ] 무료 크레딧 규모 (제3자 블로그에만 "$5"로 나오고 공식 확인은 안 됨)
- [ ] early access 승인 절차와 소요 기간

## 출처

공식:
- [TypeSafe AI 홈페이지](https://typesafe.ai)
- [Introducing System One Models & Jev (공식 블로그)](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
- [Models (스펙·가격·한도)](https://docs.typesafe.ai/models)
- [API reference](https://docs.typesafe.ai/api)
- [State 개념](https://docs.typesafe.ai/concepts/state)
- [Model jaggedness: jev-1.13](https://docs.typesafe.ai/model-jaggedness/jev-1.13)
- [Coding agents](https://docs.typesafe.ai/introduction/coding-agents.md)
- [Fan-out 패턴](https://docs.typesafe.ai/patterns/fan-out.md)
- [Semantic find 쿡북](https://docs.typesafe.ai/cookbooks/semantic_find.md)
- [Rerank 쿡북](https://docs.typesafe.ai/cookbooks/rerank_typesafe.md)
- [Python SDK](https://docs.typesafe.ai/sdk/python)
- [문서 인덱스 (llms.txt)](https://docs.typesafe.ai/llms.txt)

제3자:
- [Jev (AI model) - Wikipedia](https://en.wikipedia.org/wiki/Jev_(AI_model))
- [Jev After Eight Days of Independent Tests (DEV Community, 2026-09-24)](https://dev.to/aws-builders/jev-after-eight-days-of-independent-tests-level-with-mid-price-llms-behind-the-frontier-1c60)
- [Jev, Sorted: What is still just a claim (pearpages, 2026-09-16)](https://pearpages.com/blog/2026/09/16/jev-sorted-what-typesafes-system-one-model-actually-is-and-what-is-still-just-a-claim)
- [A non-generative model as a trusted monitor for AI Control (LessWrong, 2026-09-18)](https://www.lesswrong.com/posts/d7pQicW8EhpPBDRqz/a-non-generative-model-as-a-trusted-monitor-for-ai-control)
- [jev-sec-bench (GitHub)](https://github.com/Gaurav-Gosain/jev-sec-bench)
- [JEV API Pricing (MindStudio)](https://www.mindstudio.ai/blog/jev-pricing-api-credits)
- [Jev, an AI Model That Can't Chat (Bloomberg via Yahoo Finance, 2026-09-25)](https://finance.yahoo.com/technology/ai/articles/jev-ai-model-t-chat-100610738.html)
