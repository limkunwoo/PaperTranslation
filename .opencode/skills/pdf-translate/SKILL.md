---
name: pdf-translate
description: 학술 PDF 논문을 다른 언어로 번역하며, 수식, 이미지(래스터+벡터 그래픽), 문서 구조를 보존합니다. HTML과 PDF로 독립적으로 출력합니다.
license: MIT
compatibility: opencode
metadata:
  audience: researchers
  workflow: translation
---

## 개요

학술 PDF 논문을 대상 언어로 번역하며 다음을 보존합니다:
- 수학 수식 (HTML: MathJax v3 CDN 클라이언트 렌더링, PDF: Typst 네이티브 수식)
- 모든 이미지: 래스터(임베디드 PNG) + 벡터 그래픽(HTML: SVG, PDF: 벡터 PDF 임베딩)
- 문서 구조 (섹션, 하위 섹션, 참고문헌, 부록)
- 인용 참조 원본 유지 (예: [BFA02])
- 저자명 영어 유지
- Figure 참조는 영어로, 설명은 번역

## 출력 아키텍처 ⭐⭐

**YAML 중간 표현(Intermediate Representation)을 통한 두 개의 독립 파이프라인:**

```
원본 PDF → 텍스트 추출 + 이미지 추출 → 번역
                                        ↓
                              YAML 중간 표현 (정규 소스)
                               ↙                ↘
                    yaml_to_html.js         yaml_to_typst.js
                         ↓                       ↓
                 HTML 파이프라인          PDF 파이프라인 (Typst)
                 - MathJax v3 수식       - Typst 네이티브 수식
                 - 인라인 SVG            - 벡터 PDF 직접 임베딩
                 - base64 래스터         - 래스터 PNG 참조
                 → 자체 완결형 HTML       → typst compile → PDF
```

**핵심 원칙:**
- YAML이 **정규 소스(canonical source)**. 모든 콘텐츠 수정은 YAML에서 수행
- HTML→PDF 변환을 하지 않는다. 각 파이프라인이 YAML에서 독립적으로 최적의 형식을 생성
- 수식은 YAML에 **LaTeX**로 저장 (범용). Typst 렌더러가 LaTeX→Typst 변환 수행
- HTML: 벡터 그래픽을 SVG로, 수식을 MathJax v3 CDN으로 (LaTeX 급 품질)
- PDF: 벡터 그래픽을 원본 PDF에서 직접 클리핑, 수식을 Typst 네이티브로

### YAML 중간 표현 스키마 ⭐⭐

YAML 파일은 `metadata` 블록과 `content` 리스트로 구성됩니다.

**메타데이터 블록:**
```yaml
metadata:
  title: "번역된 제목"
  authors: "Author Names (영어 유지)"  # 문자열 또는 배열 ["Author1", "Author2"]
  affiliation: "소속 기관"
  venue: "학회/저널명"
  editors: "편집자"
  copyright: "저작권 정보"  # 빈 문자열이면 렌더러에서 조건부 생략
  source_lang: "en"
  target_lang: "ko"
```

**콘텐츠 노드 타입:**

| 타입 | 필드 | 설명 |
|------|------|------|
| `heading` | `level` (2\|3), `text` | 섹션 제목 |
| `paragraph` | `text`, `indent` (선택) | 본문 문단. `indent: false`면 첫줄 들여쓰기 제거 |
| `equation` | `latex`, `number` (선택), `suffix` (선택) | 디스플레이 수식. LaTeX 형식 저장 |
| `figure` | `source`, `format`, `width`, `caption` | 이미지. `format: vector`이면 source에 확장자 없음 |
| `figure_grid` | `columns`, `items` (각각 `source`, `label`), `caption` | 다중 패널 Figure. 그리드 레이아웃 |
| `table` | `title` (선택), `headers`, `rows`, `caption` | 표. 헤더+데이터 행 |
| `code` | `title` (선택), `text` (또는 `content`) | 의사코드/알고리즘. `title`은 코드 블록 상단 제목 바. `content` 키 우선, `text` 폴백. 본문 내 `$...$`로 인라인 수학 삽입 가능 |
| `list` | `items` | 불릿 리스트 |
| `separator` | (필드 없음) | 시각적 구분선 |

