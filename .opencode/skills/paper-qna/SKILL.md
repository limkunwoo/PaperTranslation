---
name: paper-qna
description: 학술 논문에 대한 Q&A 문서를 작성하고, SVG 다이어그램 + Stable Diffusion 이미지를 포함한 자체 완결형 HTML로 빌드합니다.
license: MIT
compatibility: opencode
metadata:
  audience: researchers
  workflow: documentation
---

## 개요

학술 논문의 핵심 개념에 대한 질의응답(Q&A) 문서를 작성하고, 시각 자료(SVG 다이어그램 + SD 생성 이미지)가 포함된 자체 완결형 HTML로 빌드합니다.

**핵심 원칙:**
- Q&A 본문은 **Markdown**으로 작성 (`논문_QnA.md`)
- 이미지는 **SVG + SD 하이브리드** 방식 — 기술적 다이어그램은 SVG, 분위기/개념 이미지는 Stable Diffusion
- 최종 출력은 **자체 완결형 HTML** — MathJax v3 SVG (인라인) + base64 PNG + 인라인 SVG
- 번역된 논문(pdf-translate 스킬)과는 **별개 문서** — 번역 파일을 수정하지 않음

## 출력 아키텍처

```
ClothSimulation/qna/<paper>_QnA.md      (Markdown 원본)
    +
ClothSimulation/qna/<paper>_QnA.meta.json  (섹션별 이미지 매핑 — 논문마다 별도)
    +
ClothSimulation/qna/images/             (SVG 다이어그램 + PNG — 논문 간 공유)
    +
ClothSimulation/qna/scenes/             (인터랙티브 scene 플러그인 — *.js)
    +
PaperTranslation/tools/vendor/          (Three.js r137 UMD + MathJax 3 tex-svg)
    ↓
PaperTranslation/tools/build_qna_html.js  (논문 종속 코드 없음 — 범용 빌드 도구)
    ↓
ClothSimulation/qna/<paper>_QnA.html    (자체 완결형 HTML)
```

**빌드 명령:**
```bash
# Bending 논문
node D:/MyProjects/PaperTranslation/tools/build_qna_html.js "D:/MyProjects/ClothSimulation/qna/논문_QnA.md"
# PBD 논문
node D:/MyProjects/PaperTranslation/tools/build_qna_html.js "D:/MyProjects/ClothSimulation/qna/PBD_QnA.md"
```

`build_qna_html.js`는 `<input_basename>.meta.json`을 자동으로 찾아 `SECTION_META`로 사용합니다. 파일이 없으면 빈 객체(`{}`)로 폴백합니다. **새 논문 추가 시 스크립트 수정 불필요** — `.meta.json`만 추가하면 됩니다.

`build_qna_html.js`는 input-relative 경로를 사용:
- output 기본값: `<input_dir>/<input_basename>.html` (입력과 같은 디렉토리)
- images 기본값: `<input_dir>/images/`
- vendor: `<tools_dir>/vendor/` (Three.js + OrbitControls + MathJax tex-svg, 자동 감지)

## Markdown 포맷 규칙

### 파일 구조

```markdown
# 문서 제목

부제 또는 설명 텍스트.

---

## 1. 섹션 제목

### 질문
질문 내용...

### 답변
답변 내용...

## 2. 다음 섹션 제목
...
```

**규칙:**
- 최상위 `# 제목`은 1개만
- 각 Q&A 항목은 `## N. 섹션 제목` 형식 (번호 + 마침표 + 공백 + 제목)
- 각 섹션 내에 `### 질문`과 `### 답변` 소제목 필수
- 인라인 수학: `$...$` (MathJax 인라인)
- 디스플레이 수학: `$$...$$` (MathJax 디스플레이)
- 수학 블록: ` ```math ` 펜스드 블록 — MathJax가 렌더링하는 수식 박스 (`<div class="math-block">`, `<pre>` 없음)
  - 내부에 `$...$` / `$$...$$` LaTeX 수식 사용 필수 (유니코드 ∂, φ, ∇ 등은 MathJax가 처리하지 않음)
  - 빌드 시 `inlineMarkdown()` 적용 → `$...$` → `\(...\)`, `$$...$$` → `\[...\]` 변환
- 코드 블록: ` ``` ` 펜스드 코드 블록 — `<div class="code-block"><pre>` 출력 (MathJax `skipHtmlTags`로 수식 무시됨)
- 표: 표준 Markdown 파이프 테이블 (`| A | B |`)
  - **테이블 셀 안의 LaTeX `\|` (노름) 주의**: 빌드 스크립트의 `splitTableRow()`가 `$...$` 내부의 `|`를 무시하지만, `\|`는 LaTeX에서 노름 기호로 쓰이면서 파이프와 겹칠 수 있음. 안전을 위해 **`\lVert` / `\rVert`** 사용을 권장 (예: `$\lVert q \rVert$` → ‖q‖)
