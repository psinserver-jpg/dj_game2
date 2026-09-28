# music/: 곡 생성 → 채보 파이프라인

Gemini Lyria로 곡을 만들고(`generate.mjs`), 오디오를 분석해 4개 난이도 채보와 웹용 매니페스트를 만듭니다(`chart.mjs`).

```
songs.json ──generate.mjs──▶ raw/<id>.mp3 · .txt · .json ──chart.mjs──▶ public/music/<id>.mp3
                                                                          public/music/manifest.json
```

Node 24가 필요합니다(`chart.mjs`가 `../src/data/chartBuilder.ts`를 타입 스트리핑으로 바로 import합니다). 의존성은 `music/node_modules`에 있습니다(`@google/genai`, `mpg123-decoder`).

## 1. 곡 생성: `generate.mjs`

```bash
node music/generate.mjs --dry-run          # 실제로 보낼 프롬프트만 출력 (API 호출 없음)
node music/generate.mjs                    # raw 오디오가 없는 곡만 생성
node music/generate.mjs neon-velocity      # 지정한 곡만 (이미 있으면 --force 필요)
node music/generate.mjs --force            # 다시 생성 (이전 결과는 raw/previous/ 로 이동)
node music/generate.mjs --concurrency=1    # 동시 요청 수 (기본 2)
node music/generate.mjs --probe            # lyria-3-clip-preview 30초 1회 호출 → raw/_probe.* (키/권한 확인용)
```

- **API 키**: 환경 변수 `GEMINI_API_KEY`, 없으면 프로젝트 루트 `.env.local` → `.env` 순서로 읽습니다. 키는 출력하지 않습니다.
- **모델**: `LYRIA_MODEL` 환경 변수 > `songs.json`의 `"model"` > `lyria-3.5`. 공식 문서(2026-09 기준)에서 `lyria-3-pro-preview`와 `lyria-3-clip-preview`는 2026-03-25부터 지원 중단 예정(deprecated, 종료일 미정)이고 권장 대체 모델은 `lyria-3.5`입니다. 해당 모델을 쓰면 실행할 때 경고를 출력합니다. `--probe`는 30초 클립 모델이 `lyria-3-clip-preview`뿐이라 그대로 씁니다. `lyria-3.5`도 무료 등급이 없어 결제 연결이 필요합니다.
- **프롬프트** = `prompt` + 공통 `style` + 길이(`lengthSec`, 기본 105초 → "about 1:45 (105 seconds)") + "exactly N BPM throughout" + 보컬 지시.
  - `vocal: "ja"`: 일본어로만 부르라는 지시와, 문서 형식대로 맨 끝에 `Lyrics:` 헤더 + `[Verse]`/`[Chorus]` 태그 가사. Lyria는 프롬프트 언어로 가사를 쓰기 때문에, 가사가 비어 있으면 보컬 지시를 일본어로 보내고 경고합니다(본문이 영어라 영어 가사가 나올 수 있으니 가사를 직접 넣는 것을 권장).
  - `vocal: "none"`(기본): "Instrumental only, no vocals."
  - `mood`, `coverBrief`, `stageBrief`, `palette`는 프롬프트에 넣지 않습니다. 분위기는 `prompt`에 직접 쓰세요.
  - 보컬 곡인데 `style`에 "no vocals"가 있으면 경고합니다. 새 곡 목록에 보컬 곡을 넣을 때는 `style`에서 그 문장을 빼세요.