**인라인 마크업 규칙:**
- `$...$` — 인라인 수학/LaTeX
- `**...**` — 볼드
- `*...*` — 이탤릭
- **YAML `|` 텍스트 블록 내 빈 줄 = 논리적 줄바꿈** — HTML에서 `<br><br>`, Typst에서 `\`로 변환

**벡터 Figure 규칙:**
- `format: vector`인 figure의 `source`에는 확장자 없음 (예: `images/fig_2_vector`)
- HTML 생성기: `.svg` 확장자 추가하여 인라인 SVG 삽입
- Typst 생성기: `.pdf` 확장자 추가하여 벡터 PDF 임베딩

**수식 저장 형식:**
- 모든 수식은 **LaTeX** 형식으로 YAML에 저장 (범용 형식)
- `equation` 노드의 `latex` 필드에 디스플레이 수식
- `paragraph`/`heading` 텍스트 내 `$...$`에 인라인 수식
- Typst 파이프라인에서 `math_convert.js`의 `latexToTypst()`로 자동 변환

### 수학 변환기 (math_convert.js) ⭐

LaTeX↔Typst 양방향 수학 수식 변환기. YAML 파이프라인의 핵심 모듈.

**내보내는 함수:**
- `typstToLatex(str)` — Typst 수식 → LaTeX 수식
- `latexToTypst(str)` — LaTeX 수식 → Typst 수식
- `typstTextToYaml(str)` — Typst 본문 텍스트 → YAML 인라인 마크업
- `yamlTextToTypst(str)` — YAML 인라인 마크업 → Typst 본문 텍스트
- `yamlTextToHtml(str)` — YAML 인라인 마크업 → HTML

**변환 규칙 요약:**
| LaTeX | Typst | 비고 |
|-------|-------|------|
| `\frac{a}{b}` | `frac(a, b)` | 중첩 가능 |
| `\mathbf{x}` | `bold(x)` | |
| `\mathbb{R}` | `bb(R)` | |
| `\tilde{x}` | `tilde(x)` | |
| `\text{text}` | `"text"` | 문자열 리터럴 |
| `\begin{pmatrix}..\\...\end{pmatrix}` | `mat(delim: "(", ...; ...)` | 행 구분: `\\`→`;` |
| `\partial` | `partial` | Typst v0.14+ (`diff` deprecated) |
| 그리스 문자 (`\Delta` 등) | `Delta` 등 | 백슬래시 제거 |
| `\left(` / `\right)` | `(` / `)` | Typst 자동 크기 조절, 제거 |
| `\|` | `||` | 이중 수직선/norm 표기 |

**구현 기법:**
- **다중 패스 접근**: 함수 변환 (가장 안쪽부터) → 심볼 변환 → 첨자 그룹핑
- **`\b` 워드 바운더리 사용 금지**: `_`(밑줄)가 워드 문자이므로 regex에서 `\b`가 실패. 대신 `(?<![a-zA-Z])..(?![a-zA-Z])` 사용
- **`\left`/`\right` 제거**: Typst는 구분자 크기를 자동 조절하므로 `\left(`→`(`, `\right)`→`)` 로 변환
- **`\|` → `||`**: LaTeX의 이중 수직선(norm 표기)을 Typst 형식으로 변환
- **테스트**: `test_math.js`로 15개 케이스 + 라운드트립 검증

**⭐ `yamlTextToHtml()` 처리 순서 — 수학 먼저 추출 필수:**

`_text_` 이탤릭 변환이 `$...$` 수학 추출보다 먼저 실행되면, 수식 내부의 언더스코어(`_{i_{n_j}}`)가 이탤릭 마크업으로 오인되어 수식이 손상됩니다.

```
문제 예시: $\mathbf{x}_{i_{n_j}}$
  → }_{i_ 패턴이 _italic_로 오인 → <em>{i</em> 삽입 → 수식 붕괴
```

**해결책**: `yamlTextToHtml()`에서 `$...$`를 null-character 플레이스홀더로 **먼저** 추출 → bold/italic 처리 → 수학 복원. (`yamlTextToTypst()`는 이미 수학을 먼저 처리하므로 문제 없음)

### YAML `|` 블록 스칼라 이중 백슬래시 문제 ⭐⭐

YAML `|` 블록 스칼라는 이스케이프 시퀀스를 처리하지 않습니다. 따라서:
- `|` 블록 내 `\\varphi` → 파싱 후 **리터럴 `\\varphi`** (백슬래시 2개)
- 따옴표 문자열 `"\\varphi"` → 파싱 후 `\varphi` (백슬래시 1개)

이는 `paragraph` 텍스트의 인라인 수식 `$\\varphi$`가 렌더러에 도달할 때 백슬래시가 2개가 됨을 의미합니다.

**해결책:** `yamlTextToTypst()`와 `yamlTextToHtml()` 모두에서 `$...$` 수식 영역 내부의 `\\`를 `\`로 정규화하는 로직을 적용:
```js
// 수식 영역 내 이중 백슬래시 → 단일 백슬래시 정규화
text = text.replace(/\$([^$]+)\$/g, (match, inner) => {
  return '$' + inner.replace(/\\\\/g, '\\') + '$';
});
```

`equation` 노드의 `latex` 필드는 따옴표 문자열을 사용하므로 정상적으로 단일 백슬래시로 파싱됩니다 — 이 문제는 해당 없음.

### Typst 콘텐츠 모드 특수 문자 처리 ⭐

Typst 콘텐츠 모드에서 `"..."` (따옴표)는 "닫히지 않은 문자열" 에러를 유발할 수 있습니다.

**해결책:** `yamlTextToTypst()`에서 수식 영역 **외부**의 `"text"` → `\u201c text \u201d` (유니코드 스마트 따옴표)로 변환:
```js
// 수식 외부 영역에서만 큰따옴표를 유니코드 스마트 따옴표로 변환
// "text" → \u201ctext\u201d
```

### YAML 생성기 ⭐

**yaml_to_html.js** — YAML → 자체 완결형 HTML:
- MathJax v3 CDN으로 수식 렌더링 (인터넷 필요)
- 래스터 이미지: base64 data URI로 임베드
- 벡터 그래픽: `.svg` 파일을 읽어 인라인 SVG로 삽입
- 인라인 마크업(`$...$`, `**...**`, `*...*`, `_..._`) → HTML 태그로 변환
- 빈 줄 → `<br><br>` (논리적 줄바꿈)
- `figure_grid` → CSS grid 레이아웃 (`grid-template-columns: repeat(N, 1fr)`)
- `table` → `<table>` + 스타일링된 `<th>`/`<td>`
- `code` 노드: `content` 키 우선, `text` 키 폴백. `<div class="code-block">` 컨테이너 사용 (`<pre><code>` 아님 — MathJax가 `<pre>` 내부를 스킵하기 때문). `title` 필드가 있으면 `.code-title` 바 렌더링. `highlightPseudocode()` 함수가 `$...$` 수학 영역을 null-character 플레이스홀더로 추출 → HTML 이스케이프 → 줄번호(`.ln`)/키워드(`.kw`)/연산자(`.op`) 하이라이팅 → 수학을 `\(...\)`로 복원하여 MathJax 렌더링
- `metadata.authors`: 문자열과 배열 둘 다 처리 (`Array.isArray()` 체크)
- `metadata.copyright`: 빈 문자열이면 조건부 렌더링 (빈 footer 방지)
- v3 타이포그래피 CSS 내장

**yaml_to_typst.js** — YAML → Typst 소스:
- `math_convert.js`의 `latexToTypst()`로 디스플레이 수식 변환
- `yamlTextToTypst()`로 인라인 수식 포함 텍스트 변환
- 벡터 그래픽: `.pdf` 확장자로 임베딩
- 빈 줄 → `\` (Typst 강제 줄바꿈)
- `figure_grid` → `#figure(grid(columns: N, ...))` + 개별 서브 figure
- `table` → `#figure(table(columns: N, ...))` via `renderTable()`
- `code` 노드: `content` 키 우선, `text` 키 폴백. Content-mode `#block()` 컨테이너 사용 (raw 블록 아님). `title` 필드가 있으면 accent 색상 제목 바 렌더링. `renderTypstCodeLine()` + `processTypstCodeContent()`가 각 줄을 파싱: 줄번호 → `#h(N * 0.5em)` 명시적 들여쓰기 → `$...$` 수학을 `latexToTypst()`로 변환 → Typst 특수문자 이스케이프 → 키워드/연산자 `#text(fill: ...)[]` 하이라이팅 → `\` 줄바꿈으로 결합
- `metadata.authors`: 문자열과 배열 둘 다 처리
- 헤더 제목: 메타데이터에서 동적으로 가져옴 (하드코딩 아님)
- v3 타이포그래피 설정 (색상 팔레트, 줄간격, 여백 등) 내장
- Typst 컴파일 시 에러/경고 0건 달성

**알려진 이슈:**
- YAML의 equations에 행렬 `delim:` 아티팩트가 발생할 수 있음 (`\begin{pmatrix}delim: \text{(} &`)
- 두 생성기 모두 regex로 런타임 보정 적용: `/\\begin\{pmatrix\}delim:\s*\\text\{[^}]*\}\s*&\s*/g` → `\\begin{pmatrix}`
- **근본 해결 완료**: YAML 파일에서 직접 `delim: \text{(} &` 제거 (PBD equations 16 & 17). 새 논문에서도 `typst_to_yaml.js` 변환 시 동일 아티팩트 주의

## 사용 시점

사용자가 PDF 문서 번역을 요청할 때 사용합니다 — 특히 수식, 그림, 구조화된 섹션이 포함된 학술 논문.

## 전제 조건

- **Node.js** (v18+)
- Python 불필요 — 텍스트/이미지 추출 및 HTML 생성은 Node.js로 수행
- **Poppler** (선택사항) — 벡터 그래픽을 SVG로 변환할 때 필요. `winget install oschwartz10612.Poppler`
- **Typst** — PDF 파이프라인에 필수. `winget install Typst.Typst`
  - Typst는 네이티브 수식 조판, 한국어 폰트, PDF 벡터 이미지 임베딩을 지원
  - 브라우저/HTML 중간 단계 없이 직접 조판 → PDF 생성

## 워크플로우

### 1단계: 환경 설정

1. 소스 PDF 옆에 작업 디렉토리 생성 (예: `translated/`)
2. npm 프로젝트 초기화 및 의존성 설치:
   ```
   npm init -y
   npm install pdfjs-dist@3.11.174 sharp canvas katex marked pdf-lib
   ```
   - `pdfjs-dist@3.x` 사용 (CommonJS 호환). 4.x는 ESM 전용이라 많은 환경에서 문제 발생
   - `canvas` (node-canvas): PDF 페이지를 비트맵으로 렌더링할 때 필요
   - `sharp`: 이미지 크롭용
   - `pdf-lib`: PDF→PDF 직접 벡터 복사용
3. Typst 설치 확인:
   ```
   typst --version
   ```

### 2단계: 텍스트 추출

1. `pdfjs-dist/legacy/build/pdf.js`로 각 페이지에서 텍스트 항목 추출
2. 텍스트 항목은 `{text, x, y, fontSize, fontName}` 형태. Y 내림차순 → X 오름차순 정렬
3. 근사 Y 위치로 라인 그룹핑 (2px 임계값 이내)
4. 읽기 쉬운 문단으로 재구성. fontSize/fontName으로 제목 감지
5. 포매팅된 텍스트를 번역 참고용으로 저장

### 3단계: 래스터 이미지 추출

1. pdfjs-dist의 `page.objs.get(name)`으로 임베디드 이미지 객체 추출
2. raw RGBA/RGB 데이터를 `sharp`로 PNG 변환:
   ```js
   sharp(Buffer.from(imgData.data), {
     raw: { width: imgData.width, height: imgData.height, channels: channels }
   }).png().toFile(outputPath);
   ```
3. `images/fig_N_pageP.png`으로 저장

### 4단계: 벡터 그래픽 추출 ⭐

많은 학술 논문에는 PDF 드로잉 명령으로 직접 그려진 벡터 다이어그램이 포함되어 있습니다. 이것들은 이미지 객체로 임베디드되지 않아 `pdfjs-dist`의 이미지 추출로는 얻을 수 없습니다.

**두 가지 형식으로 추출해야 합니다:**
- **SVG** (HTML 파이프라인용): Poppler `pdftocairo -svg`로 변환
- **PDF** (Typst 파이프라인용): `pdf-lib` `embedPage`로 클리핑

#### 방법 A: SVG 변환 (HTML 파이프라인용)

**Poppler의 `pdftocairo` 사용:**

1. 벡터 그래픽이 포함된 페이지를 SVG로 변환:
   ```bash
   pdftocairo -svg -f 4 -l 4 "source.pdf" "images/page_4.svg"
   ```
2. 생성된 SVG는 전체 페이지 내용을 벡터로 담고 있음 (`viewBox="0 0 612 792"`, 단위: pt)
3. **viewBox를 수정하여 특정 영역만 크롭**:
   ```js
   svg = svg.replace(/viewBox="[^"]*"/, `viewBox="${x} ${y} ${w} ${h}"`);
   svg = svg.replace(/width="[^"]*"/, `width="${w}pt"`);
   svg = svg.replace(/height="[^"]*"/, `height="${h}pt"`);
   ```
4. HTML에 인라인 SVG로 삽입 (`overflow="hidden"` 필수)

#### 방법 B: PDF→PDF 직접 벡터 복사 (Typst 파이프라인용)

**pdf-lib의 `embedPage` 사용:**

```js
const { PDFDocument } = require("pdf-lib");
const srcDoc = await PDFDocument.load(srcBytes);
const targetDoc = await PDFDocument.create();

// PDF 좌표계: 원점 좌하단, Y 위로 증가
const embedded = await targetDoc.embedPage(
  srcDoc.getPage(pageIndex),
  { left: 345, bottom: 650, right: 490, top: 715 } // PDF pt 좌표
);

const width = 490 - 345;  // clip 영역 폭
const height = 715 - 650; // clip 영역 높이
const page = targetDoc.addPage([width, height]);
page.drawPage(embedded, { x: 0, y: 0, width, height });
await fs.writeFile("images/fig_N_vector.pdf", await targetDoc.save());
```

**좌표 변환 (SVG → PDF):**
```
PDF_bottom = pageHeight - SVG_y - SVG_height
PDF_top = pageHeight - SVG_y
```

Typst에서 이렇게 추출한 벡터 PDF를 직접 임베딩하면 Form XObject(EmbeddedPdfPage)로 보존되어 래스터화되지 않습니다.

### 5단계: 번역

1. 섹션별로 번역. 대형 논문은 3-4페이지 단위로 분할
2. 번역 규칙:
   - 모든 수학 기호, 수식, 변수명은 원본 유지
   - 인용 참조 (예: [BFA02]) 원본 유지
   - 저자명 영어 유지
   - Figure/Table 참조는 영어로, 설명은 번역
   - 대상 언어의 정중한 학술 문체 사용
   - 직역이 아닌 자연스러운 번역

### 6단계: HTML 파이프라인

1. 번역된 Markdown에서 수식 전처리: `$$...$$`와 `$...$`를 KaTeX 서버사이드 렌더링 HTML로 교체
2. 나머지 Markdown을 `marked`로 HTML 변환
3. 래스터 이미지는 base64 data URI로 임베드
4. **벡터 그래픽은 인라인 SVG로 삽입** (방법 A):
   - XML 선언 제거
   - `overflow="hidden"` 추가
   - `<figure>` 태그로 감싸고 번역된 캡션 추가
5. KaTeX CSS와 폰트(base64 인코딩)를 인라인하여 완전한 자체 완결형 HTML 생성
6. **KaTeX → MathJax v3 변환** (선택적 폴리싱):
   - KaTeX 프리렌더링은 자체 폰트를 사용하여 LaTeX 수준 품질에 미치지 못할 수 있음
   - MathJax v3 CDN (클라이언트 렌더링)으로 전환하면 LaTeX 급 수식 품질 달성
   - 변환 방법:
     ```js
     // cheerio로 HTML 파싱
     // 1. <span class="katex-display"> 내 <annotation encoding="application/x-tex">에서 LaTeX 추출
     // 2. KaTeX span을 \[LATEX\] (display) 또는 \(LATEX\) (inline)로 교체
     // 3. KaTeX @font-face CSS 블록 제거
     // 4. MathJax v3 config + CDN script를 <head>에 추가
     ```
   - **핵심**: 프리렌더링된 KaTeX HTML에는 `<annotation encoding="application/x-tex">` 태그에 원본 LaTeX가 보존되어 있어 역변환이 가능
   - 의존성: `npm install cheerio`

### 7단계: PDF 파이프라인 (Typst) ⭐

#### Typst 파일 작성

번역된 텍스트를 `.typ` 파일로 직접 작성합니다 (HTML→Typst 변환이 아님).

**기본 설정 (한국어 예시):**
```typst
#set text(font: "Malgun Gothic", size: 10pt, lang: "ko")
#set page(paper: "a4", margin: (top: 20mm, bottom: 20mm, left: 15mm, right: 15mm))
#set heading(numbering: none)
#set par(justify: true, leading: 0.65em, first-line-indent: 0pt)
#show heading.where(level: 1): set text(size: 16pt, weight: "bold")
#show heading.where(level: 2): set text(size: 13pt, weight: "bold")
#show heading.where(level: 3): set text(size: 11pt, weight: "bold")
#show figure.caption: set text(size: 9pt)

// 수식 폰트 설정
#show math.equation: set text(font: ("New Computer Modern Math", "Malgun Gothic"))
```

**수식 작성 — LaTeX → Typst 변환 규칙:**

| LaTeX | Typst |
|-------|-------|
| `\frac{a}{b}` | `frac(a, b)` |
| `\mathbf{x}` | `bold(x)` |
| `\Delta` | `Delta` |
| `\nabla` | `nabla` |
| `\partial` | `partial` (Typst v0.14+, `diff`는 deprecated) |
| `\sum_{i}` | `sum_i` |
| `\sqrt{x}` | `sqrt(x)` |
| `\begin{pmatrix}...\end{pmatrix}` | `mat(delim: "(", ...; ...; ...)` |
| `\times` | `times` |
| `\cdot` | `dot` |
| `\leq` | `lt.eq` 또는 `<=` |
| `\geq` | `gt.eq` 또는 `>=` |
| `\mathbb{R}` | `bb(R)` |
| `\tilde{x}` | `tilde(x)` |
| `\in` | `in` |
| `\rightarrow` | `arrow.r` |

**이미지 삽입:**
```typst
// 래스터 이미지
#figure(
  image("images/fig_1_page2.png", width: 100%),
  caption: [Figure 1: 번역된 캡션 텍스트]
)

// 벡터 PDF (직접 임베딩 — 래스터화 안 됨!)
#figure(
  image("images/fig_2_vector.pdf", width: 70%),
  caption: [Figure 2: 벡터 다이어그램 캡션]
)
```

#### Typst 문법 주의사항 ⭐⭐

1. **인라인 수학 변수는 반드시 `$...$`로 감싸기:**
   - ✗ `정점 _i_의 질량 _m_i_` — Typst에서 `_`는 이탤릭 마커
   - ✓ `정점 $i$의 질량 $m_i$`

2. **특수 문자 이스케이프:**
   - `[`, `]` → `\[`, `\]`
   - `{`, `}` → `\{`, `\}`
   - `_`, `*` → body text에서 Typst 마크업 문자이므로 주의

3. **디스플레이 수식:** `$ ... $` (줄바꿈으로 구분)
4. **인라인 수식:** `$...$` (공백 없이)
5. **`diff`는 deprecated** (Typst v0.14+): `partial`을 사용
6. **의사코드/알고리즘:** YAML `code` 노드에서 `title` + `content` 사용. 코드 내 `$...$`로 수식 삽입 가능. 렌더러가 자동으로 구문 강조 + 수학 변환 처리

#### 컴파일

```bash
typst compile Position_based_dynamics_KO.typ
```

Typst는 `.typ` 파일과 같은 디렉토리 기준으로 이미지 경로를 해석합니다.

## 핵심 교훈

### 의존성
- `pdfjs-dist@4.x`는 ESM 전용; CommonJS 호환을 위해 `@3.11.174` 사용
- Windows에서 Python은 Microsoft Store 스텁만 있을 수 있음 — 모든 처리를 Node.js로
- Typst는 `winget install Typst.Typst`로 설치, 한국어 시스템 폰트(Malgun Gothic) 자동 감지

### 벡터 그래픽
- PDF 벡터 그래픽은 이미지 객체가 아님 → `pdfjs-dist` 이미지 추출로 얻을 수 없음
- **HTML용**: `pdftocairo -svg` (Poppler)로 SVG 변환 → viewBox 크롭 → 인라인 SVG
- **PDF용**: `pdf-lib` `embedPage`로 PDF→PDF 직접 벡터 클리핑 → Typst에서 `image()` 임베딩
- SVG viewBox 크롭 시 `overflow="hidden"` 필수
- Typst는 벡터 PDF를 Form XObject(EmbeddedPdfPage)로 보존함 — 래스터화 없음

### Typst vs Puppeteer (PDF 생성)
- **Puppeteer (HTML→PDF) 문제점:**
  - 벡터 그래픽이 SVG→Chromium→PDF 경로를 거치며 품질 저하 가능
  - 수식이 KaTeX HTML→Chromium 렌더링→PDF로 변환
  - 마커 텍스트 방식의 좌표 매핑이 복잡하고 불안정
  - HTML→PDF는 "독립 파이프라인"이 아님
- **Typst (직접 조판→PDF) 장점:**
  - 벡터 PDF를 원본에서 직접 임베딩 (최고 품질)
  - 수식을 네이티브로 조판 (LaTeX 급 품질)
  - 브라우저 불필요, 빠른 컴파일
  - `.typ` 파일 자체가 명확한 소스

### 좌표 체계 주의점
- **SVG** (pdftocairo 출력): 원점 좌상단, Y 아래로 증가
- **PDF** (pdf-lib): 원점 좌하단, Y 위로 증가
- **래스터 이미지** (3x 렌더링): 원점 좌상단, px÷3 = PDF pt
- 변환 공식: `PDF_bottom = pageHeight - SVG_y - SVG_height`

### 크롭 좌표 결정 팁
1. 먼저 3배 스케일 래스터로 전체 페이지 렌더링
2. 시각적으로 다이어그램 영역의 픽셀 좌표 파악
3. 픽셀÷3으로 PDF pt 좌표 변환
4. SVG viewBox 또는 pdf-lib clip에 적용
5. 결과 확인 후 미세 조정 (특히 라벨, 캡션 포함 여부)

### HTML 생성 팁
- Puppeteer에서 `page.goto("file:///...")` 사용 — `page.setContent()`는 대용량 HTML(>10MB)에서 타임아웃
- KaTeX 폰트를 CSS에 base64로 인라인해야 자체 완결형 HTML
- 이미지→Figure 매핑 시 추출 순서가 Figure 번호와 다를 수 있음 — 페이지 번호/캡션으로 교차 확인 필요

### 타이포그래피 폴리싱 ⭐

번역 완료 후 가독성을 위한 타이포그래피 조정이 필수적입니다.

#### Typst (.typ → PDF) 타이포그래피 핵심 설정

```typst
// 페이지: 넉넉한 여백 (24mm 좌우, 28mm 상하)
#set page(paper: "a4", margin: (top: 28mm, bottom: 28mm, left: 24mm, right: 24mm))

// 본문: 10.5pt, 넉넉한 줄간격 (1.1em), 첫줄 들여쓰기 (1em), 문단 간격 (1.9em)
#set text(font: "Malgun Gothic", size: 10.5pt, lang: "ko")
#set par(justify: true, leading: 1.1em, first-line-indent: 1em, spacing: 1.9em)

// 제목: 본문과 같은 폰트 또는 별도 산세리프 (Malgun Gothic)
// heading show rule에서 v()로 상하 간격 명시적 제어
#show heading.where(level: 2): it => {
  set text(size: 13pt, weight: "bold", font: "Malgun Gothic")
  set par(first-line-indent: 0pt)
  v(1.2em)
  it
  v(0.4em)
}

