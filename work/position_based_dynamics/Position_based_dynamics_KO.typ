// Position Based Dynamics - Korean Translation
// Generated from YAML intermediate representation

// ─── Color Palette ───
#let accent = rgb("#1a5276")
#let accent-light = rgb("#2980b9")
#let accent-sub = rgb("#5b7d9a")
#let rule-color = rgb("#b0c4d8")
#let caption-fg = rgb("#4a6a7d")
#let code-bg = rgb("#f4f7fa")
#let code-border = rgb("#d4dde6")
#let bg-cream = rgb("#fefdfb")

// ─── Page Setup ───
#set page(
  paper: "a4",
  margin: (top: 28mm, bottom: 28mm, left: 24mm, right: 24mm),
  fill: bg-cream,
  header: context {
    if counter(page).get().first() > 1 [
      #set text(size: 7.5pt, fill: accent-sub, font: "Malgun Gothic")
      #h(1fr) Position Based Dynamics — 한국어 번역
    ]
  },
  footer: context {
    set text(size: 8pt, fill: accent-sub, font: "Malgun Gothic")
    align(center)[#counter(page).display()]
  },
)

// ─── Text & Paragraph ───
#set text(font: "Malgun Gothic", size: 10.5pt, lang: "ko", fill: luma(30))
#set par(justify: true, leading: 1.1em, first-line-indent: 1em, spacing: 1.9em)

// ─── Headings ───
#set heading(numbering: none)

#show heading.where(level: 1): it => {
  set text(size: 20pt, weight: "bold", font: "Malgun Gothic", fill: accent)
  set par(first-line-indent: 0pt)
  v(0.4em)
  it
  v(0.3em)
}

#show heading.where(level: 2): it => {
  set text(size: 13pt, weight: "bold", font: "Malgun Gothic", fill: accent)
  set par(first-line-indent: 0pt)
  v(1.6em)
  block(below: 0.5em)[
    #it
    #v(0.15em)
    #line(length: 100%, stroke: 0.4pt + rule-color)
  ]
}

#show heading.where(level: 3): it => {
  set text(size: 11.5pt, weight: "bold", font: "Malgun Gothic", fill: accent-light)
  set par(first-line-indent: 0pt)
  v(1.2em)
  it
  v(0.4em)
}

// ─── Figures ───
#show figure: it => {
  v(1.2em)
  it
  v(1.2em)
}
#show figure.caption: it => {
  set text(size: 9pt, fill: caption-fg)
  set par(first-line-indent: 0pt, leading: 0.7em)
  v(0.5em)
  it
}

// ─── Code Blocks ───
#show raw.where(block: true): it => {
  set text(font: "Consolas", size: 9pt, fill: luma(40))
  set par(first-line-indent: 0pt, leading: 0.75em)
  v(0.4em)
  block(
    width: 100%,
    fill: code-bg,
    stroke: 0.5pt + code-border,
    radius: 4pt,
    inset: (x: 16pt, y: 12pt),
    it,
  )
  v(0.4em)
}
#show raw.where(block: false): set text(font: "Consolas", size: 9.5pt)

// ─── Math ───
#show math.equation: set text(font: ("New Computer Modern Math", "Malgun Gothic"))

// ─── Lists ───
#set list(indent: 1.2em, body-indent: 0.5em, spacing: 0.8em)

// ─── Strong text styling ───
#show strong: set text(font: "Malgun Gothic", fill: accent)

// ─── Horizontal Rules ───
#let separator() = {
  v(1em)
  line(length: 100%, stroke: 0.6pt + rule-color)
  v(1em)
}

#align(center)[
  #set par(first-line-indent: 0pt, leading: 0.7em)
  #text(size: 22pt, weight: "bold", font: "Malgun Gothic", fill: accent)[Position Based Dynamics]
  #v(0.6em)
  #text(size: 11pt, weight: "bold", fill: luma(40))[Matthias Müller, Bruno Heidelberger, Marcus Hennix, John Ratcliff]
  #v(0.2em)
  #text(size: 10pt, fill: accent-sub)[AGEIA]
  #v(0.5em)
  #text(size: 9pt, style: "italic", fill: luma(100))[
    3rd Workshop in Virtual Reality Interactions and Physical Simulation "VRIPHYS" (2006)\
    C. Mendoza, I. Navazo (Editors)
  ]
]

#separator()

== Abstract

#par(first-line-indent: 0pt)[컴퓨터 그래픽스에서 동적 시스템 시뮬레이션을 위한 가장 대중적인 접근법은 힘 기반(force based) 방식입니다. 내부 및 외부 힘을 누적한 후, 뉴턴의 운동 제2법칙에 기반하여 가속도를 계산합니다. 그런 다음 시간 적분 방법을 사용하여 속도를 갱신하고 최종적으로 물체의 위치를 갱신합니다. 일부 시뮬레이션 방법(대부분의 강체 시뮬레이터)은 충격량 기반 동역학(impulse based dynamics)을 사용하여 속도를 직접 조작합니다. \
본 논문에서는 속도 계층마저도 생략하고 위치에 직접 작용하는 접근법을 제시합니다. 위치 기반 접근법의 주된 장점은 제어 가능성(controllability)입니다. 힘 기반 시스템에서 명시적 적분 기법의 오버슈팅 문제를 방지할 수 있습니다. 또한 충돌 제약 조건을 쉽게 처리할 수 있으며, 점들을 유효한 위치로 투영함으로써 관통(penetration)을 완전히 해소할 수 있습니다. \
본 접근법을 사용하여 게임용 물리 소프트웨어 라이브러리의 일부인 실시간 천 시뮬레이터를 구축하였습니다. 이 응용 사례는 본 방법의 강점과 장점을 보여줍니다.]

#par(first-line-indent: 0pt)[#text(size: 9pt)[*Categories and Subject Descriptors* (according to ACM CCS): I.3.5 \[Computer Graphics\]: Computational Geometry and Object Modeling — Physically Based Modeling; I.3.7 \[Computer Graphics\]: Three-Dimensional Graphics and Realism — Animation and Virtual Reality]]

#separator()

== 1. 서론

컴퓨터 그래픽스에서 물리 기반 애니메이션 분야의 연구는 강체, 변형 가능한 물체 또는 유체 흐름과 같은 물리 현상의 시뮬레이션을 위한 새로운 방법을 찾는 것에 관심을 두고 있습니다. 정확도가 주된 관심사인 전산과학 분야와 달리, 이 분야에서의 주요 관심사는 안정성(stability), 견고성(robustness), 속도(speed)이며, 결과는 시각적으로 그럴듯하게 유지되어야 합니다. \
따라서 전산과학의 기존 방법을 그대로 채용할 수는 없습니다. 실제로, 컴퓨터 그래픽스에서 물리 기반 시뮬레이션 연구를 수행하는 주된 정당성은 이 분야의 특수한 요구에 맞게 맞춤화된 전문적인 방법을 개발하는 것입니다. 본 논문에서 제시하는 방법이 바로 이 범주에 속합니다.

동적 물체를 시뮬레이션하는 전통적인 접근법은 힘을 다루는 것이었습니다. 각 시간 단계(time step)의 시작에서 내부 및 외부 힘을 누적합니다. 내부 힘의 예로는 변형 가능한 물체의 탄성력이나 유체의 점성력 및 압력이 있습니다. 중력과 충돌력은 외부 힘의 예시입니다. \
뉴턴의 운동 제2법칙은 질량을 통해 힘과 가속도를 관계 짓습니다. 따라서 밀도 또는 정점의 집중 질량(lumped mass)을 사용하여 힘을 가속도로 변환합니다. 그런 다음 임의의 시간 적분 기법을 사용하여 먼저 가속도로부터 속도를 계산하고, 다음으로 속도로부터 위치를 계산합니다. \
일부 접근법은 힘 대신 충격량(impulse)을 사용하여 애니메이션을 제어합니다. 충격량은 속도를 직접 변경하므로 한 단계의 적분을 건너뛸 수 있습니다.