- **출력**: `raw/<id>.mp3`(API가 WAV를 주면 `.wav`), `raw/<id>.txt`(모든 텍스트 파트: 가사/구조, 받은 순서대로), `raw/<id>.json`(모델, 보낸 프롬프트, mimeType, 크기, 실제 길이, finishReason, 안전 필터 정보, 텍스트 파트 종류, createdAt). 텍스트 파트 중 JSON 곡 구조 설명(``` 펜스 포함)은 `raw/<id>.structure.json`에도 파싱해서 따로 저장합니다.
- **오류 처리**: 429(일시적)와 5xx는 최대 3번 지수 백오프로 재시도합니다. `limit: 0`인 429는 무료 등급이라 Lyria 할당량이 없는 경우라서 재시도하지 않습니다. 400/403/404, 안전 필터 차단(`SAFETY`, `RECITATION` 등)은 원인 힌트를 함께 출력합니다.

> 2026-09-28 확인: 현재 `.env.local`의 키로 `--probe`를 호출하면 `429 … free_tier_requests, limit: 0, model: lyria-3-clip`이 옵니다. Lyria를 쓰려면 AI Studio에서 결제를 연결해 유료 등급으로 올려야 합니다.

## 2. 채보 생성: `chart.mjs`

```bash
node music/chart.mjs                  # raw 오디오가 있는 모든 곡
node music/chart.mjs midnight-tokyo   # 지정한 곡만 (나머지는 기존 매니페스트 항목 유지)
node music/chart.mjs --test           # 합성 신호로 분석기 자체 테스트 (파일을 쓰지 않음)
```

분석 순서:

1. **디코딩**: mp3는 `mpg123-decoder`(gapless: LAME 헤더의 인코더 지연을 잘라서 브라우저 재생 타이밍과 맞춤), wav는 자체 RIFF 파서(PCM 8/16/24/32, float 32/64). 모노로 합칩니다.
2. **STFT**: 직접 구현한 FFT, Hann 2048 / hop 512 @44.1 kHz(샘플레이트에 비례). 30 Hz~16 kHz를 반음 간격 로그 밴드로 묶습니다.
3. **온셋**: 로그 크기 스펙트럴 플럭스(반파 정류, 이전 프레임 ±1밴드 최대값 기준) → 적응형 임계값 피크 검출(최소 간격 50 ms).
   - `strength` = 피크 높이 / 피크 90퍼센타일 (최대 1.2)
   - `band` = 플럭스 가중 로그 주파수 중심을 80 Hz~8 kHz에서 0~1로 매핑 (낮을수록 왼쪽 레인)
   - `sustain` = 온셋에서 새로 시작한 밴드(킥과 함께 시작한 코드/멜로디 포함)의 에너지가 온셋 레벨의 50% 이상 유지되는 시간, 같은 밴드 재타격에서 끊음, 최대 4초
4. **템포**: 프롬프트 BPM ±12%를 0.05 BPM 간격(→0.005로 정밀화)으로 콤 필터 탐색 → 박 위상(첫 박 시각)과 다운비트(킥이 가장 강한 박) 계산. 프롬프트와 3% 넘게 다르면 경고 후 검출값을 씁니다.
   - **Lyria가 템포를 무시한 경우**: 60~220 BPM에서 창 밖 템포도 확인합니다(창 안 최선의 1/4·1/2·2·4배만 제외, 3:4·2:3 같은 셋잇단 관계는 1.6배 이상 잘 맞아야 채택). 최종 템포가 프롬프트 BPM×2^k의 ±12% 밖이면 **그 곡은 실패로 처리**하고(기존 매니페스트 항목 유지, 종료 코드 1) 곡을 다시 생성하거나 `songs.json`에 `"chartBpm": 실제BPM`을 넣으라고 안내합니다.
   - **`"chartBpm"`(선택)**: 있으면 프롬프트 BPM 대신 그 값 ±3%만 탐색하고 템포 검사/2배 전환을 하지 않습니다. 셔플/스윙 곡이 셋잇단 템포로 잘못 잡힐 때도 `"chartBpm": 프롬프트BPM`으로 고정할 수 있습니다.
   - **2배 전환**: 박 두드러짐만으로는 바꾸지 않습니다(절반 전환은 없음). 강한 온셋(strength ≥ 0.3)의 10% 넘게 16분 격자에서 30 ms 넘게 벗어나 있고, 그중 거의 전부(벗어난 온셋이 전체의 3% 이하)가 2배 템포 격자의 두 사이 위치(“e”와 “a”)에 고르게 있을 때만 2배로 바꿉니다. 스윙 8분은 한쪽에만 몰려서 전환되지 않습니다.
   - **격자 적합도**: 최종 16분 격자에서 30 ms 넘게 벗어난 강한 온셋 비율을 출력하고 10%를 넘으면 경고합니다(템포 오류, 스윙/셋잇단). 20초 구간별 박 위치가 30 ms 넘게 흔들려도 경고합니다.
5. **미리듣기**: 처음 8초와 마지막 15초를 피한 가장 큰 12초 구간, 마디선에 맞춤.
6. **채보**: `buildBeatmaps({ onsets, bpm, duration, seed: id, gridOffset: 다운비트, leadIn, tailOut })` 후처리:
   - **노트 시각 복원**: chartBuilder는 노트를 곧은 16분 격자에 놓으므로, 각 노트를 그 칸으로 양자화된 가장 강한 온셋의 실제 시각으로 되돌립니다(10 ms 이내면 격자 시각 유지). 스윙 8분과 템포 흔들림도 실제 소리에 맞습니다. 롱노트는 길이를 유지합니다.
   - **롱노트 끝**: 오디오 끝 0.05초 전을 넘지 않게 자르고, 한 박보다 짧아지면 일반 노트로 바꿉니다.
   - `leadIn`: 16분 격자 위(30 ms 이내)에 있고 strength ≥ 0.08인 온셋이 두 마디 안에 3개 이상 이어지기 시작하는 시각. 범위는 2.0초 ~ min(6초, 2마디)라 조용한 인트로(피아노 솔로, 오르골)도 어려운 난이도부터 채보됩니다. `tailOut = max(1.0, 끝의 무음 길이)`.
   - 노트가 없는 난이도가 생기면 그 곡은 실패로 처리하고 매니페스트를 건드리지 않습니다.
   - 매니페스트 `lyrics`는 `songs.json`의 가사, 없으면(`vocal: "ja"`) `raw/<id>.txt`에서 JSON 구조 설명(펜스 포함)을 뺀 나머지입니다.

출력은 `public/music/<id>.mp3`(원본이 WAV면 `.wav`로 복사하고 `audioUrl`도 `.wav`)와 `public/music/manifest.json`입니다. 매니페스트의 곡 순서는 `songs.json` 순서를 따릅니다. 이번에 다시 만들지 않은 곡은 기존 분석/채보를 유지하되 제목 같은 설명 필드는 `songs.json`에서 새로 가져오고, `songs.json`에서 빠진 곡은 매니페스트에서 지우고 `public/music/<id>.mp3|.wav`도 삭제합니다. 노트는 `[time, lane]` 또는 `[time, lane, holdDuration]`(초, 소수 3자리)이고 채보마다 한 줄로 저장합니다.

곡마다 검출 BPM, 신뢰도(콤 점수 / 탐색 구간 중앙값, 합성 음원 기준 6~16, 1.1 미만이면 프롬프트 BPM 사용), 박 위상, 다운비트, 길이, 격자에서 벗어난 강한 온셋 비율, 절반/2배 박 두드러짐(참고용), 난이도별 노트/롱노트 수와 레벨을 출력합니다. `!`로 시작하는 줄은 확인이 필요한 경고입니다.