// 의사코드: content-mode #block() 컨테이너로 렌더링
// (yaml_to_typst.js의 renderCode()가 자동 생성)
// raw 블록(```)은 내부에 수학/스타일링 마크업 불가하므로 사용하지 않음

// Figure 전후 간격
#show figure: it => { v(0.8em); it; v(0.8em) }

// 페이지 머리글/바닥글 (선택)
// header: context 사용, 첫 페이지 제외
// footer: 페이지 번호 중앙
```

**핵심 포인트:**
- 한국어 본문의 `leading`은 최소 1.0em 이상 (기본 0.65em은 너무 좁음, 1.1em 추천)
- `spacing` (문단 간 거리)도 1.5em 이상으로 설정해야 문단 구분이 명확 (1.9em 추천)
- `first-line-indent`를 사용하면 문단 간 시각적 구분이 더 명확
- 제목/캡션/의사코드에서는 `first-line-indent: 0pt` 명시 필수
- **Variable font 경고**: Noto Serif KR 등 variable font는 Typst에서 경고 발생 → Malgun Gothic (정적 폰트) 추천
- **`#show strong: set text(font: "Malgun Gothic")`** — bold 텍스트에 별도 폰트 지정 가능

#### 색상 팔레트 (학술 문서용)

```typst
#let accent = rgb("#1a5276")      // 진한 파랑 — 제목, 강조
#let accent-light = rgb("#2980b9") // 밝은 파랑 — 소제목
#let accent-sub = rgb("#5b7d9a")   // 회색 청록 — 3단계 제목, 머리글/바닥글
#let rule-color = rgb("#b0c4d8")   // 부드러운 청회색 — 구분선
#let caption-fg = rgb("#4a6a7d")   // 회색 — 캡션
#let code-bg = rgb("#f4f7fa")      // 매우 밝은 청회색 — 코드 배경
#let bg-cream = rgb("#fefdfb")     // 따뜻한 오프화이트 — 페이지 배경
```

