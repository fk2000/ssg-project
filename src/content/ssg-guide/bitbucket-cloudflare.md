---
title: "実践：Bitbucket と Cloudflare Pages で作る自動デプロイ環境"
chapter: 3
order: 1
status: "published"
tags: ["CI/CD", "Bitbucket", "Cloudflare"]
summary: "Bitbucket Pipelines を活用して、Astro プロジェクトを Cloudflare Pages へ自動デプロイする具体的な手順を解説します。"
---

# 実践：自動デプロイ環境の構築

多くのSSGユーザーは GitHub を利用しますが、Bitbucket ユーザーであっても Cloudflare Pages の恩恵を最大限に受けることができます。ここでは、その環境を構築した実際の手順をまとめます。

## 1. ビルド設定の準備

Cloudflare Pages は `dist/client` などのサブディレクトリを公開対象にする必要があります。また、Astro の `@astrojs/cloudflare` アダプターを導入しておくことで、エッジ環境に最適化されたビルドが可能になります。

## 2. Bitbucket Pipelines の構成

ルートディレクトリに `bitbucket-pipelines.yml` を配置します。

```yaml
pipelines:
  branches:
    main:
      - step:
          name: Build and Deploy
          image: node:22
          script:
            - npm install
            - npm run build
            - npx wrangler pages deploy dist/client --project-name 自分のプロジェクト名 --commit-dirty=true
```

## 3. 環境変数の設定 (重要)

Bitbucket の **Repository settings > Pipelines > Repository variables** で、以下の「鍵」を登録します。

- `CLOUDFLARE_API_TOKEN`: Cloudflare の API トークン。
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare のアカウント ID。

## 結論

この設定を行うことで、記事を作成して `git push` するだけで、自動的にグローバルなエッジネットワークへ最新のサイトが公開されるようになります。執筆に専念できる環境の完成です。