- 볼드: `**...**`, 인라인 코드: `` `...` ``

### 이미지 삽입 방식

이미지는 Markdown 본문에 직접 삽입하지 않습니다. 대신 `<input_basename>.meta.json` 파일의 섹션 매핑을 통해 각 섹션에 자동으로 삽입됩니다.

**파일 위치:** `ClothSimulation/qna/<paper>_QnA.meta.json` (QnA 파일과 동일 디렉토리)

```json
{
  "1": {
    "svg": null,
    "png": "sd_constraints.png",
    "svgCaption": null,
    "title": "등식/부등식 제약"
  },
  "4": {
    "svg": "winged_triangle_pair.svg",
    "png": null,
    "svgCaption": "날개형 삼각형 쌍 (Winged Triangle Pair)",
    "title": "삼각형 메시 확장과 날개형 삼각형 쌍",
    "threejs": "winged_triangle_pair"
  }
}
```

**주의:** JSON 키는 반드시 **문자열** 형식 (`"1"`, `"4"`)이어야 합니다 (JS 객체의 숫자 키와 다름).

- SVG: `<div class="diagram">` 안에 인라인 SVG + `<figcaption>`으로 삽입
- PNG: `<div class="illustration">` 안에 base64 data URI `<img>`로 삽입
- Three.js: `<div class="threejs-wrapper">` 안에 `<canvas>` + 인라인 `<script>`로 삽입
- 삽입 위치: `### 답변` 바로 다음 (SVG → Three.js → Canvas2D 순서)
- `threejs` 필드가 있는 섹션만 3D 뷰 생성
- `canvas2d` 필드가 있는 섹션만 Canvas2D 인터랙티브 뷰 생성

## 이미지 유형별 제작 방법

### SVG 다이어그램 — 기술적/구조적 개념

**사용 시점:**
- 삼각형 메시, 격자 구조, 정점 라벨
- 각도, 법선 벡터, 그래디언트 화살표
- 기하학적 관계, 토폴로지 연결

**제작 방법:** AI가 직접 SVG 코드 작성 (외부 도구 불필요)

**SVG 작성 규칙:**
- `viewBox` 사용, 고정 `width`/`height`는 피하거나 상대적 크기 사용
- 배경: 밝은 회색 (`#f8f9fa`) 또는 흰색
- 주요 요소: 파란 톤 (`#2c5aa0`, `#5ba3d9`)
- 라벨 텍스트: `font-family: 'CMU Serif', serif` 또는 `'Georgia', serif`
- 수학 심볼은 유니코드 직접 사용 (예: `φ`, `∂`, `Σ`)
- 화살표: `<marker>` + `<defs>` 패턴
- 반투명 면: `fill-opacity: 0.2~0.3`

**예시 카테고리:**
| 다이어그램 | 핵심 요소 |
|-----------|----------|
| 격자 구조 | 정점 원, 간선, 색상 구분된 스틱 유형 |
| 날개형 삼각형 쌍 | 공유 간선 강조, 정점 라벨 p₁~p₄ |
| 이면각 | 두 삼각형 면, 공유 간선, 각도 호 |
| 그래디언트 화살표 | 정점별 편미분 방향 화살표 |
| 가상 사면체 | 3D 사면체 (점선 숨은선), 정점 라벨 |

### Stable Diffusion 이미지 — 분위기/개념적 시각화

**사용 시점:**
- 물리적 현상의 실제 모습 (천 접힘, 주름, 충돌)
- 추상적 비유 (스프링, 고무줄, 금속 막대)
- 사진처럼 보이는 참고 이미지

### Three.js 3D 인터랙티브 뷰 — 기하학적 구조의 직관적 이해

**사용 시점:**
- 이면각, 법선 벡터, 그래디언트 등 3D 기하 구조를 회전하며 관찰해야 할 때
- 기존 SVG 다이어그램의 **보조** 뷰 (SVG는 그대로 유지, Three.js는 아래에 추가)