컴퓨터 그래픽스, 특히 컴퓨터 게임에서는 물체 또는 메시 정점의 위치를 직접 제어하는 것이 종종 바람직합니다. 사용자는 정점을 키네마틱 물체에 부착하거나 정점이 항상 충돌 물체의 외부에 유지되도록 하고 싶을 수 있습니다. \
본 논문에서 제안하는 방법은 위치에 직접 작용하므로 이러한 조작을 쉽게 만듭니다. 또한 위치 기반 접근법을 통해 적분을 직접 제어할 수 있어 명시적 적분과 관련된 오버슈팅 및 에너지 증가 문제를 방지할 수 있습니다. 따라서 위치 기반 동역학의 주요 특징과 장점은 다음과 같습니다:

- *위치 기반 시뮬레이션*은 명시적 적분에 대한 제어를 제공하고 전형적인 불안정성 문제를 제거합니다.
- *정점과 물체 부분의 위치*를 시뮬레이션 중에 직접 조작할 수 있습니다.
- *본 논문에서 제안하는 공식*은 위치 기반 설정에서 일반적인 제약 조건의 처리를 가능하게 합니다.
- *명시적 위치 기반 솔버*는 이해하고 구현하기 쉽습니다.

== 2. 관련 연구

최근의 기술 동향 보고서 [NMK05]는 컴퓨터 그래픽스에서 변형 가능한 물체를 시뮬레이션하기 위해 사용되는 방법에 대한 좋은 개요를 제공합니다. 예를 들어 질량-스프링 시스템, 유한 요소법 또는 유한 차분 접근법 등이 있습니다. [MHTG05]의 인용을 제외하면, 위치 기반 동역학은 이 조사에 등장하지 않습니다. 그러나 위치 기반 접근법의 일부는 명시적으로 명명하거나 완전한 프레임워크를 정의하지 않은 채 다양한 논문에 등장하였습니다.

Jakobsen [Jak01]은 위치 기반 접근법에 기반하여 자신의 Fysix 엔진을 구축하였습니다. 그의 핵심 아이디어는 Verlet 적분기를 사용하고 위치를 직접 조작하는 것이었습니다. 속도가 현재 위치와 이전 위치에 의해 암묵적으로 저장되기 때문에, 위치 조작에 의해 속도가 암묵적으로 갱신됩니다. \
그는 주로 거리 제약 조건에 집중하였으며, 더 일반적인 제약 조건을 어떻게 처리할 수 있는지에 대해서는 모호한 힌트만을 제공하였습니다. 본 논문에서는 일반적인 제약 조건을 처리하는 완전히 일반적인 접근법을 제시합니다. \
또한 위치 투영에 의한 선형 및 각운동량 보존이라는 중요한 문제에도 초점을 맞춥니다. 이전 위치를 저장하는 대신 명시적 속도를 사용하여 감쇠(damping)와 마찰(friction) 시뮬레이션을 훨씬 쉽게 만듭니다.

Desbrun [DSB99]과 Provot [Pro95]은 질량-스프링 시스템에서 스프링의 과도한 신장을 방지하기 위해 제약 조건 투영을 사용합니다. 완전한 위치 기반 접근법과 대조적으로, 투영은 과도하게 신장된 스프링에 대한 후처리(polishing) 과정으로만 사용되며 기본 시뮬레이션 방법으로 사용되지 않습니다.

Bridson 등은 천 시뮬레이션 [BFA02]에 전통적인 힘 기반 접근법을 사용하고, 이를 위치 기반의 기하학적 충돌 해소 알고리즘과 결합하여 충돌 해소 충격량이 안정적인 범위 내에 유지되도록 합니다. Volino 등 [VCMT95]이 제안한 키네마틱 충돌 보정 단계도 마찬가지입니다.

Clavet 등 [CBP05]은 점탄성 유체를 시뮬레이션하기 위해 위치 기반 접근법을 사용하였습니다. 그들의 접근법은 위치 투영의 여러 곳에 시간 단계가 나타나기 때문에 완전히 위치 기반은 아닙니다. 따라서 적분은 일반적인 명시적 적분과 같이 조건부 안정(conditionally stable)에 불과합니다.

Müller 등 [MHTG05]은 점들을 특정 목표 위치로 이동시켜 변형 가능한 물체를 시뮬레이션합니다. 이 목표 위치는 물체의 정지 상태(rest state)를 현재 상태와 매칭하여 찾습니다. 그들의 적분 방법은 본 논문에서 제안하는 것에 가장 가깝습니다. 그들은 하나의 전문화된 전역 제약 조건만을 다루기 때문에 위치 솔버가 필요하지 않습니다.

Fedor [Fed05]는 Jakobsen의 접근법을 사용하여 게임에서 캐릭터를 시뮬레이션합니다. 그의 방법은 인간 캐릭터 시뮬레이션이라는 특정 문제에 맞게 조정되어 있습니다. 여러 골격(skeletal) 표현을 사용하고 투영을 통해 이들을 동기화합니다.

Faure [Fau98]는 속도가 아닌 위치를 수정하는 Verlet 적분 기법을 사용합니다. 새로운 위치는 제약 조건을 선형화하여 계산되는 반면, 본 논문에서는 비선형 제약 함수를 직접 다룹니다.

본 논문에서는 [BW98]과 [THMG04]에서와 같이 제약 함수를 통해 일반적인 제약 조건을 정의합니다. 제약 함수 에너지의 도함수로 힘을 계산하는 대신, 평형 배치(equilibrium configuration)를 직접 풀어 위치를 투영합니다. 본 방법을 통해 [GHDS03]과 [BMF03]에서 제안된 것과 유사하지만 점 기반 접근법에 맞게 적응된 천의 굽힘(bending) 항을 유도합니다.

Section 4에서는 위치 기반 동역학 접근법을 천 시뮬레이션에 사용합니다. 천 시뮬레이션은 최근 몇 년간 컴퓨터 그래픽스에서 활발한 연구 분야였습니다. 이 분야의 핵심 논문을 개별적으로 인용하는 대신, 포괄적인 조사를 위해 [NMK05]를 참조하시기 바랍니다.

#figure(image("images/fig_1_page2.png", width: 100%), caption: [Figure 1: 팽창된 메시가 회전하는 톱니바퀴를 통과하며 변형됩니다. 다중 제약 조건, 충돌, 자기 충돌이 동시에 작용하는 극한 시나리오에서도 본 방법은 안정적으로 유지됩니다.])

#separator()

== 3. 위치 기반 시뮬레이션

이 절에서는 일반적인 위치 기반 접근법을 공식화합니다. 천 시뮬레이션이라는 구체적인 응용은 이후 절과 결과 절에서 다룹니다. 3차원 세계를 고려하지만, 이 접근법은 2차원에서도 동일하게 잘 작동합니다.

=== 3.1. 알고리즘 개요

동적 물체를 $N$개의 정점과 $M$개의 제약 조건으로 표현합니다. 정점 $i in [1, ..., N]$은 질량 $m_i$, 위치 $bold(x)_i$, 속도 $bold(v)_i$를 갖습니다.

제약 조건 $j in [1, ..., M]$은 다음으로 구성됩니다:

- 기수(cardinality) $n_j$
- 함수 $C_j : bb(R)^(3 n_j) arrow bb(R)$
- 인덱스 집합 $\{i_1, ..., i_(n_j)\}$, $i_k in [1, ..., N]$
- 강성 매개변수(stiffness parameter) $k_j in [0...1]$
- _equality_ 또는 _inequality_ 유형

유형이 _equality_인 제약 조건 $j$는 $C_j (bold(x)_(i_1), ..., bold(x)_(i_{n_j)}) = 0$ 일 때 만족됩니다. 유형이 _inequality_이면 $C_j (bold(x)_(i_1), ..., bold(x)_(i_{n_j)}) >= 0$ 일 때 만족됩니다. 강성 매개변수 $k_j$는 0에서 1 범위에서 제약 조건의 강도를 정의합니다.

이 데이터와 시간 단계 $Delta t$를 기반으로, 동적 물체는 다음과 같이 시뮬레이션됩니다:

#v(0.4em)
#block(width: 100%, fill: code-bg, stroke: 0.5pt + code-border, radius: 4pt, clip: true)[
  #block(width: 100%, fill: rgb("#eaf2f8"), inset: (x: 16pt, y: 8pt), below: 0pt, above: 0pt)[
    #set par(first-line-indent: 0pt)
    #text(font: "Malgun Gothic", size: 9.5pt, fill: accent, weight: "bold")[Algorithm 1 — 시뮬레이션 루프]
  ]
  #block(inset: (x: 16pt, y: 12pt), width: 100%)[
    #set text(font: "Consolas", size: 9pt, fill: luma(40))
    #set par(first-line-indent: 0pt, leading: 0.7em, spacing: 0.7em)
    #text(fill: luma(150))[(1)]#h(1.0em)#text(fill: accent, weight: "bold")[for all] vertices $i$\
    #text(fill: luma(150))[(2)]#h(3.0em)#text(fill: accent, weight: "bold")[initialize] $x_i = x_i^0$, $v_i = v_i^0$, $w_i = 1/m_i$\
    #text(fill: luma(150))[(3)]#h(1.0em)#text(fill: accent, weight: "bold")[endfor]\
    #text(fill: luma(150))[(4)]#h(1.0em)#text(fill: accent, weight: "bold")[loop]\
    #text(fill: luma(150))[(5)]#h(3.0em)#text(fill: accent, weight: "bold")[for all] vertices $i$ #text(fill: accent, weight: "bold")[do] $v_i$ #text(fill: rgb("#d63384"))[←] $v_i + Delta t dot w_i dot f_("ext")(x_i)$\
    #text(fill: luma(150))[(6)]#h(3.0em)dampVelocities($v_1, dots, v_N$)\
    #text(fill: luma(150))[(7)]#h(3.0em)#text(fill: accent, weight: "bold")[for all] vertices $i$ #text(fill: accent, weight: "bold")[do] $p_i$ #text(fill: rgb("#d63384"))[←] $x_i + Delta t dot v_i$\
    #text(fill: luma(150))[(8)]#h(3.0em)#text(fill: accent, weight: "bold")[for all] vertices $i$ #text(fill: accent, weight: "bold")[do] generateCollisionConstraints($x_i arrow p_i$)\
    #text(fill: luma(150))[(9)]#h(3.0em)#text(fill: accent, weight: "bold")[loop] solverIterations #text(fill: accent, weight: "bold")[times]\
    #text(fill: luma(150))[(10)]#h(4.5em)projectConstraints($C_1, dots, C_(M+M_{"coll")}, p_1, dots, p_N$)\
    #text(fill: luma(150))[(11)]#h(2.5em)#text(fill: accent, weight: "bold")[endloop]\
    #text(fill: luma(150))[(12)]#h(2.5em)#text(fill: accent, weight: "bold")[for all] vertices $i$\
    #text(fill: luma(150))[(13)]#h(4.5em)$v_i$ #text(fill: rgb("#d63384"))[←] $(p_i - x_i) / Delta t$\
    #text(fill: luma(150))[(14)]#h(4.5em)$x_i$ #text(fill: rgb("#d63384"))[←] $p_i$\
    #text(fill: luma(150))[(15)]#h(2.5em)#text(fill: accent, weight: "bold")[endfor]\
    #text(fill: luma(150))[(16)]#h(2.5em)velocityUpdate($v_1, dots, v_N$)\
    #text(fill: luma(150))[(17)]#h(0.5em)#text(fill: accent, weight: "bold")[endloop]
  ]
]
#v(0.4em)

(1)-(3)행은 상태 변수를 초기화할 뿐입니다. 위치 기반 동역학의 핵심 아이디어는 (7), (9)-(11), (13)-(14)행에 나타나 있습니다. (7)행에서 명시적 오일러 적분 단계를 사용하여 정점의 새로운 위치에 대한 추정치 $bold(p)_i$를 계산합니다. \
반복 솔버 (9)-(11)은 이 위치 추정치가 제약 조건을 만족하도록 조작합니다. 이는 각 제약 조건을 Gauss-Seidel 방식으로 반복적으로 투영함으로써 수행됩니다(Section 3.2 참조). \
(13), (14) 단계에서 정점의 위치를 최적화된 추정치로 이동시키고 그에 따라 속도를 갱신합니다. 이는 Verlet 적분 단계 및 현재 위치의 수정과 정확히 일치합니다 [Jak01]. 왜냐하면 Verlet 방법은 현재 위치와 이전 위치의 차이로 속도를 암묵적으로 저장하기 때문입니다. 그러나 속도를 명시적으로 다루면 보다 직관적인 방식으로 조작할 수 있습니다.

속도는 (5), (6), (16)행에서 조작됩니다. (5)행에서는 일부 힘을 위치 제약 조건으로 변환할 수 없는 경우 외부 힘을 시스템에 연결할 수 있습니다. 본 논문에서는 시스템에 중력을 추가하는 데만 사용하며, 이 경우 해당 행은 $bold(v)_i arrow bold(v)_i + Delta t dot bold(g)$가 됩니다. 여기서 $bold(g)$는 중력 가속도입니다. \
(6)행에서는 필요한 경우 속도를 감쇠(damp)시킬 수 있습니다. Section 3.5에서 물체의 강체 모드에 영향을 주지 않고 전역 감쇠를 추가하는 방법을 보여줍니다. \
마지막으로 (16)행에서 충돌하는 정점의 속도를 마찰 및 반발 계수에 따라 수정합니다.

주어진 제약 조건 $C_1, ..., C_M$은 시뮬레이션 전체에 걸쳐 고정되어 있습니다. 이 제약 조건들에 더하여, (8)행에서 시간 단계마다 변하는 $M_"coll"$개의 충돌 제약 조건을 생성합니다. (10)행의 투영 단계에서는 고정 제약 조건과 충돌 제약 조건 모두를 고려합니다.

이 기법은 무조건적으로 안정적(unconditionally stable)입니다. 이는 적분 단계 (13)과 (14)가 전통적인 명시적 기법처럼 미래로 무작정 외삽(extrapolate)하지 않고, 제약 솔버가 계산한 물리적으로 유효한 배치 $bold(p)_i$로 정점을 이동시키기 때문입니다. \
불안정의 유일한 가능한 원인은 유효한 위치를 풀기 위해 Newton-Raphson 방법을 사용하는 솔버 자체입니다(Section 3.3 참조). 그러나 솔버의 안정성은 시간 단계 크기가 아닌 제약 함수의 형태에 의존합니다.

적분은 암묵적 기법이나 명시적 기법의 범주에 명확히 속하지 않습니다. 시간 단계당 솔버 반복이 한 번만 수행되면 명시적 기법에 더 가깝게 보입니다. 그러나 반복 횟수를 늘리면 제약 시스템을 임의로 강하게(stiff) 만들 수 있으며, 알고리즘은 암묵적 기법에 더 가깝게 동작합니다. 반복 횟수를 늘리면 병목이 충돌 감지에서 솔버로 이동합니다.

=== 3.2. 솔버

솔버의 입력은 $M + M_"coll"$개의 제약 조건과 점들의 새로운 위치에 대한 추정치 $bold(p)_1, ..., bold(p)_N$입니다. 솔버는 추정치가 모든 제약 조건을 만족하도록 수정을 시도합니다. 결과 방정식 시스템은 비선형입니다. 단순한 거리 제약 조건 $C(bold(p)_1, bold(p)_2) = |bold(p)_1 - bold(p)_2| - d$조차도 비선형 방정식을 생성합니다. 또한 _inequality_ 유형의 제약 조건은 부등식을 생성합니다. \
이러한 일반적인 방정식 및 부등식의 집합을 풀기 위해 Gauss-Seidel 유형의 반복법을 사용합니다. 원래의 Gauss-Seidel 알고리즘(GS)은 선형 시스템만 처리할 수 있습니다. GS에서 차용하는 부분은 각 제약 조건을 독립적으로 하나씩 순차적으로 풀어나간다는 아이디어입니다. 그러나 GS와 달리 제약 조건을 푸는 것은 비선형 연산입니다. \
모든 제약 조건을 반복적으로 순회하며 주어진 제약 조건에 대해 입자를 유효한 위치로 투영합니다. Jacobi 유형의 반복과 달리, 점 위치의 수정이 프로세스에 즉시 반영됩니다. 이는 압력파가 단일 솔버 단계에서 재료를 통해 전파될 수 있기 때문에 수렴을 크게 가속화하며, 이 효과는 제약 조건이 풀어지는 순서에 의존합니다. 과도하게 제약된 상황에서는 순서가 일정하게 유지되지 않으면 진동(oscillation)으로 이어질 수 있습니다.

