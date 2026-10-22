---
title: "Railway障害でMinecraft AIボットをRender無料プランへ緊急移転した話"
emoji: "🚚"
type: "tech"
topics: ["render", "cloudflare", "railway", "minecraft", "discord"]
published: true
---

## 困りごと：ダッシュボードに入れず、ボットを止めることもできない

PaaS（Platform as a Service：サーバー管理を任せられるアプリ実行サービス）の Railway で動かしていた Minecraft AI ボットが、障害でまったく操作できなくなりました。この記事では、Render の無料プランへ急いで引っ越したときの手順とつまずきをまとめます。

## 概要

- **期間**：2026年10月21日〜22日（JST）
- **対象**：Discord と Minecraft につながる AI ボット（Node.js、Docker で動かす）
- **背景**：
  - 10/21、Railway で障害が起き、筆者の環境ではダッシュボードに入れなくなりました（障害情報：https://status.railway.com/ ）。
  - 10/22 10:35（JST）、Railway からセキュリティ通知メールが届きました。環境変数（アプリに渡す設定値）が漏えいした可能性があり、すべてのシークレット（秘密の鍵）を作り直すよう求める内容でした（Railwayの公式告知：https://blog.railway.com/p/security-disclosure-wednesday-october-21st ）。
- **移転先**：Render 無料プラン


## 原因：止められないPaaSと、漏えいしたかもしれない鍵

問題は2つ重なっていました。

1. **操作できない**：ダッシュボードに入れないので、ボットを止めることも設定を変えることもできません。
2. **鍵が漏れたかもしれない**：環境変数に入れていた鍵が、第三者に見られた可能性がありました（Railwayの公式告知より：https://blog.railway.com/p/security-disclosure-wednesday-october-21st ）。

まず鍵を作り直しました。作り直したのは次の環境変数です（値はもちろん書きません）。

- `DISCORD_TOKEN`
- `GEMINI_API_KEY`
- `JEV_API_KEY`
- 開発版では `CLOUDFLARE_API_TOKEN`（Workers AI を使う「Clef」用）

## 移転先の比較

候補のうち、公式の料金ページで確認できたものだけ載せます（2026年10月時点）。

| 候補 | 月額の目安 | 出典 |
|---|---|---|
| Render Starter（512 MB RAM） | $7/月 | https://render.com/pricing |
| Render Free（0.1 CPU / 512 MB） | $0 | https://render.com/pricing |

今回は「まず動かす」ことを優先して、Render の無料プランを選びました。

### Render 無料プランの制約

[Render の公式ドキュメント](https://render.com/docs/free)によると、無料の Web サービスには次の制約があります。

- **15分間アクセスが無いと停止**（spin down：眠る）します。
- 無料インスタンスの稼働時間は、ワークスペースごとに**月750時間**です。
- ファイルシステムは一時的で、**再起動や再デプロイでファイルが消えます**。
- 性能は **0.1 CPU / 512 MB RAM** です。

:::message alert
Render の AUP は利用制限の回避を禁じており、起こし役による常時起動はグレーです。停止される可能性があります。長く使うなら有料プランへ。
:::

## 移転手順

1. **ヘルスチェック用の `/healthz` を追加**：外から「生きているか」を確かめるためのエンドポイント（URLの入り口）です。Minecraft への接続状態も返すようにしました。
2. **`render.yaml` を用意**：Render の Blueprint（設定ファイルからサービスを作る仕組み）用です。リージョンは Singapore、実行方式は Docker にしました。
3. **Docker のベースイメージを固定**：`node:22.23.4-alpine` にしました。
4. **保存先を `/tmp` に変更**：`CLEF_USAGE_STATE_PATH` を `/tmp` 配下にしました。無料プランではファイルが消える前提で、書き込める場所を指定するためです。
5. **シークレットは Render の画面で入力**：`render.yaml` には値を書かず、キー名だけを置いて画面から入れました。
6. **PR をマージして Blueprint を作成**
7. **`/healthz` で動作を確認**：Minecraft への接続状態まで返ってくるかを見ます。


## つまずき

### 1. Render が公開用リポジトリを指していた

実際に動かしているのは別の非公開の開発用リポジトリでした。接続先のリポジトリを付け替えました。

### 2. 「render.yaml not found」

`render.yaml` を追加した PR（プルリクエスト：変更の取り込み依頼）を、まだマージしていませんでした。マージしたら解決しました。

### 3. Blueprint が既存サービスを検出した

「Associate existing services」（既存サービスと結びつける）を選びました。新しく作ると、無料枠を二重に使ってしまうためです。

### 4. `CLOUDFLARE_ACCOUNT_ID` が無くて起動失敗

環境変数が1つ足りず、デプロイ後に起動できませんでした。追加して解決しました。

### 5. Minecraft に入ってこない

`/healthz` が `minecraft:disconnected` を返していました。ログを見ると、Microsoft のデバイスコード認証（別の端末で `microsoft.com/link` にコードを入れるログイン方式）の待ち状態でした。

無料プランは再起動でファイルが消えるので、**再起動のたびにこの認証が必要**になります。有料プランで永続ディスク（再起動しても消えない保存場所）を付ければ、認証情報を残せるので認証し直さずに済みます（[Render公式：Persistent Disks](https://render.com/docs/disks)）。


### 6. 「You logged in from another location」で追い出し合い

認証して接続できたものの、すぐに追い出されました。原因は、ログインできない Railway 側の古いボットがまだ動いていたことです。

筆者の環境では、Microsoft アカウントの「すべての場所からサインアウト」で古いボットを締め出せました。ただ、すぐには切れず、しばらくは追い出し合いが続きました。

## まとめ

- PaaS の障害では、**「止められない」こと自体がリスク**になります。
- 漏えいの可能性があれば、**シークレットはすぐ作り直す**のが先です。
- ヘルスチェックに**外部接続（Minecraft など）の状態も出しておく**と、切り分けがとても速くなります。
- Render の無料プランは、15分で停止・ファイルが消える・月750時間という制約があります。急場しのぎには便利ですが、常駐させ続けるボットを長く動かすなら有料プランが安心です。

この記事が、PaaS の障害で困っている方の引っ越しのヒントになれば幸いです。

---

Docker でアプリを動かす流れを2018年から2026年まで AI と一緒にやり直した本『AI × Docker』も書いています。10/24公開予定で、第1章は無料で読めます。