**기술 스택:**
- **Three.js r137** UMD 빌드 (`three.min.js`, 618KB) — r160+는 UMD 제거됨
- **OrbitControls r137** UMD (`OrbitControls.js`, 26KB) — r150+는 `examples/js/` 제거됨
- 오프라인 자체 완결: vendor 파일이 HTML `<head>`에 `<script>` 블록으로 인라인됨

**vendor 파일 위치:**
```
PaperTranslation/tools/vendor/
├── three.min.js       # Three.js r137 UMD (618,904 bytes)
├── OrbitControls.js   # Three.js r137 OrbitControls UMD (26,133 bytes)
└── mathjax-tex-svg.js # MathJax 3 tex-svg (2,059 KB) — SVG 출력, 폰트 파일 불필요
```

**다운로드 소스 (필요 시 재다운로드):**
```bash
curl -o vendor/three.min.js "https://cdn.jsdelivr.net/npm/three@0.137.5/build/three.min.js"
curl -o vendor/OrbitControls.js "https://cdn.jsdelivr.net/npm/three@0.137.5/examples/js/controls/OrbitControls.js"
curl -L -o vendor/mathjax-tex-svg.js "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js"
```

**Three.js 장면 추가 방법 (scene plugin architecture):**

장면 코드는 빌드 스크립트가 아닌 `<input_dir>/scenes/<scene_id>.js`에 외부 플러그인으로 작성합니다. 빌드 스크립트에는 논문 종속 코드가 없습니다.

1. `<paper>_QnA.meta.json`에 `"threejs": "<scene_id>"` 필드 추가
2. `<input_dir>/scenes/<scene_id>.js` 파일 작성 (아래 API 준수)
3. 빌드 실행 — `buildThreejsHtml()` 디스패처가 자동으로 플러그인 로드

**Scene plugin API:**
```js
// <input_dir>/scenes/<scene_id>.js
module.exports = {
  type: 'threejs',  // or 'canvas2d'
  html(ids) { ... },               // Returns inner HTML string (controls + canvas)
  build(ids, helpers) { ... }      // Returns JS code string (wrapped in IIFE by dispatcher)
};
```

**`ids` 객체 (Three.js):**
```js
{ canvas: `threejs-canvas-${N}`, container: `threejs-container-${N}`,
  slider: `angle-slider-${N}`, val: `angle-val-${N}`,
  toggle: `toggle-${N}`, state: `state-label-${N}`, acos: `acos-val-${N}` }
```

**`helpers` 객체:**
```js
{ buildInteractiveScene }  // 공유 winged-triangle 빌더 함수 (빌드 스크립트에 정의)
```

**장면 아키텍처 유형:**
- **공유 씬** (Q4, Q5, Q8): scene plugin에서 `helpers.buildInteractiveScene(canvasId, sliderId, valId, opts)` 호출 — 옵션으로 라벨/법선/그래디언트 토글
- **독립 씬** (Q11, Q16): 고유한 UI 컨트롤이 필요할 때 scene plugin에서 `html()` + `build()`를 직접 구현

**장면 코드 작성 규칙:**
- IIFE `(function() { ... })();`로 감싸짐 (전역 오염 방지)
- `var` 사용 (ES5 호환, 스크립트 블록 내 strict mode 아님)
- canvas 크기: 부모 너비 기반 반응형, 높이는 `Math.min(400, width * 0.7)`
- OrbitControls: 회전만 허용 (`enableZoom: false`, `enablePan: false`)
- 라벨: `THREE.Sprite` + `THREE.CanvasTexture` (유니코드 이스케이프 사용)
- 색상: SVG 다이어그램과 동일한 팔레트 유지
- 조명: AmbientLight(0.5) + DirectionalLight 2개
- GridHelper: 바닥 참조용, 반투명

**현재 구현된 3D 뷰 패턴 예시:**

| 유형 | scene_id 예시 | 설명 |
|------|--------------|------|
| 공유 씬 | `winged_triangle_pair`, `dihedral_angle`, `gradient_arrows` | `helpers.buildInteractiveScene()` 래퍼, opts로 라벨/법선/그래디언트 토글 |
| 독립 씬 | `arccos_reflection`, `constraint_generation` | 고유 UI(토글 버튼 등)가 필요할 때 html()/build()를 직접 구현 |