- 제목에 accent 색상 적용, h2에 밑줄 구분선 추가
- 페이지 배경을 따뜻한 오프화이트로 설정하면 눈의 피로 감소
- 코드 블록에 파란 톤 배경 + 왼쪽 accent 테두리

#### 문단 내 논리적 줄바꿈 ⭐

긴 문단(200자 이상)에서 주제가 약간 전환되는 지점에 줄바꿈을 삽입하면 가독성이 크게 향상됩니다.

- **Typst**: `\` (백슬래시) 삽입 — 강제 줄바꿈 (새 문단 아님)
- **HTML**: `<br><br>` 삽입 — 시각적 단락 분리
- **삽입 기준**: 주제 전환, 논증 단계 변경, 예시 시작 등 논리적 경계
- **자동화가 아닌 수동 삽입**: 문맥을 이해해야 하므로 AI가 텍스트를 읽고 직접 판단
- 보통 200~300자 단위로 1~2개의 줄바꿈이 적절

#### HTML CSS 타이포그래피 핵심 설정

```css
body {
  font-family: 'Noto Serif KR', 'Batang', 'Georgia', serif; /* 세리프 본문 */
  font-size: 16px;
  line-height: 1.9;           /* 한국어: 1.8~2.0 권장 */
  letter-spacing: -0.01em;    /* 한국어 자간 미세 조정 */
  word-spacing: 0.05em;
  max-width: 780px;           /* 적절한 읽기 폭 */
  word-break: keep-all;       /* 한국어 단어 단위 줄바꿈 */
  text-rendering: optimizeLegibility;
}

