---
title: "実践：独自ドメインの設定と Cloudflare DNS の活用"
chapter: 3
order: 2
status: "published"
tags: ["Domain", "DNS", "Cloudflare"]
summary: "サイトのブランドを確立するための独自ドメイン設定。Cloudflare Pages ならではの簡単かつ強力なDNS管理術を解説します。"
---

# 独自ドメインでサイトをブランド化する

`xxx.pages.dev` というデフォルトドメインから、自分だけの独自ドメインへ移行することは、サイトの信頼性と専門性を高めるための第一歩です。

## 1. Cloudflare Pages での設定

1.  Cloudflare ダッシュボードの Pages プロジェクトから **「Custom domains」** タブを選択します。
2.  **「Set up a custom domain」** をクリックし、所有しているドメインを入力します。

## 2. DNS の自動連携

ドメインを Cloudflare DNS で管理している場合、設定は数クリックで完了し、SSL証明書（HTTPS）も自動的に発行・更新されます。

## 3. Cloudflare DNS を使うメリット

- **プロキシ機能**: オリジンサーバーのIPを隠し、DDoS攻撃から保護します。
- **エッジキャッシュ**: ドメインレベルでキャッシュを制御し、さらなる高速化が可能です。
- **リダイレクトルール**: `www` あり/なしの統一などが、サーバーレスで簡単に設定できます。

## 結論

独自ドメインの設定は、単なるURLの変更ではありません。Cloudflare の強力なエッジインフラをフル活用するための入り口でもあります。