=== 3.3. 제약 조건 투영

점의 집합을 제약 조건에 따라 투영한다는 것은 점들이 제약 조건을 만족하도록 이동시키는 것을 의미합니다. 시뮬레이션 루프 내에서 점을 직접 이동시키는 것과 관련하여 가장 중요한 문제는 선형 운동량과 각운동량의 보존입니다. $Delta bold(p)_i$를 투영에 의한 정점 $i$의 변위라고 하면, 선형 운동량은 다음과 같은 경우 보존됩니다:

$ sum_i m_i Delta bold(p)_i = 0 quad quad (1) $

이는 질량 중심을 보존하는 것에 해당합니다. 각운동량은 다음과 같은 경우 보존됩니다:

$ sum_i bold(r)_i times m_i Delta bold(p)_i = 0 quad quad (2) $

여기서 $bold(r)_i$는 $bold(p)_i$로부터 임의의 공통 회전 중심까지의 거리입니다. 투영이 이 제약 조건 중 하나를 위반하면 소위 *유령 힘(ghost force)*이 발생하여 물체를 끌거나 회전시키는 외부 힘처럼 작용합니다. 그러나 내부 제약 조건만이 운동량을 보존해야 합니다. 충돌 또는 부착 제약 조건은 물체에 대한 전역 효과를 가질 수 있습니다.

본 논문에서 제안하는 제약 조건 투영 방법은 내부 제약 조건에 대해 두 운동량 모두를 보존합니다. 여기서도 점 기반 접근법은 제약 함수를 직접 사용할 수 있다는 점에서 더 직접적입니다. 반면 힘 기반 방법은 에너지 항을 통해 힘을 유도합니다([BW98, THMG04] 참조). \
기수(cardinality) $n$인 제약 조건이 점 $bold(p)_1, ..., bold(p)_n$에 대해 제약 함수 $C$와 강성 $k$를 가진다고 합시다. $bold(p)$를 $[bold(p)_1^T, ..., bold(p)_n^T]^T$의 연결이라 합니다. 내부 제약 조건의 경우, $C$는 강체 모드(즉, 평행이동과 회전)에 독립적입니다. 이는 점들을 회전시키거나 평행이동시켜도 제약 함수의 값이 변하지 않음을 의미합니다. \
따라서 그래디언트 $nabla_(bold(p)) C$는 최대 변화 방향이므로 강체 모드에 수직입니다. 보정 $Delta bold(p)$가 $nabla_(bold(p)) C$를 따라 선택되면, 모든 질량이 동일한 경우 두 운동량 모두 자동으로 보존됩니다(다른 질량의 경우는 나중에 다룹니다). \
$bold(p)$가 주어졌을 때 $C(bold(p) + Delta bold(p)) = 0$을 만족하는 보정 $Delta bold(p)$를 찾고자 합니다. 이 방정식은 다음과 같이 근사할 수 있습니다:

$ C(bold(p) + Delta bold(p)) approx C(bold(p)) + nabla_(bold(p)) C(bold(p)) dot Delta bold(p) = 0 quad quad (3) $

$Delta bold(p)$를 $nabla_(bold(p)) C$ 방향으로 제한한다는 것은 스칼라 $lambda$를 선택하여 다음과 같이 하는 것을 의미합니다:

$ Delta bold(p) = lambda nabla_(bold(p)) C(bold(p)) quad quad (4) $

식 (4)를 식 (3)에 대입하고, $lambda$에 대해 풀어 다시 식 (4)에 대입하면 $Delta bold(p)$에 대한 최종 공식을 얻습니다:

$ Delta bold(p) = -frac(C(bold(p)), |nabla_(bold(p)) C(bold(p))|^2) nabla_(bold(p)) C(bold(p)) quad quad (5) $

이것은 단일 제약 조건이 주는 비선형 방정식의 반복적 풀이를 위한 일반적인 Newton-Raphson 단계입니다.

개별 점 $bold(p)_i$의 보정에 대해 다음을 얻습니다:

$ Delta bold(p)_i = -s nabla_(bold(p)_i) C(bold(p)_1, dots, bold(p)_n) quad quad (6) $

여기서 스케일링 인자(scaling factor)

$ s = frac(C(bold(p)_1, dots, bold(p)_n), sum_j |nabla_(bold(p)_j) C(bold(p)_1, dots, bold(p)_n)|^2) quad quad (7) $

는 모든 점에 대해 동일합니다. 점들이 개별 질량을 가지면 역질량 $w_i = 1 / m_i$로 보정 $Delta bold(p)_i$에 가중치를 부여합니다. 이 경우 무한 질량을 가진 점(즉, $w_i = 0$)은 예상대로 움직이지 않습니다. 이제 식 (4)는 다음으로 대체됩니다:

$ Delta bold(p)_i = lambda w_i nabla_(bold(p)_i) C(bold(p)) quad "yielding" $

$ s = frac(C(bold(p)_1, dots, bold(p)_n), sum_j w_j |nabla_(bold(p)_j) C(bold(p)_1, dots, bold(p)_n)|^2) quad quad (8) $

을 스케일링 인자로 하고, 최종 보정은

$ Delta bold(p)_i = -s thin w_i nabla_(bold(p)_i) C(bold(p)_1, dots, bold(p)_n) quad quad (9) $

가 됩니다.

예를 들어, 거리 제약 함수 $C(bold(p)_1, bold(p)_2) = |bold(p)_1 - bold(p)_2| - d$를 고려합시다. 점에 대한 도함수는 $nabla_(bold(p)_1) C(bold(p)_1, bold(p)_2) = bold(n)$이고 $nabla_(bold(p)_2) C(bold(p)_1, bold(p)_2) = -bold(n)$이며, $bold(n) = (bold(p)_1 - bold(p)_2) / |bold(p)_1 - bold(p)_2|$입니다. 따라서 스케일링 인자 $s$는 $s = (|bold(p)_1 - bold(p)_2| - d) / (w_1 + w_2)$이고 최종 보정은 다음과 같습니다:

$ Delta bold(p)_1 = -frac(w_1, w_1 + w_2) (|bold(p)_1 - bold(p)_2| - d) frac(bold(p)_1 - bold(p)_2, |bold(p)_1 - bold(p)_2|) quad quad (10) $

$ Delta bold(p)_2 = +frac(w_2, w_1 + w_2) (|bold(p)_1 - bold(p)_2| - d) frac(bold(p)_1 - bold(p)_2, |bold(p)_1 - bold(p)_2|) quad quad (11) $

이것은 [Jak01]에서 거리 제약 조건 투영을 위해 제안된 공식입니다(Figure 2 참조). 이 공식은 일반적인 제약 조건 투영 방법의 특수한 경우로 나타납니다.

#figure(image("images/fig_2_vector.pdf", width: 70%), caption: [Figure 2: 제약 조건 $C(bold(p)_1, bold(p)_2) = |bold(p)_1 - bold(p)_2| - d$의 투영. 보정 $Delta bold(p)_i$는 역질량 $w_i = 1 / m_i$에 따라 가중됩니다.])