p {
  text-indent: 1.5em;         /* 첫줄 들여쓰기 */
  margin: 0 0 12px 0;
  word-break: keep-all;
}

/* 제목 뒤 첫 문단: 들여쓰기 제거 */
h1 + p, h2 + p, h3 + p { text-indent: 0; }

/* 제목은 산세리프 */
h1, h2, h3 {
  font-family: 'Malgun Gothic', 'Noto Sans KR', sans-serif;
}

/* Bold 텍스트도 산세리프 */
strong, b {
  font-family: 'Malgun Gothic', 'Noto Sans KR', sans-serif;
}
```

**핵심 포인트:**
- `word-break: keep-all` — 한국어 단어 단위 줄바꿈 (가독성 대폭 향상)
- `line-height: 1.9` — 한국어는 영어보다 줄간격이 넓어야 함
- 본문 세리프 + 제목 산세리프 조합이 시각적 위계 형성에 효과적
- `text-indent`로 첫줄 들여쓰기하되, 제목 직후 문단은 제외
- 인쇄 시 `font-size: 11pt`, `box-shadow: none` 등 별도 @media print 스타일
- 모바일 대응: `@media (max-width: 600px)`에서 폰트/간격 축소

#### 공통 원칙

1. **한국어 텍스트는 영어보다 줄간격이 넓어야 한다** — 글자 높이가 크고 획이 복잡하므로
2. **문단 간격 + 첫줄 들여쓰기** 조합이 학술 문서에 적합
3. **제목/본문 폰트 분리**가 시각적 위계를 명확하게 함
4. **의사코드/코드 블록**에 배경색과 테두리를 주어 본문과 시각적 구분
5. **Figure 캡션**은 본문보다 작은 크기(9pt/0.88em), 회색 톤

### YAML 이스케이프 처리 주의점 ⭐

YAML plain scalar에서 `[text]`는 YAML 시퀀스로 파싱될 수 있으므로 `\[text\]`로 이스케이프합니다. 그러나 **렌더러(HTML/Typst 생성기)에서 반드시 `\[` → `[`, `\]` → `]`로 복원해야** 합니다.

- `yamlTextToHtml()`: `$...$` → `\(...\)` 변환 **이후에** `\[`/`\]` 복원 (수식 변환이 먼저)
- `yamlTextToTypst()`: 동일하게 수식 변환 이후 복원
- 수식 안의 `\[`도 LaTeX inline math에서는 불필요한 이스케이프이므로 일괄 제거해도 안전
- `_text_` 언더스코어 이탤릭도 `yamlTextToHtml()`에서 `<em>text</em>`로 변환 필요 (YAML 스키마에서 `*text*`와 `_text_` 둘 다 이탤릭으로 사용)

### 벡터 크롭 좌표 미세조정

- 초기 크롭 좌표는 3x 래스터 렌더링 기반 추정치이므로, **생성 후 반드시 시각적 확인** 필요
- 특히 좌하단/우하단의 라벨, 첨자, 수식 텍스트가 잘리기 쉬움
- 넉넉한 패딩(10~20pt) 추가 권장

### 프로젝트 디렉토리 구조 (다중 논문 관리)

번역 도구는 독립 프로젝트 `PaperTranslation/`으로 분리되어 있습니다:

```
D:\MyProjects\
├── PaperTranslation\             # 독립 git 레포 — 번역 도구 + QnA 빌드 도구
│   ├── package.json              # 의존성 (paper-translation)
│   ├── tools/                    # 공유 스크립트 (재사용)
│   │   ├── extract.js
│   │   ├── math_convert.js
│   │   ├── yaml_to_html.js
│   │   ├── yaml_to_typst.js
│   │   ├── extract_vector_pdfs.js
│   │   ├── crop_vectors_svg.js
│   │   ├── build_qna_html.js     # QnA 빌드 (input-relative 경로)
│   │   ├── generate_images.js    # SD API 클라이언트
│   │   └── vendor/               # 외부 라이브러리 (three.min.js 등)
│   ├── work/                     # 논문별 중간 파일
│   │   ├── position_based_dynamics/
│   │   └── triangle_bending/
│   └── output/                   # 최종 번역 결과물
│       ├── paper_name_KO.html
│       └── paper_name_KO.pdf
│
└── ClothSimulation\              # 기존 git 레포
    ├── *.pdf                     # 원본 논문 PDF
    ├── ClothSimulation\          # Unity 프로젝트
    └── qna\                      # Q&A 문서 프로젝트
        ├── 논문_QnA.md
        ├── images/               # SVG 다이어그램
        └── output/               # QnA HTML 출력
```

- `PaperTranslation/tools/`: 논문 간 공유되는 재사용 가능한 스크립트
- `PaperTranslation/output/`: 최종 HTML/PDF 결과물만 보관 (사용자에게 전달하는 파일)
- `PaperTranslation/work/`: 논문별 중간 파일 (YAML, Typst, 이미지, 추출 텍스트)
- `ClothSimulation/qna/`: Q&A 문서 (원본 논문 옆에 배치)

### 도구 CLI 사용법

모든 도구는 CLI 인수를 받으며, 경로를 하드코딩하지 않습니다:

```bash
# 텍스트/이미지 추출
node D:/MyProjects/PaperTranslation/tools/extract.js "source.pdf" "D:/MyProjects/PaperTranslation/work/paper_name/"

# YAML → HTML
node D:/MyProjects/PaperTranslation/tools/yaml_to_html.js "D:/MyProjects/PaperTranslation/work/paper_name/paper_KO.yaml" "D:/MyProjects/PaperTranslation/output/paper_KO.html"

# YAML → Typst
node D:/MyProjects/PaperTranslation/tools/yaml_to_typst.js "D:/MyProjects/PaperTranslation/work/paper_name/paper_KO.yaml" "D:/MyProjects/PaperTranslation/work/paper_name/paper_KO.typ"

# Typst → PDF
typst compile "D:/MyProjects/PaperTranslation/work/paper_name/paper_KO.typ" "D:/MyProjects/PaperTranslation/output/paper_KO.pdf"

# QnA 빌드 (input-relative 경로 — 출력은 입력 파일 옆 output/ 디렉토리)
node D:/MyProjects/PaperTranslation/tools/build_qna_html.js "D:/MyProjects/ClothSimulation/qna/논문_QnA.md"
```

### Bash 셸 주의사항 (Windows)

- Bash 셸 사용 시 `&` 연산자 사용 금지 (PowerShell 아님)
- 경로에 백슬래시(`\`) 사용 시 EOF 이슈 발생 가능 → **포워드 슬래시(`/`) 사용 권장**
- 긴 명령은 `&&`로 체이닝

### BOM 손상 주의 ⭐⭐

YAML 파일을 Node.js로 읽고 다시 쓸 때, UTF-8 BOM (Byte Order Mark, `\uFEFF`)이 문제를 일으킬 수 있습니다:

- `fs.readFileSync('file.yaml', 'utf8')`로 읽으면 BOM이 문자열 첫 문자로 포함됨
- `split('\n')` + `join('\n')` + `writeFileSync`로 다시 쓰면 BOM은 보존되지만 첫 키의 첫 문자가 소실될 수 있음
- 예: `metadata:` → BOM + `etadata:` → YAML 파싱 실패

**해결책:**
```js
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/^\uFEFF/, ''); // BOM 제거
```

- **규칙**: YAML 파일을 처리하는 모든 스크립트에서 반드시 BOM을 먼저 제거할 것
- BOM 손상이 발견되면 `metadata:` 키의 `m`이 누락되었는지 확인

### YAML 들여쓰기 엄격성 ⭐

`js-yaml`은 들여쓰기가 일관되지 않으면 파싱에 실패합니다:

- 콘텐츠 노드의 `text:` 필드는 반드시 **4-space 들여쓰기** 유지
- 5-space 들여쓰기가 섞이면 `bad indentation of a mapping entry` 에러 발생
- AI가 YAML을 생성할 때 간헐적으로 5-space 들여쓰기를 삽입하는 경우가 있음

**진단 방법:**
```bash
node -e "require('js-yaml').load(require('fs').readFileSync('file.yaml','utf8'))"
```
에러 메시지의 `line:` 번호로 문제 위치 특정 가능

### 이탤릭 `*` 정규식 충돌 방지 ⭐

인용 참조에 `*`가 포함된 경우 (예: `[BWR*08]`, `[WBH*07]`) 이탤릭 마크업 `*...*`과 충돌합니다.

**수정된 정규식 (math_convert.js line 523):**
```js
// 수정 전 (오작동):
// (?<!\*)\*(?!\*)...\*(?!\*)
// → [BWR*08] 내부의 *가 이탤릭 시작으로 인식됨