장면 플러그인 파일 목록은 `<input_dir>/scenes/` 디렉토리를 참조. 매핑은 `<paper>_QnA.meta.json`에서 관리.

### Canvas2D 인터랙티브 뷰 — 2D 개념의 슬라이더 기반 시각화

**사용 시점:**
- 본질적으로 2D인 개념(등고선, 방향 미분 등)에서 슬라이더로 매개변수를 조절해야 할 때
- 3D 회전이 오히려 핵심 교훈을 가리는 경우
- 정적 SVG로는 실시간 값 변화를 보여줄 수 없는 경우

**기술 스택:**
- **순수 Canvas2D API** — Three.js 의존 없음, 추가 vendor 파일 불필요
- HTML `<canvas>` + 인라인 `<script>` (IIFE 패턴)
- 자체 완결: 외부 라이브러리 없이 동작

**Canvas2D 장면 추가 방법 (scene plugin architecture):**
1. `<paper>_QnA.meta.json`에 `"canvas2d": "<scene_id>"` 필드 추가
2. `<input_dir>/scenes/<scene_id>.js` 파일 작성 (`type: 'canvas2d'`, 동일 plugin API)
3. 빌드 실행 — `buildCanvas2dHtml()` 디스패처가 자동으로 플러그인 로드

**`ids` 객체 (Canvas2D):**
```js
{ canvas: `canvas2d-${N}`, slider: `canvas2d-slider-${N}`, val: `canvas2d-val-${N}`,
  info: `canvas2d-info-${N}`, prev: `stepper-prev-${N}`, next: `stepper-next-${N}` }
```

**장면 코드 작성 규칙:**
- IIFE `(function() { ... })();`로 감싸짐 (전역 오염 방지)
- `var` 사용 (ES5 호환)
- HiDPI 지원: `dpr = Math.min(devicePixelRatio, 2)`, canvas 물리 크기 = 논리 크기 × dpr, `ctx.scale(dpr, dpr)`
- 좌표 변환 함수: 수학 좌표 → 캔버스 픽셀 (y축 반전 포함)
- 화살표 그리기: `drawArrow()` 헬퍼 함수 — 삼각형 arrowhead
- 정보 패널: 별도 `<div>` 요소에 innerHTML로 실시간 값 업데이트

**현재 구현된 Canvas2D 뷰:**

| scene_id | 섹션 | 타입 | 설명 |
|----------|------|------|------|
| `gradient_direction` | Q10 | Canvas2D | f(x,y)=x²+y² 등고선, ∇f 화살표, 방향 d 슬라이더, cos θ / D_d f 실시간 표시 |
| `cst_ast_stepper` | — | Canvas2D | CST/AST 단계별 시각화 (stepper 패턴) |

장면 플러그인 파일 목록은 `<input_dir>/scenes/` 디렉토리를 참조. 매핑은 `<paper>_QnA.meta.json`에서 관리.

**환경:**
- **Forge WebUI** (NOT AUTOMATIC1111 — Stability-AI 레포 삭제됨)
- 설치 위치: `D:\MyProjects\stable-diffusion-webui-forge\`
- 모델: `v1-5-pruned-emaonly.safetensors` (SD 1.5)
- API 엔드포인트: `http://127.0.0.1:7860/sdapi/v1/txt2img`
- GPU: NVIDIA RTX 4060 Ti 16GB — 이미지당 약 5~13초

**Forge 실행 명령:**
```bash
"D:/MyProjects/stable-diffusion-webui-forge/venv/Scripts/python.exe" "D:/MyProjects/stable-diffusion-webui-forge/launch.py" --api --skip-prepare-environment
```

**이미지 생성 도구:** `generate_images.js`

```bash
# 전체 이미지 생성
node tools/generate_images.js

# 특정 이미지만 생성
node tools/generate_images.js --name sd_constraints
```

**프롬프트 작성 가이드:**
- 영어 프롬프트 사용
- `technical illustration`, `engineering diagram`, `studio photography` 등 스타일 지정
- `negative_prompt`: `blurry, low quality, text, watermark, signature, anime, cartoon`
- 해상도: 768x512 (가로) 또는 512x768 (세로)
- 스텝: 30, CFG: 7.5, 샘플러: `DPM++ 2M Karras`

**`generate_images.js` 이미지 설정 추가:**
```js
const IMAGES = [
  {
    name: 'sd_constraints',
    prompt: 'technical illustration, two metal springs...',
    negative_prompt: 'blurry, low quality...',
    width: 768, height: 512,
    steps: 30, cfg_scale: 7.5,
    sampler_name: 'DPM++ 2M Karras',
  },
  // 새 이미지 추가 시 여기에 객체 추가
];
```