지금까지 제약 조건의 유형과 강성 $k$를 고려하지 않았습니다. 유형 처리는 간단합니다. 유형이 _equality_이면 항상 투영을 수행합니다. 유형이 _inequality_이면 $C(bold(p)_1, ..., bold(p)_n) < 0$인 경우에만 투영을 수행합니다. \
강성 매개변수를 통합하는 여러 방법이 있습니다. 가장 간단한 변형은 보정 $Delta bold(p)$에 $k in [0...1]$을 곱하는 것입니다. 그러나 솔버의 여러 반복 루프에서 $k$의 효과는 비선형적입니다. 단일 거리 제약 조건에 대한 $n_s$번의 솔버 반복 후의 잔여 오차는 $Delta bold(p)(1 - k)^(n_s)$입니다. \
선형적 관계를 얻기 위해 보정에 $k$를 직접 곱하지 않고 $k' = 1 - (1 - k)^(1 / n_s)$를 곱합니다. 이 변환을 통해 오차는 $Delta bold(p)(1 - k')^(n_s) = Delta bold(p)(1 - k)$가 되어 $k$에 대해 선형적이고 $n_s$에 독립적이 됩니다. 그러나 결과적인 재료 강성은 여전히 시뮬레이션의 시간 단계에 의존합니다. 실시간 환경은 일반적으로 고정 시간 단계를 사용하므로 이 의존성은 문제가 되지 않습니다.

=== 3.4. 충돌 감지 및 응답

위치 기반 접근법의 한 가지 장점은 충돌 응답을 얼마나 간단하게 구현할 수 있는지에 있습니다. 시뮬레이션 알고리즘의 (8)행에서 $M_"coll"$개의 충돌 제약 조건을 생성합니다. 물체 표현에 의해 주어진 처음 $M$개의 제약 조건은 시뮬레이션 전체에 걸쳐 고정되어 있는 반면, 추가적인 $M_"coll"$개의 제약 조건은 각 시간 단계마다 새로 생성됩니다. 충돌 제약 조건의 수 $M_"coll"$은 변동하며 충돌하는 정점의 수에 따라 달라집니다. \
연속(continuous) 충돌과 정적(static) 충돌 모두 처리할 수 있습니다. 연속 충돌 처리의 경우, 각 정점 $i$에 대해 광선 $bold(x)_i arrow bold(p)_i$를 테스트합니다. 이 광선이 물체에 진입하면 해당 위치에서의 진입점 $bold(q)_c$와 표면 법선 $bold(n)_c$를 계산합니다. 제약 함수 $C(bold(p)) = (bold(p) - bold(q)_c) dot bold(n)_c$이고 강성 $k = 1$인 _inequality_ 제약 조건을 제약 조건 목록에 추가합니다. \
광선 $bold(x)_i arrow bold(p)_i$가 완전히 물체 내부에 있으면 어느 시점에서 연속 충돌 감지가 실패한 것입니다. 이 경우 정적 충돌 처리로 대체합니다. $bold(p)_i$에 가장 가까운 표면 점 $bold(q)_s$와 해당 위치의 표면 법선 $bold(n)_s$를 계산합니다. 제약 함수 $C(bold(p)) = (bold(p) - bold(q)_s) dot bold(n)_s$이고 강성 $k = 1$인 _inequality_ 제약 조건을 제약 조건 목록에 추가합니다. \
충돌 제약 조건 생성은 솔버 루프 외부에서 수행됩니다. 이는 시뮬레이션을 훨씬 빠르게 합니다. 솔버가 고정된 충돌 제약 조건 집합으로 작업할 때 충돌이 누락될 수 있는 특정 시나리오가 있습니다. 다행히 경험에 따르면 그러한 아티팩트는 무시할 수 있는 수준입니다.

마찰(friction)과 반발(restitution)은 알고리즘의 (16) 단계에서 충돌하는 정점의 속도를 조작하여 처리할 수 있습니다. 충돌 제약 조건이 생성된 각 정점의 속도는 충돌 법선에 수직인 방향으로 감쇠되고 충돌 법선 방향으로 반사됩니다.

위에서 논의한 충돌 처리는 정적 물체와의 충돌에 대해서만 올바른데, 충돌 상대에게 충격량이 전달되지 않기 때문입니다. 두 개의 동적 충돌 물체에 대한 올바른 응답은 두 물체를 모두 본 시뮬레이터로 시뮬레이션하여 달성할 수 있습니다. 즉, 알고리즘의 입력인 $N$개의 정점과 $M$개의 제약 조건이 단순히 두 개 이상의 독립된 물체를 나타내면 됩니다. \
그러면 한 물체의 점 $bold(q)$가 다른 물체의 삼각형 $bold(p)_1, bold(p)_2, bold(p)_3$을 관통할 때, 점 $bold(q)$를 삼각형의 올바른 쪽에 유지하는 제약 함수 $C(bold(q), bold(p)_1, bold(p)_2, bold(p)_3) = plus.minus (bold(q) - bold(p)_1) dot [(bold(p)_2 - bold(p)_1) times (bold(p)_3 - bold(p)_1)]$를 가진 _inequality_ 제약 조건을 삽입합니다. \
이 제약 함수는 강체 모드에 독립적이므로 선형 및 각운동량을 올바르게 보존합니다.

충돌 감지는 네 정점이 광선 $bold(x)_i arrow bold(p)_i$로 표현되기 때문에 약간 더 복잡해집니다. 따라서 이동하는 점이 이동하는 삼각형과 충돌하는 것을 감지해야 합니다(천 자기 충돌에 관한 절 참조).

=== 3.5. 감쇠

시뮬레이션 알고리즘의 (6)행에서 속도는 새로운 위치 예측에 사용되기 전에 감쇠됩니다. 어떤 형태의 감쇠든 사용할 수 있으며, 문헌에서 감쇠에 대한 많은 방법이 제안되었습니다([NMK05] 참조). 여기서는 몇 가지 흥미로운 성질을 가진 새로운 방법을 제안합니다:

#v(0.4em)
#block(width: 100%, fill: code-bg, stroke: 0.5pt + code-border, radius: 4pt, clip: true)[
  #block(width: 100%, fill: rgb("#eaf2f8"), inset: (x: 16pt, y: 8pt), below: 0pt, above: 0pt)[
    #set par(first-line-indent: 0pt)
    #text(font: "Malgun Gothic", size: 9.5pt, fill: accent, weight: "bold")[Algorithm 2 — 속도 감쇠]
  ]
  #block(inset: (x: 16pt, y: 12pt), width: 100%)[
    #set text(font: "Consolas", size: 9pt, fill: luma(40))
    #set par(first-line-indent: 0pt, leading: 0.7em, spacing: 0.7em)
    #text(fill: luma(150))[(1)]#h(0.5em)$x_("cm") = (sum_i x_i m_i) / (sum_i m_i)$\
    #text(fill: luma(150))[(2)]#h(0.5em)$v_("cm") = (sum_i v_i m_i) / (sum_i m_i)$\
    #text(fill: luma(150))[(3)]#h(0.5em)$L = sum_i r_i times (m_i v_i)$\
    #text(fill: luma(150))[(4)]#h(0.5em)$I = sum_i tilde(r)_i^T tilde(r)_i m_i$\
    #text(fill: luma(150))[(5)]#h(0.5em)$omega = I^(-1) L$\
    #text(fill: luma(150))[(6)]#h(0.5em)#text(fill: accent, weight: "bold")[for all] vertices $i$\
    #text(fill: luma(150))[(7)]#h(2.5em)$Delta v_i = v_("cm") + omega times r_i - v_i$\
    #text(fill: luma(150))[(8)]#h(2.5em)$v_i$ #text(fill: rgb("#d63384"))[←] $v_i + k_("damping") Delta v_i$\
    #text(fill: luma(150))[(9)]#h(0.5em)#text(fill: accent, weight: "bold")[endfor]
  ]
]
#v(0.4em)