// 수정 후:
// (?<![a-zA-Z0-9*])\*(?!\*)...\*(?![a-zA-Z0-9*])
// → 앞뒤로 영숫자나 *가 붙어있으면 이탤릭으로 인식하지 않음
```

- 인용 참조 내 `*`는 영숫자와 인접하므로 이탤릭으로 오인되지 않음
- 새 논문 처리 시에도 동일 패턴의 인용이 있는지 확인 필요

### Node.js에서 LaTeX 문자열 처리 함정 ⭐⭐

Node.js에서 LaTeX가 포함된 문자열을 처리할 때 이스케이프 시퀀스가 예기치 않게 변환됩니다:

| 코드 내 문자열 | 실제 결과 | 문제 |
|-------------|---------|------|
| `"\nabla"` | `<줄바꿈>abla` | `\n` → 줄바꿈 |
| `"\varphi"` | `<수직탭>arphi` | `\v` → 수직탭 |
| `"\text"` | `<탭>ext` | `\t` → 탭 |

**해결책:**
1. **`String.raw`** 사용: `` String.raw`\nabla` `` → 리터럴 `\nabla`
2. **`.js` 파일로 작성 후 실행**: `write` 도구로 파일 생성 → `node file.js` 실행
3. **`node -e` 회피**: template literal 내 LaTeX가 있으면 반드시 `.js` 파일로 분리

이 문제는 YAML 파일 수정 스크립트, 수식 변환 테스트 등에서 빈번하게 발생합니다.

### 용어 번역 방침 ⭐⭐

번역 시 기술 용어 표기 방침:

- **순수 한국어 번역을 기본으로 사용** — `영어(한국어)` 혼합 표기 방식은 가독성을 저하시킴
- 한국어 번역이 충분히 확립된 용어는 한국어만 사용 (예: "위치 기반 동역학", "제약 조건 투영")
- 약어가 널리 사용되는 경우만 원어 병기 (예: "PBD (Position Based Dynamics)")
- **번역 후 용어 수정을 요청받으면 YAML을 수정하고 양 파이프라인 재생성** — HTML이나 Typst를 직접 수정하지 않음

### 모지바케/손상 텍스트 복구 프로세스 ⭐

YAML 파일에 모지바케(문자 깨짐)가 발생한 경우:

1. **HTML 파일을 source of truth로 사용** — 이미 렌더링된 HTML에는 올바른 텍스트가 보존되어 있음
2. **손상된 YAML 문단을 식별** — 문단 번호 또는 `$...$` 수식 패턴으로 대응 관계 파악
3. **HTML에서 텍스트를 추출하여 YAML에 복원** — HTML 태그 제거, 인라인 마크업(`$...$`, `**...**`) 재적용
4. **검증**: YAML 파싱 → HTML/PDF 재생성 → 시각적 확인

**발생 원인:**
- Node.js 스크립트에서 인코딩 불일치
- 파일 I/O 시 BOM 처리 실패
- regex 치환 중 유니코드 한국어 문자 손상

**예방:**
- YAML 수정 스크립트는 항상 `utf8` 인코딩 명시
- BOM 제거 후 처리
- 대규모 치환 전 백업 생성

### 의사코드(Pseudocode) 코드 블록 아키텍처 ⭐⭐

코드 블록(`type: code`)은 제목 바, 구문 강조, 인라인 수학 렌더링을 지원합니다.

#### YAML 스키마

```yaml
- type: code
  title: "Algorithm 1 — 시뮬레이션 루프"  # 선택. 코드 블록 상단 제목 바
  content: |-
    (1) for all time steps
    (2)     $v_i$ ← $v_i + \Delta t f_{\text{ext}}(x_i)$
    (3) endfor