## 빌드 도구

### build_qna_html.js

Markdown → 자체 완결형 HTML 변환기. `PaperTranslation/tools/`에 위치.

**사용법:**
```bash
# input-relative 경로 (이미지는 <input_dir>/images/, 출력은 <input_dir>/)
node D:/MyProjects/PaperTranslation/tools/build_qna_html.js "D:/MyProjects/ClothSimulation/qna/논문_QnA.md"

# 커스텀 경로
node D:/MyProjects/PaperTranslation/tools/build_qna_html.js input.md output.html image_dir
```

**기능:**
- Markdown 파싱: 섹션 분리 (`## N. 제목`), 질문/답변 블록, 코드 블록, 테이블
- 인라인 마크업: `$...$` → `\(...\)`, `$$...$$` → `\[...\]`, `**...**` → `<strong>`, `` `...` `` → `<code>`
- SVG 삽입: `<input_dir>/images/*.svg` 파일을 읽어 인라인 SVG로 삽입
- PNG 삽입: `<input_dir>/images/*.png` 파일을 읽어 base64 data URI로 삽입
- Three.js 3D 뷰: `SECTION_META`에 `threejs` 필드가 있는 섹션에 인터랙티브 캔버스 삽입
  - vendor 파일(`three.min.js`, `OrbitControls.js`)을 `<head>`에 인라인
  - 각 섹션의 SVG 다이어그램 아래에 `<canvas>` + 장면 스크립트 삽입
- Canvas2D 인터랙티브 뷰: `SECTION_META`에 `canvas2d` 필드가 있는 섹션에 2D 캔버스 삽입
  - 외부 vendor 불필요 — 순수 Canvas2D API 사용
  - Three.js 뷰 아래(또는 SVG 아래)에 `<canvas>` + 장면 스크립트 삽입
- 목차(TOC) 자동 생성
- MathJax v3 tex-svg 인라인 (오프라인, `vendor/mathjax-tex-svg.js` — SVG 출력은 외부 폰트 불필요)
- 반응형 CSS 내장

**`meta.json` 수정 시 주의:**
- 새 섹션 추가 시 키는 **문자열** (`"1"`, `"4"`) — JS 숫자 키와 다름
- `svg` 또는 `png`가 `null`이면 해당 유형 생략
- 이미지 파일이 없어도 에러 없이 조용히 무시 (Silent skip)
- 새 논문 추가 시 스크립트 수정 없이 `<paper>_QnA.meta.json`만 생성하면 됨

### generate_images.js

Stable Diffusion API 클라이언트. `PaperTranslation/tools/`에 위치.

**사용법:**
```bash
# 전체 이미지 생성 (Forge 서버 실행 필수)
node D:/MyProjects/PaperTranslation/tools/generate_images.js

# 특정 이미지만
node D:/MyProjects/PaperTranslation/tools/generate_images.js --name sd_cloth_buckling
```

**기능:**
- 서버 연결 확인 (`/sdapi/v1/sd-models`)
- 순차 이미지 생성 (VRAM OOM 방지)
- base64 응답 → PNG 파일 저장
- 결과 요약 출력

## 워크플로우

### 1단계: Q&A 내용 작성

1. 번역된 논문을 참고하여 핵심 개념 Q&A 목록 작성
2. `논문_QnA.md` 파일에 Markdown 형식으로 작성
3. 수학 수식은 `$...$` / `$$...$$`로 삽입

### 2단계: 이미지 유형 결정

각 Q&A 섹션에 대해 이미지 유형 결정:

| 기준 | SVG | SD |
|------|-----|-----|
| 기하학적 구조 | O | |
| 정점/간선 라벨 | O | |
| 물리적 현상 | | O |
| 분위기/비유 | | O |
| 수학적 관계 | O | |

### 3단계: SVG 다이어그램 제작

1. AI가 SVG 코드를 직접 작성
2. `work/qna_images/` 디렉토리에 저장
3. 브라우저에서 열어 시각적 확인

### 4단계: SD 이미지 생성

1. `PaperTranslation/tools/generate_images.js`의 `IMAGES` 배열에 프롬프트 설정 추가
2. Forge WebUI 서버 시작
3. `node D:/MyProjects/PaperTranslation/tools/generate_images.js` 실행
4. 결과 확인, 필요 시 프롬프트 조정 후 재생성

