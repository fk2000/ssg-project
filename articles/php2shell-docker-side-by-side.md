---
title: "本番を止めずPHPを並べる：PHP2shell対策をDockerで確かめる"
emoji: "🐳"
type: "tech"
topics: ["php", "docker", "security", "compose", "vulnerability"]
published: true
---

PHPに「PHP2shell」と呼ばれる脆弱性の組み合わせが公表されました。本番をすぐ上げたいけれど、アプリが新しいパッチ版で動くか不安、という方は多いと思います。この記事では、Docker Composeで「今のバージョン」と「修正版」を手元に並べ、動作の差を落ち着いて確かめる方法を紹介します。

## 1. 何が起きているか

IPA（情報処理推進機構）は2026年10月22日に注意喚起を公開し、10月27日に更新しています。

- 対象はCVE-2026-109618とCVE-2026-109619で、組み合わせて「PHP2shell」と呼ばれています。
- IPAは、遠隔の第三者によって任意のコードを実行される可能性があるとしています。
- 修正版は **8.2.35／8.3.36／8.4.27／8.5.12** です。各系列でこれより前のバージョンが影響を受けます。
- 米CISAは2026年10月26日（現地時間）にKEV（悪用が確認された脆弱性カタログ）へ追加しました。IPAは、国内の被害事例は把握していないとしています。
- **8.1以前はサポート終了（EOL）のため、今回の修正は提供されません。** 対応にはサポート中の系列への移行が必要です。