```

- `title` 필드: 코드 블록 상단에 accent 색상 제목 바로 렌더링
- `$...$` 인라인 수학: 코드 본문 내에서 LaTeX 수식 삽입 가능

#### HTML 렌더러 (`yaml_to_html.js`)

**핵심: `<div class="code-block">` 사용 (`<pre><code>` 아님)**

MathJax v3은 기본 `skipHtmlTags` 설정에서 `<pre>`와 `<code>` 내부의 수식을 무시합니다.
따라서 코드 블록에서 수학 렌더링을 지원하려면 `<div>` 기반 구조가 필요합니다.

```html
<div class="code-block">
  <div class="code-title">Algorithm 1 — 시뮬레이션 루프</div>
  <div class="code-body">
    <!-- white-space: pre로 공백 보존 -->
    <!-- MathJax가 \(...\) 인라인 수식을 렌더링 -->
  </div>
</div>
```

**`highlightPseudocode()` 처리 순서:**
1. `$...$` 수학 영역 추출 → null-character 플레이스홀더 (`\x00MATH0\x00`)
2. HTML 이스케이프 (`<`, `>`, `&`)
3. 줄번호(`.ln`), 연산자(`.op`, ← ≠), 키워드(`.kw`, for/endfor/if/else 등) 하이라이팅
4. 수학 복원: 플레이스홀더 → `\(...\)` (MathJax 인라인 수식)

#### Typst 렌더러 (`yaml_to_typst.js`)

**핵심: Content-mode `#block()` + 명시적 `#h()` 들여쓰기**