### 5단계: HTML 빌드

1. `ClothSimulation/qna/<paper>_QnA.meta.json`에 이미지 매핑 추가/수정
2. 빌드 실행:
   ```bash
   node D:/MyProjects/PaperTranslation/tools/build_qna_html.js "D:/MyProjects/ClothSimulation/qna/<paper>_QnA.md"
   ```
3. 출력 HTML을 브라우저에서 확인

### 6단계: Three.js 3D 뷰 추가 (선택)

기하학적 구조가 있는 섹션에 인터랙티브 3D 뷰를 추가할 때:

1. `<paper>_QnA.meta.json` 해당 섹션에 `"threejs": "<scene_id>"` 필드 추가
2. `<input_dir>/scenes/<scene_id>.js` 파일 작성 (plugin API 준수)
3. 빌드 실행 → HTML에 SVG 아래 `<canvas>` + `<script>` 자동 삽입 확인

**기존 SVG는 유지** — Three.js 캔버스는 SVG 아래에 보조적으로 추가됨.
**빌드 스크립트 수정 불필요** — scene plugin 파일만 추가하면 됨.

### 6b단계: Canvas2D 인터랙티브 뷰 추가 (선택)

2D 개념에 슬라이더 기반 실시간 시각화를 추가할 때:

1. `<paper>_QnA.meta.json` 해당 섹션에 `"canvas2d": "<scene_id>"` 필드 추가
2. `<input_dir>/scenes/<scene_id>.js` 파일 작성 (`type: 'canvas2d'`, plugin API 준수)
3. 빌드 실행 → HTML에 `<canvas>` + `<script>` 자동 삽입 확인

**Three.js 불필요** — 순수 Canvas2D API만 사용.
**빌드 스크립트 수정 불필요** — scene plugin 파일만 추가하면 됨.

### 7단계: 반복 개선

- Q&A 내용 수정 → `<paper>_QnA.md` 편집 → 5단계 재실행
- 이미지 매핑 수정 → `<paper>_QnA.meta.json` 편집 → 5단계 재실행
- SVG 수정 → `ClothSimulation/qna/images/*.svg` 편집 → 5단계 재실행
- SD 이미지 재생성 → 4단계 → 5단계 재실행

## 디렉토리 구조

```
D:\MyProjects\
├── PaperTranslation\                 # 독립 git 레포 — 도구 모음
│   ├── tools/
│   │   ├── build_qna_html.js         # Markdown → HTML 빌드 (input-relative)
│   │   ├── generate_images.js        # SD 이미지 생성 스크립트
│   │   └── vendor/                   # 외부 라이브러리 (오프라인 인라인용)
│   │       ├── three.min.js          # Three.js r137 UMD (618KB)
│   │       ├── OrbitControls.js      # Three.js r137 OrbitControls (26KB)
│   │       └── mathjax-tex-svg.js    # MathJax 3 tex-svg (2,059KB)
│   └── ...
│
└── ClothSimulation\                  # 기존 git 레포
    ├── *.pdf                         # 원본 논문
    ├── translated/                   # 번역 출력물 (HTML + PDF)
    └── qna\                          # Q&A 문서 프로젝트
        ├── 논문_QnA.md               # Bending 논문 Q&A Markdown
        ├── 논문_QnA.meta.json        # Bending 논문 섹션 이미지 매핑
        ├── 논문_QnA.html             # Bending 논문 빌드 출력
        ├── PBD_QnA.md                # PBD 논문 Q&A Markdown
        ├── PBD_QnA.meta.json         # PBD 논문 섹션 이미지 매핑
        ├── PBD_QnA.html              # PBD 논문 빌드 출력
        ├── images/                   # 이미지 저장소 (논문 간 공유, *.svg, *.png)
        └── scenes/                   # 인터랙티브 scene 플러그인 (*.js)
```

## 전제 조건

- **Node.js** (v18+)
- **인터넷 불필요** — MathJax, Three.js 모두 vendor 파일로 오프라인 인라인됨 (SD 이미지 생성 시에만 Forge 서버 필요)
- **Forge WebUI** — SD 이미지 생성 시 필요 (SVG만 사용하면 불필요)
  - 설치: `git clone https://github.com/lllyasviel/stable-diffusion-webui-forge.git`
  - 모델: `models/Stable-diffusion/` 디렉토리에 SD 1.5 모델 배치
  - `--api` 플래그로 실행해야 API 엔드포인트 활성화