出典：[IPA 重要なセキュリティ情報](https://www.ipa.go.jp/security/security-alert/2026/alert20261022.html)。詳細はPHP公式のSecurity advisory（[GHSA-w8hw-w9fx-j79w](https://github.com/php/php-src/security/advisories/GHSA-w8hw-w9fx-j79w)）もあわせて確認してください。なお、CloudflareはこのテーマでCTFの記事を出しています（[Cloudflare Blog](https://blog.cloudflare.com/php-ctf/)）。解法や攻撃手順はこの記事では扱いません。

## 2. この記事でやること／やらないこと

**やること**
- 修正前と修正後のPHPをコンテナで並べ、バージョン表示と簡単なHTTP応答を比べます。
- AIに互換チェックのたたき台を書かせ、人がレビューして直します。

**やらないこと**
- 脆弱性の再現、PoC、攻撃手順、CTFの解法は扱いません。
- 「これで安全」と言い切ることもしません。最終判断は公式情報と、ご自身の環境での検証で行ってください。

目的は「アップデートしても壊れないか」を本番の外で確かめることです。

## 3. 最小composeで old / patched を並べる

ディレクトリ構成は次のとおりです。

```text
php2shell-lab/
├── compose.yaml
└── app/
    └── index.php
```

`compose.yaml`：

```yaml
services:
  php-old:
    # 記事では「パッチ前の例」として使う。8.1以前は修正なし＝移行が必要、と本文で明記する
    image: php:8.2.34-cli
    working_dir: /app
    volumes:
      - ./app:/app
    command: ["php", "-S", "0.0.0.0:8080", "-t", "/app"]
    ports:
      - "127.0.0.1:8082:8080"

  php-patched:
    # IPAが挙げる修正版の一例（8.2系）。お手元でも docker pull で実在確認（2026-10-29時点でHub実在確認済み）
    image: php:8.2.35-cli
    working_dir: /app
    volumes:
      - ./app:/app
    command: ["php", "-S", "0.0.0.0:8080", "-t", "/app"]
    ports:
      - "127.0.0.1:8083:8080"
```

:::message alert
`php:8.2.34-cli` / `php:8.2.35-cli` は、2026-10-29時点でDocker Hubに実在することを確認済みです。お手元でも `docker pull` で存在を確かめてから使ってください。タグが無い場合は、修正版に対応する別系列（例：`php:8.3.36-cli`）へ差し替えてください。
:::

ポイントは次のとおりです。

- 変えるのはイメージだけにし、同じ `app/` を両方に渡します。
- ポートは `127.0.0.1` に限定し、外部へ公開しません（手元ラボ用）。
- 先頭の `version:` は書きません。現行のCompose仕様では不要で、警告の原因になります。

`app/index.php`：

```php
<?php
header('Content-Type: text/plain; charset=UTF-8');
echo 'PHP ', PHP_VERSION, PHP_EOL;
echo 'ok', PHP_EOL;
```

実行と確認は次のとおりです。

```bash
mkdir -p ~/php2shell-lab/app && cd ~/php2shell-lab
# compose.yaml と app/index.php を置く
docker compose pull
docker compose config        # 構文チェック（起動しない）
docker compose up -d
curl -s http://127.0.0.1:8082/
curl -s http://127.0.0.1:8083/
docker compose exec php-patched php -v
docker compose down
```

両方の応答に想定どおりの `PHP_VERSION` が出れば、並べる準備は完了です。次は、本当に確かめたい「自分のアプリ」をこの `app/` に置き換えるか、ボリュームでマウントして、主要な画面やバッチを両方で動かします。

本番が8.1以前なら、`php-old` を今のバージョンに、`php-patched` を移行先の系列の修正版にして、同じ並べ方で移行の影響を確かめられます。8.1以前は「並べてパッチ」ではなく「サポート中への移行」が必要です。

## 4. AIに互換チェックを書かせ、人が直す

composeやチェック用コマンドのたたき台はAIに頼むと速いです。プロンプトは短くて構いません。

```text
本番の PHP 8.2 アプリを止めずに、Docker でパッチ済み PHP 8.2.35 と並べて動作確認したい。
docker compose の yaml と、バージョン確認・簡単な HTTP 応答確認のコマンドだけ出して。
攻撃の再現手順は不要。公式の修正バージョンは IPA の注意喚起に従う。
```

ただし、出力はそのまま使わず必ずレビューします。よくある失敗例を1つ挙げます。

**失敗例：浮動タグや存在しないタグ**

AIが `image: php:8.2` や `php:latest` と書くことがあります。浮動タグでは、pullした日によって中身が変わります。そのため、どのパッチ版を確かめたのかが記録に残りません。逆に、それらしいけれど実在しないタグを出してくることもあります。

直し方は次のとおりです。

- `php:8.2.35-cli` のように**パッチ版まで固定**します。さらに厳密にしたい場合はダイジェスト（`@sha256:...`）で固定します。
- `docker pull` かDocker Hubのタグ一覧で、**実在を確認してから**使います。
- IPAの修正版番号（8.2.35／8.3.36／8.4.27／8.5.12）とタグが一致しているかを見ます。
- AIが付けがちな先頭の `version: "3.8"` は**削除**します。

AIは下書きを速く作り、人がタグと公開範囲を確かめる。この分担にすると、速さと確実さを両立しやすくなります。

## 5. まとめ

- PHP2shell（CVE-2026-109618／109619）の修正版は 8.2.35／8.3.36／8.4.27／8.5.12 です。8.1以前は移行が必要です。
- Docker Composeで修正前と修正後を並べれば、本番を止めずに互換性を確かめられます。
- AIのたたき台は、タグの固定・実在確認・`version:` の削除を人がチェックしてから使いましょう。

最終的な適用判断は、IPAとPHP公式の最新情報を確認したうえで行ってください。クラウド側の修正版提供については、必要に応じて各ベンダーの速報もあわせて見てください。

## もっと「並べて確かめる」を知りたい方へ

今回は PHP のバージョンを Docker で並べて確かめました。同じ「AI に下書きさせ、人が一次ソースと実行結果で直す」流れを、Rails の docker compose で最初からやり直すのが『AI × Docker』第1章（無料）です。

https://zenn.dev/fk2000/books/ai-docker-2018-to-2026