이전에 content-mode 접근이 공백 축소 문제로 실패했으나, **각 공백을 `#h(0.5em)`으로 명시적 변환**하여 해결:

```typst
#block(width: 100%, fill: code-bg, stroke: (left: 2.5pt + accent), radius: 3pt, inset: 0pt)[
  #block(width: 100%, fill: accent, inset: (x: 14pt, y: 6pt), radius: (top: 3pt))[
    #text(fill: white, weight: "bold", size: 9pt)[Algorithm 1 — 시뮬레이션 루프]
  ]
  #block(inset: (x: 14pt, y: 10pt))[
    #set text(font: "Consolas", size: 9pt)
    #set par(first-line-indent: 0pt, leading: 0.7em)
    // 각 줄이 renderTypstCodeLine()으로 처리됨
    #text(fill: luma(150))[1]#h(1.0em)#text(fill: accent, weight: "bold")[for all] time steps\
    ...
  ]
]
```

**`renderTypstCodeLine()` + `processTypstCodeContent()` 처리 순서:**
1. 줄번호 추출 → `#text(fill: luma(150))[N]`
2. 줄번호 뒤 공백 → `#h(N * 0.5em)` 명시적 들여쓰기
3. `$...$` 수학 추출 → 플레이스홀더 → `latexToTypst()` 변환 → Typst `$...$`로 복원
4. Typst 특수문자 이스케이프 (`#$[]*_\@`~<>`)
5. 키워드 → `#text(fill: accent, weight: "bold")[...]`
6. 연산자 (← ≠) → `#text(fill: rgb("#d63384"))[...]`
7. 줄 결합: `\` (Typst 강제 줄바꿈)

**이전 실패와의 차이점:**
- 이전 시도: 다중 공백이 자동 축소되어 들여쓰기가 깨짐
- 현재 해결: 줄번호 뒤 공백 수를 세어 `#h(N * 0.5em)`으로 1:1 명시적 변환
- Raw 블록(`` ``` ``)은 공백을 보존하지만 내부에 Typst 마크업(`#text()`, `$...$`)을 삽입할 수 없음 → content-mode가 유일한 해결책

#### `\,T` 버그 (해결됨)

YAML 코드 블록에서 `$I = \sum_i \tilde{r}_i^{\,T} \tilde{r}_i m_i$`의 `\,`가 `latexToTypst()`에서 Typst `thin`으로 변환되면, `T`가 바로 뒤따라 `thinT`가 되어 Typst가 알 수 없는 변수로 인식합니다.

**해결책:** YAML에서 `^{\,T}` → `^{T}`로 수정 (코드 블록 맥락에서 thin space는 불필요).

#### 현재 상태 (완성)

- **HTML**: `<div class="code-block">` + MathJax `\(...\)` 수학 렌더링 + 키워드/줄번호/연산자 구문 강조 — 정상 동작
- **Typst**: Content-mode `#block()` + `#h()` 들여쓰기 + `latexToTypst()` 수학 변환 + 키워드/연산자 하이라이팅 — 정상 컴파일, 에러 0건
