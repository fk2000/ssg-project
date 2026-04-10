---
title: "Eleventy：JavaScriptを使わずに究極のシンプルさを追求する"
chapter: 2
order: 6
status: "published"
tags: ["JavaScript", "Simple", "Performance"]
summary: "JavaScriptを一切配信しない『Zero-Bundle』を簡単に実現できるSSG。極限のパフォーマンスを求める技術ブログや個人サイトに最適です。"
---

> [!NOTE]
> ※2026年4月時点、Eleventy v3.1.5 ベースの解説。

## テクニカル・クイックビュー
| 指標 | 評価 | 備考 |
| :--- | :--- | :--- |
| **ビルド速度** | 🚀🚀 | JavaScript製としては高速 |
| **学習コスト** | 📚 | 既存のHTML知識が活かせる |
| **デプロイ** | 🛠️ | 極めて軽量な成果物 |

# シンプル・イズ・ベスト：Eleventy (11ty)

Eleventyは、複雑化した現代のフロントエンド開発に対する「アンチテーゼ」とも言える、非常にシンプルな静的サイトジェネレーターです。

## 主な強み

- **Zero-bundle by default**: クライアント側に JavaScript を送らない設定が容易で、Core Web Vitals で満点を狙えます。
- **多様なテンプレート言語**: Liquid, Nunjucks, Handlebars, Markdown など、自分が慣れ親しんだ言語をそのまま使えます。

## 推奨ユースケース
ポートフォリオ、技術ブログ、ドキュメントサイトなど、コンテンツの読みやすさと速度が最優先されるプロジェクトにおすすめです。

Source: [11ty.dev](https://www.11ty.dev/)