- **GPU** (SD 사용 시) — NVIDIA GPU + CUDA, 최소 8GB VRAM 권장

## 핵심 교훈

### Forge vs AUTOMATIC1111
- **AUTOMATIC1111 사용 불가** — Stability-AI의 `stablediffusion.git` 레포가 삭제/비공개 전환되어 설치 중 `Repository not found` 에러 발생
- **Forge WebUI 사용** — AUTOMATIC1111 포크 기반이지만 독립적으로 동작, 자체 레포에서 의존성 관리
- Forge 첫 실행 시 전역 Python에 패키지를 설치할 수 있으므로 반드시 **venv 격리** 확인

### SVG vs SD vs Three.js vs Canvas2D — 시각화 유형 선택 가이드라인

**유형별 강점 비교:**

| 유형 | 최적 사용 상황 | 핵심 강점 | 한계 |
|------|-------------|-----------|------|
| **SVG** (정적) | 토폴로지, 구조 비교, 라벨 기하 | 정확한 라벨, 벡터 선명도, 작은 파일 | 인터랙션 없음 |
| **SD 이미지** | 물리 현상, 사실적 질감, 분위기 | 사실적 시각화, 직관적 비유 | 라벨 불가, 정밀도 낮음 |
| **Three.js 3D** | 3D 회전이 이해를 돕는 기하 구조 | 임의 각도 관찰, 접힘/법선 시각화 | 618KB+ vendor, 2D 개념에 과잉 |
| **Canvas2D** | 본질적 2D + 슬라이더 실시간 변화 | 외부 의존 없음, 실시간 값 표시 | 3D 불가 |

**선택 결정 트리:**
1. 개념이 **3D 공간에서 회전**해야 이해되는가? → Three.js 3D
2. 개념이 **2D**이면서 **매개변수 조절**로 실시간 변화를 보여야 하는가? → Canvas2D
3. **정적 구조/비교**를 보여주는 것이 핵심인가? → SVG
4. **물리적 현상의 실제 모습**이 필요한가? → SD 이미지

**경험 기반 교훈:**
- **이면각/법선/접힘** → Three.js: 3D 회전으로 다른 각도에서 관찰하면 이해도 극대화
- **그래디언트 방향/등고선** → Canvas2D: 본질적으로 2D, 슬라이더로 cos θ 관계를 실시간 확인이 핵심
- **격자 구조/스틱 모델** → SVG: 정적 토폴로지 비교가 핵심, 회전 불필요
- 하나의 섹션에 **SVG(정적) + Three.js/Canvas2D(인터랙티브)** 병행 가능 (SVG가 구조 설명, 인터랙티브가 탐색 제공)

### HTML 빌드 주의사항
- MathJax `skipHtmlTags`에 `code`와 `pre`가 포함되어 있으므로 코드 블록 내 수식은 렌더링되지 않음
- **` ```math ` 블록과 일반 ` ``` ` 블록의 차이**: math 블록은 `<div class="math-block">` (MathJax 처리됨), 일반 블록은 `<div class="code-block"><pre>` (MathJax 무시됨)
- **math-block 내용은 반드시 LaTeX 수식 사용**: `$...$` (인라인), `$$...$$` (디스플레이) — 유니코드 심볼(∂, φ, ∇)은 MathJax가 처리하지 않으므로 `$\partial$`, `$\varphi$`, `$\nabla$` 등으로 작성
- **`inlineMarkdown()` 적용**: math-block 내용에 `$` → `\(\)`, `$$` → `\[\]` 변환 + `**...**` → `<strong>`, `\n` → `<br>` 처리
- **이중 파서 주의**: `markdownToHtml()`과 `convertAnswerBody()` 모두 ` ```math ` 감지 로직이 있음 — 수정 시 양쪽 동기화 필수
- **테이블 셀 내 LaTeX `|` 충돌 방지**: `parseTable()`은 `splitTableRow()`를 사용하여 `$...$` 안의 `|`를 무시함. 단, `\|`(노름)은 마크다운 파이프와 혼동 가능 — 마크다운에서 `\lVert`/`\rVert` 사용 권장
- SVG 삽입 시 XML 선언 (`<?xml ...?>`) 제거 필수
- base64 PNG 삽입 시 파일 크기에 주의 (대형 이미지는 HTML 파일 크기 증가)
- MathJax `tex-svg.js` 소스 코드 내부에 `sre-mathmaps-ie` CDN 참조가 있으나 IE 폴백용이며 런타임에 로드되지 않음 — 무시 가능

### Windows 환경 주의사항
- `python` 명령이 Windows Store 스텁으로 연결될 수 있음 — 항상 전체 경로 사용
- Forge venv의 Python: `D:/MyProjects/stable-diffusion-webui-forge/venv/Scripts/python.exe`
- Bash 셸에서 경로에 **포워드 슬래시(`/`)** 사용
- Forge 로그 출력이 버퍼링될 수 있음 — 서버 상태는 `curl http://127.0.0.1:7860/sdapi/v1/sd-models`로 직접 확인