여기서 $bold(r)_i = bold(x)_i - bold(x)_"cm"$이고, $tilde(bold(r))_i$는 $tilde(bold(r))_i bold(v) = bold(r)_i times bold(v)$ 성질을 갖는 $3 times 3$ 행렬이며, $k_"damping" in [0...1]$은 감쇠 계수입니다. \
(1)-(5)행에서 시스템의 전역 선형 속도 $bold(v)_"cm"$과 각속도 $bold(omega)$를 계산합니다. (6)-(9)행에서는 속도 $bold(v)_i$가 전역 운동 $bold(v)_"cm" + bold(omega) times bold(r)_i$로부터 개별적으로 벗어나는 편차 $Delta bold(v)_i$만을 감쇠시킵니다. \
따라서 극단적인 경우 $k_"damping" = 1$에서는 전역 운동만 남고 정점 집합이 강체처럼 동작합니다. 임의의 $k_"damping"$ 값에 대해 속도는 전역적으로 감쇠되지만 정점의 전역 운동에는 영향을 주지 않습니다.

=== 3.6. 부착

위치 기반 접근법에서 정점을 정적 또는 키네마틱 물체에 부착하는 것은 매우 간단합니다. 정점의 위치를 정적 목표 위치로 설정하거나 매 시간 단계마다 키네마틱 물체의 위치와 일치하도록 갱신하면 됩니다. 이 정점을 포함하는 다른 제약 조건이 해당 정점을 이동시키지 않도록 하기 위해, 역질량 $w_i$를 0으로 설정합니다.

#separator()

== 4. 천 시뮬레이션

위치 기반 동역학 프레임워크를 사용하여 게임용 실시간 천 시뮬레이터를 구현하였습니다. 이 절에서는 이전 절에서 소개한 일반 개념의 구체적인 예를 제시하면서 천 고유의 문제를 논의합니다.

=== 4.1. 천의 표현

본 천 시뮬레이터는 입력으로 임의의 삼각형 메시를 받아들입니다. 입력 메시에 대한 유일한 제한 사항은 매니폴드(manifold)를 나타내야 한다는 것, 즉 각 변은 최대 두 개의 삼각형에 의해 공유되어야 한다는 것입니다. 메시의 각 노드는 시뮬레이션되는 정점이 됩니다. 사용자는 단위 면적당 질량 [kg/m²]으로 밀도 $rho$를 제공합니다. 정점의 질량은 인접한 각 삼각형 질량의 1/3의 합으로 설정됩니다. 각 변에 대해 제약 함수

$ C_"stretch" (bold(p)_1, bold(p)_2) = |bold(p)_1 - bold(p)_2| - l_0 $

강성 $k_"stretch"$, 유형 _equality_로 신장(stretching) 제약 조건을 생성합니다. 스칼라 $l_0$는 변의 초기 길이이고 $k_"stretch"$는 사용자가 제공하는 전역 매개변수입니다. 이는 천의 신장 강성을 정의합니다. 인접한 삼각형 쌍 ($bold(p)_1$, $bold(p)_3$, $bold(p)_2$)와 ($bold(p)_1$, $bold(p)_2$, $bold(p)_4$)에 대해 제약 함수

$ C_"bend" (bold(p)_1, bold(p)_2, bold(p)_3, bold(p)_4) = arccos(frac((bold(p)_2 - bold(p)_1) times (bold(p)_3 - bold(p)_1), |(bold(p)_2 - bold(p)_1) times (bold(p)_3 - bold(p)_1)|) dot frac((bold(p)_2 - bold(p)_1) times (bold(p)_4 - bold(p)_1), |(bold(p)_2 - bold(p)_1) times (bold(p)_4 - bold(p)_1)|)) - phi.alt_0 $

강성 $k_"bend"$, 유형 _equality_로 굽힘(bending) 제약 조건을 생성합니다. 스칼라 $phi.alt_0$는 두 삼각형 사이의 초기 이면각(dihedral angle)이며 $k_"bend"$는 천의 굽힘 강성을 정의하는 전역 사용자 매개변수입니다(Figure 4 참조). 이 굽힘 항이 점 $bold(p)_3$과 $bold(p)_4$ 사이에 거리 제약 조건을 추가하거나 [GHDS03]에서 제안된 굽힘 항보다 유리한 점은 신장과 독립적이라는 것입니다. 이 항이 변 길이에 독립적이기 때문입니다. 이런 방식으로 사용자는 예를 들어 낮은 신장 강성이지만 높은 굽힘 저항을 가진 천을 지정할 수 있습니다(Figure 3 참조).

#figure(image("images/fig_2_page7.png", width: 100%), caption: [Figure 3: 다양한 신장 강성을 가진 천 주머니. 상단 행: 굽힘 저항 활성화. 하단 행: 굽힘 저항 비활성화. 굽힘은 신장 저항에 영향을 주지 않습니다.])

#figure(image("images/fig_4_vector.pdf", width: 70%), caption: [Figure 4: 굽힘 저항을 위해 제약 함수 $C(bold(p)_1, bold(p)_2, bold(p)_3, bold(p)_4) = arccos(bold(n)_1 dot bold(n)_2) - phi.alt_0$를 사용합니다. 실제 이면각 $phi.alt$는 두 삼각형의 법선 사이의 각도로 측정됩니다.])

식 (10)과 (11)은 신장 제약 조건의 투영을 정의합니다. Appendix A에서 굽힘 제약 조건을 투영하는 공식을 유도합니다.

=== 4.2. 강체와의 충돌

강체와의 충돌 처리를 위해 Section 3.4에서 설명한 대로 진행합니다. 양방향 상호작용을 얻기 위해, 정점 $i$가 해당 강체와의 충돌로 인해 투영될 때마다 접촉점에서 충격량 $m_i Delta bold(p)_i / Delta t$를 강체에 적용합니다. 천의 정점만 충돌 검사를 하는 것으로는 충분하지 않은데, 작은 강체가 큰 천 삼각형을 관통할 수 있기 때문입니다. 따라서 강체의 볼록 꼭짓점이 천 삼각형과 충돌하는 것도 검사합니다.

=== 4.3. 자기 충돌

삼각형이 모두 대략 같은 크기라고 가정하고, 공간 해싱(spatial hashing) [THM03]을 사용하여 정점-삼각형 충돌을 찾습니다. 정점 $bold(q)$가 삼각형 $bold(p)_1, bold(p)_2, bold(p)_3$을 관통하면 제약 함수

$ C(bold(q), bold(p)_1, bold(p)_2, bold(p)_3) = (bold(q) - bold(p)_1) dot frac((bold(p)_2 - bold(p)_1) times (bold(p)_3 - bold(p)_1), |(bold(p)_2 - bold(p)_1) times (bold(p)_3 - bold(p)_1)|) - h quad quad (12) $

를 사용합니다. 여기서 $h$는 천의 두께입니다(Figure 5 참조). 정점이 삼각형 법선의 아래에서 진입하면, 정점을 원래 쪽에 유지하기 위해 제약 함수는 다음이 되어야 합니다:

$ C(bold(q), bold(p)_1, bold(p)_2, bold(p)_3) = (bold(q) - bold(p)_1) dot frac((bold(p)_3 - bold(p)_1) times (bold(p)_2 - bold(p)_1), |(bold(p)_3 - bold(p)_1) times (bold(p)_2 - bold(p)_1)|) - h quad quad (13) $

이 제약 조건의 투영은 선형 및 각운동량을 보존하며, 이는 천의 자기 충돌이 내부 프로세스이기 때문에 필수적입니다. Figure 6은 자기 충돌이 있는 천 조각의 정지 상태를 보여줍니다. 천이 엉킨 상태가 되면 연속 충돌 검사만으로는 불충분하므로 [BWK03]에서 제안된 것과 같은 방법을 적용해야 합니다.

#figure(image("images/fig_4_page7.png", width: 60%), caption: [Figure 6: 자기 충돌이 있는 천 조각의 정지 상태. 접힌 천이 자기 관통 없이 올바르게 쌓여 있습니다.])

#figure(image("images/fig_5_vector.pdf", width: 70%), caption: [Figure 5: 제약 함수 $C(bold(q), bold(p)_1, bold(p)_2, bold(p)_3) = (bold(q) - bold(p)_1) dot bold(n) - h$는 $bold(q)$가 삼각형 $bold(p)_1, bold(p)_2, bold(p)_3$ 위에 천 두께 $h$만큼 유지되도록 합니다.])

=== 4.4. 천 풍선

폐합 삼각형 메시의 경우, 메시 내부의 과압(overpressure)을 쉽게 모델링할 수 있습니다(Figure 7 참조).

