---
title: "第6章：CI/CD：自動デプロイ環境の構築"
free: true
---

# 継続的デプロイ (CI/CD) の構築

マルチプラットフォームへの自動配信フロー：

```mermaid
graph TD
    Local["ローカル環境 (VS Code)"] -- "git push" --> BB["Bitbucket (メイン)"]
    BB -- "Pipelines (Build)" --> CF["Cloudflare Pages (本番サイト)"]
    BB -- "Mirroring (SSH)" --> GH["GitHub (ミラー)"]
    GH -- "GitHub Integration" --> Zenn["Zenn (技術記事/本)"]
```

## 実装のステップ

1. **bitbucket-pipelines.yml** の作成。
2. **Cloudflare API Token** の発行。
3. Bitbucket の環境変数にトークンをセット。

:::message
この自動化を行うことで、記事を書いて `git push` するだけで全世界の CDN に最新の状態が反映されるようになります。本質的な執筆作業に集中できる環境です。
:::