### Three.js 버전 선택
- **r160+**: UMD 빌드 제거 (ESM only) → `<script>` 인라인 불가
- **r150+**: `examples/js/` 디렉토리 제거 → OrbitControls UMD 없음
- **r137 선택 이유**: UMD `three.min.js` + `examples/js/controls/OrbitControls.js` 모두 존재하는 마지막 안정 버전대
- 새 Three.js 버전이 필요하면 ESM → 번들러 파이프라인이 필요하므로 현재 오프라인 인라인 아키텍처와 호환 불가

### MathJax 오프라인 인라인
- **tex-chtml.js는 사용 불가** — 외부 폰트 파일 로딩이 필요하므로 오프라인 자체 완결 불가능
- **tex-svg.js 선택** — SVG 출력은 폰트 파일 없이 완전 자체 완결
- MathJax 3 CDN에서 `tex-svg.js` 다운로드 후 `vendor/`에 배치, 빌드 시 `<head>`에 인라인
- 소스 코드 내 `sre-mathmaps-ie` CDN 참조는 IE 폴백용이며 일반 브라우저에서 실제 로드되지 않음
- MathJax config에서 `svg: { fontCache: 'local' }` 설정으로 폰트 캐시를 문서 내 SVG `<defs>`에 저장

### 빌드 스크립트 파서 주의사항
- `markdownToHtml()`과 `convertAnswerBody()` 양쪽 모두 펜스드 블록 파서가 존재 — 수정 시 **반드시 양쪽 동기화**
- `inlineMarkdown()` 함수가 `$`/`$$` 변환, 볼드, 코드 스팬, 줄바꿈을 처리 — 코드 스팬(`` `...` ``)은 플레이스홀더로 보호 후 나중에 복원
- `splitTableRow()` 함수가 테이블 파이프 분리 시 `$...$` 내부의 `|` 무시 + `\|` 이스케이프 처리
- LaTeX 노름 기호는 마크다운에서 `\lVert`/`\rVert` 사용 권장 (`\|`는 파이프와 혼동 위험)

### Three.js 3D 씬 — 흔한 실수와 교훈
- **반사 평면 방향**: 반사 축이 Z-negate이면 반사 평면은 XY 평면(z=0)이어야 함. `PlaneGeometry` 기본 방향이 XY이므로 회전 불필요. `rotation.x = -PI/2`로 잘못 눕히면 XZ 평면(수평 바닥)이 됨
- **상태 전환 시 색 변경 주의**: 반사/토글 등 상태 전환에서 기하 구조만 바뀌고 객체 자체는 동일하면, 색상을 바꾸지 말 것. 색 변경은 "다른 객체"라는 오인을 유발
- **좌표계 일관성**: 공유 간선 X축, 날개 Y/Z축 규약에서 반사는 Z-negate(fold 방향 반전), Y-swap은 단순 라벨 교환에 불과

## 운영 원칙

- **노하우 즉시 반영**: 작업 중 발견하는 트러블슈팅, 삽질 경험, 버전 호환성 이슈 등 모든 교훈은 발견 즉시 이 스킬 파일의 "핵심 교훈" 섹션에 기록한다
- **플랜 모드 / 빌드 모드**: 사용자가 질문만 하면 플랜 모드(파일 수정 없음), 문서 추가/수정을 요청하면 빌드 모드(마크다운 편집 + HTML 리빌드)
- **CLI 응답 시 LaTeX 미사용**: 사용자에게 직접 답변할 때는 LaTeX 수식 대신 유니코드 텍스트와 코드 블록으로 표현 (HTML 문서용 마크다운 내에서만 LaTeX 사용)
