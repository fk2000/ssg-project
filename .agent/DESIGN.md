# DESIGN.md

DESIGN.md は、AIエージェントがプロジェクト全体で一貫したUIを生成するために参照する、デザインシステムフォーマットです。

## 原則 (Principles)
- **一貫性 (Consistency):** AIエージェントが新しい画面を生成する際、常に同一の視覚的ルールを適用します。
- **信頼できる唯一の情報源 (Source of Truth):** デザインに関するすべての意思決定をこのファイルに集約します。
- **生きたドキュメント (Living Artifact):** 開発プロセスの中で自然に更新され続けるドキュメントです。
- **シンプルさ (Simplicity):** 標準的な Markdown を使用して記述します。

## 構造と構文 (Structure & Syntax)
DESIGN.md は以下の要素で構成されます。

### 見出し (H2, H3)
「Colors」「Typography」「Components」などのカテゴリを定義します。

### リスト (Bullet points)
デザイントークンの名前と、その具体的な値（Hex値やピクセル数など）を定義します。

### 注釈 (Guidelines)
AIに対する具体的な指示（Do's and Don'ts）を記述し、スタイルの適用ルールを補足します。

---

## Colors (Midnight Sparkle)
- **Primary (Accent):** `#6366f1` (Indigo Vivid) - 主要なボタン、リンクに使用。
- **Primary-Glow:** `rgba(99, 102, 241, 0.5)` - 発光エフェクト用。
- **Surface (Background):** `#0f172a` (Slate 900) - メイン背景。
- **Surface-L2:** `rgba(30, 41, 59, 0.7)` - カード、サイドバー。グラスモーフィズムのベース。
- **On-Surface (Text):** `#f8fafc` (Slate 50) - メインテキスト。
- **Text-Muted:** `#94a3b8` (Slate 400) - 補助テキスト、要約。
- **Border:** `rgba(255, 255, 255, 0.1)` - 区切り線。

## Typography
- **Headlines:** 'Outfit', 'Inter', sans-serif. 
  - Weight: 700 (Bold)
  - Letter Spacing: -0.02em
- **Body:** 'Inter', sans-serif.
  - Weight: 400 (Regular)
  - Line Height: 1.6

## Effects
- **Glassmorphism:** 
  - Backdrop Blur: `12px`
  - Border: `1px solid rgba(255, 255, 255, 0.1)`
  - Shadow: `0 8px 32px 0 rgba(0, 0, 0, 0.37)`
- **Animations:** 
  - Hover Transition: `all 0.3s cubic-bezier(0.4, 0, 0.2, 1)`
  - Reveal: 下から上へ 10px 移動しながら不透明度アップ。

## Do's and Don'ts
- **Do:** グラデーションを積極的に使い、平坦なデザインを避ける。
- **Do:** Google Fonts から 'Outfit' と 'Inter' を読み込む。
- **Don't:** 原色の赤や青を使わず、HSLで調整された洗練された色を使う。
- **Do:** 背景にわずかなグラデーション（radial-gradient）を入れて奥行きを出す。

---
参照元: [Stitch - Design-MD Overview](https://stitch.withgoogle.com/docs/design-md/overview)