#figure(image("images/fig_3_page7.png", width: 60%), caption: [Figure 7: 과압으로 팽창된 폐합 메시. 내부 압력 제약 조건을 통해 풍선과 같은 동작을 시뮬레이션합니다.])

메시의 모든 $N$개 정점에 관한 _equality_ 제약 조건을 제약 함수

$ C(bold(p)_1, dots, bold(p)_N) = sum_(i=1)^(n_"triangles") (bold(p)_(t_1^i) times bold(p)_(t_2^i)) dot bold(p)_(t_3^i) - k_"pressure" V_0 quad quad (14) $

와 강성 $k = 1$로 제약 조건 집합에 추가합니다. 여기서 $t_1^i, t_2^i, t_3^i$는 삼각형 $i$에 속하는 세 정점의 인덱스입니다. 합은 폐합 메시의 실제 부피를 계산합니다. 이를 원래 부피 $V_0$에 과압 인자 $k_"pressure"$를 곱한 값과 비교합니다. 이 제약 함수의 그래디언트는 다음과 같습니다:

$ nabla_(bold(p)_i) C = sum_(j: t_1^j = i) (bold(p)_(t_2^j) times bold(p)_(t_3^j)) + sum_(j: t_2^j = i) (bold(p)_(t_3^j) times bold(p)_(t_1^j)) + sum_(j: t_3^j = i) (bold(p)_(t_1^j) times bold(p)_(t_2^j)) quad quad (15) $

이 그래디언트는 식 (7)에 주어진 스케일링 인자로 스케일링되고 식 (9)에 따라 질량으로 가중되어 최종 투영 오프셋 $Delta bold(p)_i$를 얻습니다.

#separator()

== 5. 결과

본 방법을 게임과 유사한 물리 시뮬레이션 환경인 Rocket [Rat04]에 통합하였습니다. 제안된 방법의 특성과 성능을 분석하기 위해 다양한 실험을 수행하였습니다. 이 절에서 제시하는 모든 테스트 시나리오는 PC Pentium 4, 3 GHz에서 수행되었습니다.

*독립적인 굽힘과 신장.* 본 굽힘 항은 인접한 삼각형의 이면각에만 의존하며 변 길이에는 의존하지 않으므로, 굽힘 저항과 신장 저항을 독립적으로 선택할 수 있습니다. Figure 3은 다양한 신장 강성을 가진 천 주머니를 보여줍니다. 먼저 굽힘 저항이 활성화된 경우를 보여주고, 그 다음 비활성화된 경우를 보여줍니다. 상단 행이 보여주듯이, 굽힘은 신장 저항에 영향을 주지 않습니다.

*양방향 상호작용이 있는 부착.* 단방향 및 양방향 결합 부착 제약 조건을 모두 시뮬레이션할 수 있습니다. Figure 8의 천 줄무늬(stripe)는 상단의 정적 강체에 단방향 제약 조건으로 부착되어 있습니다. 또한 줄무늬와 하단 강체 사이에는 양방향 상호작용이 활성화되어 있습니다. 이 구성은 줄무늬의 사실적인 흔들림과 비틀림 동작을 만들어냅니다. 이 장면은 6개의 강체와 3개의 천 조각으로 구성되며, 380 fps 이상으로 시뮬레이션 및 렌더링됩니다.

*실시간 자기 충돌.* Figure 6에 보여지는 천 조각은 1364개의 정점과 2562개의 삼각형으로 구성되어 있습니다. 자기 충돌 감지, 충돌 처리, 렌더링을 포함하여 시뮬레이션은 평균 30 fps로 실행됩니다. 마찰의 효과는 Figure 9에서 보여지며, 같은 천 조각이 회전하는 원통 안에서 구르고 있습니다.

*찢김과 안정성.* Figure 10은 4264개의 정점과 8262개의 삼각형으로 구성된 천 조각이 부착된 정육면체에 의해 찢어지고 최종적으로 던져진 공에 의해 갈라지는 장면을 보여줍니다. 이 장면은 평균 47 fps로 시뮬레이션 및 렌더링됩니다. \
찢김은 간단한 과정으로 시뮬레이션됩니다: 변의 신장이 지정된 임계값을 초과할 때마다 해당 변의 인접 정점 중 하나를 선택합니다. 그런 다음 해당 정점을 통과하고 변 방향에 수직인 분할 평면을 설정하고 정점을 분할합니다. 분할 평면 위의 모든 삼각형은 원래 정점에 할당되고, 아래의 모든 삼각형은 복제된 정점에 할당됩니다. \
본 방법은 Figure 1에서 보여지는 것과 같은 극한 상황에서도 안정적으로 유지됩니다. 이 장면은 [ITF04]에서 영감을 받은 것입니다. 팽창된 캐릭터 모델이 회전하는 톱니바퀴를 통과하며 쥐어짜여, 단일 천 정점에 다중 제약 조건, 충돌, 자기 충돌이 작용합니다.

*복잡한 시뮬레이션 시나리오.* 제시된 방법은 복잡한 시뮬레이션 환경에 특히 적합합니다(Figure 12 참조). 애니메이션된 캐릭터 및 기하학적으로 복잡한 게임 레벨과의 광범위한 상호작용에도 불구하고, 여러 천 조각의 시뮬레이션과 렌더링은 여전히 인터랙티브한 속도로 수행될 수 있습니다.

#figure(image("images/fig_5_page8.png", width: 100%), caption: [Figure 8: 천 줄무늬가 정적 강체에 단방향으로 부착되어 있고, 하단 강체와는 양방향 상호작용이 활성화되어 있습니다. 이 구성은 사실적인 흔들림과 비틀림 동작을 만들어냅니다.])

#figure(image("images/fig_6_page9.png", width: 60%), caption: [Figure 9: 마찰의 효과. 천 조각이 회전하는 원통 안에서 구르고 있습니다.])

#figure(image("images/fig_7_page9.png", width: 100%), caption: [Figure 10: 4264개의 정점과 8262개의 삼각형으로 구성된 천 조각이 찢어지고 던져진 공에 의해 갈라지는 장면.])

#figure(image("images/fig_8_page9.png", width: 100%), caption: [Figure 11: 세 개의 팽창된 캐릭터 모델.])

#figure(image("images/fig_9_page9.png", width: 60%), caption: [Figure 12: 복잡한 시뮬레이션 시나리오. 애니메이션된 캐릭터와 기하학적으로 복잡한 게임 레벨에서의 천 시뮬레이션.])

#separator()

== 6. 결론

일반적인 제약 함수를 통해 공식화된 일반 제약 조건을 처리할 수 있는 위치 기반 동역학 프레임워크를 제시하였습니다. 위치 기반 접근법을 통해 시뮬레이션 중에 물체를 직접 조작할 수 있습니다. 이는 충돌, 부착 제약 조건, 명시적 적분의 처리를 크게 단순화하며 애니메이션된 장면의 직접적이고 즉각적인 제어를 가능하게 합니다.

이 프레임워크 위에 견고한 천 시뮬레이터를 구현하였으며, 이는 천과 강체의 양방향 상호작용, 천의 자기 충돌 및 응답, 동적 강체에 대한 천 조각의 부착과 같은 기능을 제공합니다.

== 7. 향후 연구

본 논문에서 다루지 않은 주제는 강체 시뮬레이션입니다. 그러나 본 논문에서 제시한 접근법은 강체 물체를 처리하도록 상당히 쉽게 확장할 수 있습니다. 일반적인 강체 솔버가 충돌 해소를 위해 선형 및 각 충격량 집합을 계산하는 대신, 접촉점에서 물체에 이동과 회전을 적용하고 솔버가 완료된 후 선형 및 각속도를 그에 따라 조정하면 됩니다.

#separator()

== References

- [BFA02] Bridson R., Fedkiw R., Anderson J.: Robust treatment of collisions, contact and friction for cloth animation. _Proceedings of ACM Siggraph_ (2002), 594–603.
- [BMF03] Bridson R., Marino S., Fedkiw R.: Simulation of clothing with folds and wrinkles. In _ACM SIGGRAPH Symposium on Computer Animation_ (2003), pp. 28–36.
- [BW98] Baraff D., Witkin A.: Large steps in cloth simulation. _Proceedings of ACM Siggraph_ (1998), 43–54.
- [BWK03] Baraff D., Witkin A., Kass M.: Untangling cloth. In _Proceedings of the ACM SIGGRAPH_ (2003), pp. 862–870.
- [CBP05] Clavet S., Beaudoin P., Poulin P.: Particle-based viscoelastic fluid simulation. _Proceedings of the ACM SIGGRAPH Symposium on Computer Animation_ (2005), 219–228.
- [DSB99] Desbrun M., Schröder P., Barr A.: Interactive animation of structured deformable objects. In _Proceedings of Graphics Interface '99_ (1999), pp. 1–8.
- [Fau98] Faure F.: Interactive solid animation using linearized displacement constraints. In _Eurographics Workshop on Computer Animation and Simulation (EGCAS)_ (1998), pp. 61–72.
- [Fed05] Fedor M.: Fast character animation using particle dynamics. _Proceedings of International Conference on Graphics, Vision and Image Processing, GVIP05_ (2005).
- [GHDS03] Grinspun E., Hirani A., Desbrun M., Schröder P.: Discrete shells. In _Proceedings of the ACM SIGGRAPH Symposium on Computer Animation_ (2003).
- [ITF04] Irving G., Teran J., Fedkiw R.: Invertible finite elements for robust simulation of large deformation. In _Proceedings of the ACM SIGGRAPH Symposium on Computer Animation_ (2004), pp. 131–140.
- [Jak01] Jakobsen T.: Advanced character physics – the fysix engine. _www.gamasutra.com_ (2001).
- [MHTG05] Müller M., Heidelberger B., Teschner M., Gross M.: Meshless deformations based on shape matching. _Proceedings of ACM Siggraph_ (2005), 471–478.
- [NMK05] Nealen A., Müller M., Keiser R., Boxerman E., Carlson M.: Physically based deformable models in computer graphics. _Eurographics 2005 state of the art report_ (2005).
- [Pro95] Provot X.: Deformation constraints in a mass-spring model to describe rigid cloth behavior. _Proceedings of Graphics Interface_ (1995), 147–154.
- [Rat04] Ratcliff J.: Rocket - a viewer for real-time physics simulations. _www.physicstools.org_ (2004).
- [THM03] Teschner M., Heidelberger B., Müller M., Pomeranerts D., Gross M.: Optimized spatial hashing for collision detection of deformable objects. _Proc. Vision, Modeling, Visualization VMV 2003_ (2003), 47–54.
- [THMG04] Teschner M., Heidelberger B., Müller M., Gross M.: A versatile and robust model for geometrically complex deformable solids. _Proceedings of Computer Graphics International (CGI)_ (2004), 312–319.
- [VCMT95] Volino P., Courchesne M., Magnenat-Thalmann N.: Versatile and efficient techniques for simulating cloth and other deformable objects. _Proceedings of ACM Siggraph_ (1995), 137–144.

#separator()

== Appendix A:

=== 정규화된 외적의 그래디언트

제약 함수는 종종 정규화된 외적을 포함합니다. 투영 보정을 유도하기 위해서는 제약 함수의 그래디언트가 필요합니다. 따라서 두 인수에 대한 정규화된 외적의 그래디언트를 아는 것이 유용합니다. 정규화된 외적 $bold(n) = (bold(p)_1 times bold(p)_2) / |bold(p)_1 times bold(p)_2|$이 주어졌을 때, 첫 번째 벡터에 대한 도함수는 다음과 같습니다:

$ frac(partial bold(n), partial bold(p)_1) = mat(delim: "(", frac(partial n_x, partial p_(1 x)), frac(partial n_x, partial p_(1 y)), frac(partial n_x, partial p_(1 z)); frac(partial n_y, partial p_(1 x)), frac(partial n_y, partial p_(1 y)), frac(partial n_y, partial p_(1 z)); frac(partial n_z, partial p_(1 x)), frac(partial n_z, partial p_(1 y)), frac(partial n_z, partial p_(1 z))) quad quad (16) $

$ = frac(1, |bold(p)_1 times bold(p)_2|) (mat(delim: "(", 0, p_(2 z), -p_(2 y); -p_(2 z), 0, p_(2 x); p_(2 y), -p_(2 x), 0) + bold(n)(bold(n) times bold(p)_2)^T) quad quad (17) $

축약하면, 두 인수에 대해 다음과 같습니다:

$ frac(partial bold(n), partial bold(p)_1) = frac(1, |bold(p)_1 times bold(p)_2|) (-tilde(bold(p))_2 + bold(n)(bold(n) times bold(p)_2)^T) quad quad (18) $

$ frac(partial bold(n), partial bold(p)_2) = frac(1, |bold(p)_1 times bold(p)_2|) (tilde(bold(p))_1 + bold(n)(bold(n) times bold(p)_1)^T) quad quad (19) $

여기서 $tilde(bold(p))$는 $tilde(bold(p)) bold(x) = bold(p) times bold(x)$ 성질을 갖는 행렬입니다.

=== 굽힘 제약 조건 투영

굽힘의 제약 함수는 $C = arccos(d) - phi.alt_0$이며, 여기서 $d = bold(n)_1^T dot bold(n)_2 = bold(n)_1^T bold(n)_2$입니다. 일반성을 잃지 않고 $bold(p)_1 = bold(0)$으로 설정하면 법선 $bold(n)_1 = (bold(p)_2 times bold(p)_3) / |bold(p)_2 times bold(p)_3|$와 $bold(n)_2 = (bold(p)_2 times bold(p)_4) / |bold(p)_2 times bold(p)_4|$를 얻습니다. $upright(d) / (upright(d) x) arccos(x) = -1 / sqrt(1 - x^2)$이므로 다음 그래디언트를 얻습니다:

$ nabla_(bold(p)_3) C = -frac(1, sqrt(1 - d^2)) (frac(partial bold(n)_1, partial bold(p)_3))^T (bold(n)_2) quad quad (21) $

$ nabla_(bold(p)_4) C = -frac(1, sqrt(1 - d^2)) (frac(partial bold(n)_2, partial bold(p)_4))^T (bold(n)_1) quad quad (22) $

$ nabla_(bold(p)_2) C = -frac(1, sqrt(1 - d^2)) ((frac(partial bold(n)_1, partial bold(p)_2))^T bold(n)_2 + (frac(partial bold(n)_2, partial bold(p)_2))^T bold(n)_1) quad quad (23) $

$ nabla_(bold(p)_1) C = -nabla_(bold(p)_2) C - nabla_(bold(p)_3) C - nabla_(bold(p)_4) C quad quad (24) $

정규화된 외적의 그래디언트를 사용하여 먼저 다음을 계산합니다:

$ bold(q)_3 = frac(bold(p)_2 times bold(n)_2 + (bold(n)_1 times bold(p)_2) d, |bold(p)_2 times bold(p)_3|) quad quad (25) $

$ bold(q)_4 = frac(bold(p)_2 times bold(n)_1 + (bold(n)_2 times bold(p)_2) d, |bold(p)_2 times bold(p)_4|) quad quad (26) $

$ bold(q)_2 = -frac(bold(p)_3 times bold(n)_2 + (bold(n)_1 times bold(p)_3) d, |bold(p)_2 times bold(p)_3|) - frac(bold(p)_4 times bold(n)_1 + (bold(n)_2 times bold(p)_4) d, |bold(p)_2 times bold(p)_4|) quad quad (27) $

$ bold(q)_1 = -bold(q)_2 - bold(q)_3 - bold(q)_4 quad quad (28) $

그러면 최종 보정은 다음과 같습니다:

$ Delta bold(p)_i = -frac(w_i sqrt(1 - d^2) (arccos(d) - phi.alt_0), sum_j w_j |bold(q)_j|^2) bold(q)_i quad quad (29) $

#separator()

_© The Eurographics Association 2006._
