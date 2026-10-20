---
title: "AIにDockerfileを書かせる"
free: false
---

第1章では、AI が書いた `compose.yaml`（Compose の設定ファイル）と `Dockerfile.dev`（開発用のコンテナの作り方を書いたファイル）を直して、手元で起動しました。この章では、そのやり取りを最初から順に見ていきます。どんなプロンプト（AI への指示文）を渡し、AI が何を返し、どこが間違っていて、どう直したかです。最後に、Mac で実際につまずいた3つも取り上げます。

## この章で使う記録

- AI の出力：作業用の Linux（Debian 13 / x86_64、Docker 29.9.1、Compose v5.6.0）で、AI に書かせた最初の出力を、手を加えずに保存したものです（2026年10月20日）。AI は Grok Bot です。
- Mac の記録：第1章と同じ Mac（macOS 27.0.1、OrbStack、Docker 29.8.2、Compose v5.5.0）で動かしたときのログです。
- パスワードは、どちらもダミーの `password` です。

## 1. AI に渡したプロンプト

渡したのは次の文です。比べる材料として、2018年の compose ファイルも一緒に見せました。

> この Rails 8 アプリを、手元の開発用に docker compose で MySQL と一緒に動かしたい。今の Compose（V2）の書き方で compose.yaml と開発用の Dockerfile.dev を書いて。DB の準備ができるまで Rails を待たせて、DB の接続は DATABASE_URL で渡して。

ポイントは3つです。

- **「今の Compose（V2）の書き方で」と書く。** 書かないと、古い `version:` 付きの形が混ざるおそれがあります。
- **「DB の準備ができるまで待たせて」と、してほしい動きを書く。** 「healthcheck を書いて」と書き方を指定するより、目的を伝えるほうが AI は形を選びやすくなります。
- **接続の渡し方（`DATABASE_URL`、DB の接続先を1行で書く環境変数）を決めておく。** 決めないと、`database.yml` を書き換える案など、別のやり方が出てきます。

## 2. AI が返したもの

出力は約7秒で返ってきました。そのまま載せます。

```yaml
services:
  db:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: password
    volumes:
      - db-data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

  web:
    build:
      context: .
      dockerfile: Dockerfile.dev
    command: bin/rails server -b 0.0.0.0 -p 3000
    environment:
      DATABASE_URL: mysql2://root:password@db:3306/app_development
      RAILS_ENV: development
    volumes:
      - .:/app
    ports:
      - "3000:3000"
    depends_on:
      db:
        condition: service_healthy

volumes:
  db-data:
```

```dockerfile
FROM ruby:3.4

RUN apt-get update -qq && apt-get install -y build-essential default-libmysqlclient-dev

WORKDIR /app

COPY Gemfile Gemfile.lock ./
RUN bundle install

COPY . .

EXPOSE 3000
CMD ["bin/rails", "server", "-b", "0.0.0.0"]
```

あわせて「起動は `docker compose up --build`、初回は `docker compose exec web bin/rails db:prepare` で DB を作成してください」という案内も付いていました。

ぱっと見ると、よくできています。ここで「動きそう」と思って、そのまま使いたくなります。

## 3. チェック表で確かめる

次の5つの点を見ました。

| 見るべき点 | 結果 |
|---|---|
| `version:` を書いていない | OK |
| `docker-compose`（ハイフン付き）と書いていない | OK（案内の文も `docker compose` でした） |
| DB の準備を待つ（`healthcheck` と `condition: service_healthy`） | OK（一部手直し） |
| `tmp/pids/server.pid` を消してから起動する | NG |
| MySQL イメージのバージョン | NG |

5項目中3項目が OK でした。今の Compose の書き方そのものは、AI もきちんと押さえています。間違いは、表にない点も含めて4つありました。

## 4. AI が間違えた4つと、その直し方

### 4-1. `mysql:8.0` を選んだ

MySQL の公式ページによると、MySQL 8.0 は2026年4月21日から Oracle の Sustaining Support（新しい修正は出ず、既存の情報だけで支える段階）に移りました。公式は 8.4 LTS か 9.7 LTS への移行を勧めています。長く使う前提なら、LTS（長期サポート版）の 8.4 に固定します。

https://www.mysql.com/support/eol-notice.html

```yaml
    image: mysql:8.4
```

AI は、学んだ時点で多く使われていたバージョンを出しがちです。「今も使ってよいか」は、公式のサポート期間で確かめる必要があります。

### 4-2. `server.pid` を消す処理がなかった

Rails は、起動するときに `tmp/pids/server.pid`（動いているサーバーの番号を書いたファイル）を作ります。コンテナを止めたときにこのファイルが残ると、次の起動で「A server is already running」と出て止まります。起動コマンドの前で消すようにします。

```yaml
    command: bash -c "rm -f tmp/pids/server.pid && bin/rails server -b 0.0.0.0 -p 3000"
```

### 4-3. まだない `Gemfile.lock` をコピーしようとした

第1章では `rails new` を `--skip-bundle`（gem を入れる処理を飛ばす）付きで実行しました。そのため、まだ `Gemfile.lock`（gem のバージョンを固定するファイル）がありません。AI の出力のままビルドすると、次のエラーで止まりました。

```
failed to solve: failed to compute cache key: ... "/Gemfile.lock": not found
```

`*` を付けて、ファイルがなくても通るようにします。

```dockerfile
COPY Gemfile Gemfile.lock* ./
```

これはチェック表にない間違いでした。AI は「ふつうの Rails アプリ」を前提に書くので、こちらがどういう手順でアプリを作ったかまでは考えてくれません。

### 4-4. healthcheck（DB が準備できたかの確認）が弱かった

AI の healthcheck は、確認先が `-h localhost` で、回数（`retries`）が5回でした。

- 10秒おきに5回では、初回の DB の初期化が遅いときに足りないおそれがあります。20回に増やしました。
- 確認先は `127.0.0.1` にし、パスワード（`-ppassword`）も渡す形にしました。

MySQL の公式マニュアルによると、Unix では `localhost` は特別に扱われ、TCP/IP（ネットワーク経由）ではなく Unix ソケットファイル（同じマシンの中だけで使う接続口）でつながります。

https://dev.mysql.com/doc/refman/8.4/en/connecting.html

Docker 公式の MySQL イメージは、初回の初期化のあいだ、ネットワークを切った（`--skip-networking`）仮のサーバーを起動します。

https://github.com/docker-library/mysql/blob/master/8.4/docker-entrypoint.sh

このため、ソケットでつなぐ `-h localhost` のままだと、初期化中の仮のサーバーに ping が通り、web から TCP でつながる本番のサーバーが動く前に「準備できた」と判定されることがあります。`127.0.0.1` を指定すると TCP でつなぐので、web と同じ経路で確かめられます。

作業用の Linux で、mysql:8.4 に初期化に20秒かかるスクリプトを入れて試すと、`-h localhost` は仮のサーバーに対して約21秒早く OK になりました。`127.0.0.1` は、本番のサーバーが 3306 番ポートで待ち受けを始めるまで通りませんでした。compose でも、localhost だと約4秒で Healthy になりましたが、その後に db:3306 への接続は失敗しました。127.0.0.1 にすると Healthy までに29秒かかりましたが、その後の接続は成功しました。なお、今回の手順のように初期化スクリプトがない場合、仮のサーバーが動くのは2秒ほどです。そのため、AI の元の設定（interval 10s）では、今回の手順で実際に問題になる可能性は低いです。

```yaml
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "127.0.0.1", "-ppassword"]
      interval: 10s
      timeout: 5s
      retries: 20
```

## 5. 直したあとの形

4つを直したあとの全体です。直した行は 4-1〜4-4 で見たとおりです。Dockerfile.dev では、あわせて apt のキャッシュを消す形（`--no-install-recommends` と `rm -rf /var/lib/apt/lists/*`）にしています。

```yaml
services:
  db:
    image: mysql:8.4
    environment:
      MYSQL_ROOT_PASSWORD: password
    volumes:
      - db-data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "127.0.0.1", "-ppassword"]
      interval: 10s
      timeout: 5s
      retries: 20

  web:
    build:
      context: .
      dockerfile: Dockerfile.dev
    command: bash -c "rm -f tmp/pids/server.pid && bin/rails server -b 0.0.0.0 -p 3000"
    environment:
      DATABASE_URL: mysql2://root:password@db:3306/app_development
      RAILS_ENV: development
    volumes:
      - .:/app
    ports:
      - "3000:3000"
    depends_on:
      db:
        condition: service_healthy

volumes:
  db-data:
```

```dockerfile
FROM ruby:3.4

RUN apt-get update -qq && apt-get install -y --no-install-recommends build-essential default-libmysqlclient-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY Gemfile Gemfile.lock* ./
RUN bundle install

COPY . .

EXPOSE 3000
CMD ["bin/rails", "server", "-b", "0.0.0.0"]
```

この形で `docker compose up -d --build` を実行すると、db が `Up (healthy)` になってから web が起動しました。`docker compose exec web bin/rails db:prepare` で `Created database 'app_development'` と出て、`/up` は 200 を返しました。片付けまで含めて全体で約185秒（作業用の Linux で）でした。

第1章に載せたのは、手順書の見本として起動まで確かめた形です。中身の考え方は同じですが、次の点が違います。第1章の形は Mac と Linux、この章の形は Linux で動くことを確かめています。

| 項目 | 第1章（手順書の見本） | この章（AI の出力を直した形） |
|---|---|---|
| apt で入れるもの | `default-mysql-client` | `build-essential default-libmysqlclient-dev` |
| healthcheck の間隔 | 5秒 | 10秒（`timeout: 5s` 付き） |
| `DATABASE_URL` の DB 名 | なし | `/app_development` |
| そのほか | — | `RAILS_ENV`、`EXPOSE 3000`、`-p 3000` |

## 6. 経験があれば気づける理由

4つの間違いは、どれも 2018年当時から Docker で Rails を動かしてきた人なら、一度は踏んだことのある落とし穴です。

- **`server.pid`** は、docker-compose で Rails を動かした人の多くが「A server is already running」で止められた経験を持っています。だから、出力に `rm -f tmp/pids/server.pid` がないと、すぐ気づけます。
- **`Gemfile.lock`** は、自分がどの順番でアプリを作ったかを覚えていれば、「まだないはず」と分かります。
- **DB の待ち方** は、2018年の `depends_on: - db` が「起動の順番」しか決めず、DB の準備までは待たなかったことを知っていれば、healthcheck の回数にも目が向きます。
- **MySQL のバージョン** は、「AI は古い定番を出しがち」と知っていれば、まず疑う場所です。

つまり、AI の出力を読むときに見るべき場所が、経験で分かっているということです。AI は下書きを数秒で出してくれます。人は、その下書きのどこが危ないかを経験で見抜きます。この分担なら、技術が速く変わっても追いつけます。

## 7. Mac でつまずいた3つ

ここからは、第1章と同じ Mac で動かしたときに実際に止まったところです。どれも AI の出力の中身ではなく、ファイルの置き方や環境が原因でした。

### 7-1. `~/.docker` の持ち主が root になっていた

ビルドが始まってすぐ、次のエラーで止まりました。

```
open /Users/<ユーザー名>/.docker/buildx/current: permission denied
```

このとき `docker compose up -d --build` は、約13秒（12.755秒）で終わっていました。以前 `sudo` で docker を動かしたことがあると、設定のフォルダ `~/.docker` の持ち主が root になることがあります。次のコマンドで自分の持ち物に戻せます。

```
$ sudo chown -R "$(id -un)":"$(id -gn)" ~/.docker
```

検証エンジニアが作業用の Linux で同じ種類のエラー（`~/.docker/buildx` の permission denied）を再現し、`~/.docker` の持ち主を戻すと出なくなることを、上の形のコマンドで確かめています。Mac（OrbStack）でも、このコマンドで持ち主が戻り、buildx が動くことを確かめました。持ち主は自分のユーザー:`staff` になり、`docker buildx ls` では `default` と `orbstack` が running でした。なお、Docker Desktop を使っていないと `desktop-linux` にエラーが出ますが、OrbStack を使う分には影響しません。

`$(id -un)` は自分のユーザー名、`$(id -gn)` は自分のグループ名です。Mac のふつうのグループはユーザー名と同じではなく `staff` なので、`"$USER":"$USER"` の形だと「illegal group name」というエラーになります。

### 7-2. `Dockerfile.dev` が見つからなかった

`~/.docker` を直したあと、次のエラーで止まりました。

```
failed to solve: failed to read dockerfile: open Dockerfile.dev: no such file or directory
```

AI が書いた `compose.yaml` と `Dockerfile.dev` を、アプリのフォルダではなく、1つ上のフォルダに保存していました。`compose.yaml` の `build.context: .` は「compose.yaml がある場所」を指すので、ファイルの置き場所がずれると、Dockerfile も探せなくなります。ファイルをアプリのフォルダ（`rails new` したフォルダ）に置き直すと通りました。

AI はファイルの中身は書いてくれますが、「どこに保存するか」はこちらの作業です。保存したら `ls` で、`Gemfile` と同じ場所にあるかを確かめます。

### 7-3. `compose.yaml` と `compose.yml` が両方あった

やり直したときに、次の警告が出ました。

```
WARN[0000] Found multiple config files with supported names: .../compose.yaml, .../compose.yml
WARN[0000] Using .../compose.yaml
```

AI が最初に書いた `compose.yml` と、直した `compose.yaml` が同じフォルダに残っていました。両方あるときは `compose.yaml` が使われます。

https://docs.docker.com/compose/intro/compose-application-model/

動きはしますが、どちらが使われているか迷うもとです。残すほうが直した版かを確かめてから、使わないほうを消します。

```
$ grep image compose.yaml
    image: mysql:8.4
$ rm compose.yml
```

この3つを片付けたあとは、`docker compose up -d --build` が（第1章の形で）2分37秒で終わり、db が `Up (healthy)`、web が `Up` になりました。`db:prepare` で DB が作られ、`/up` は 200 を返しました。

### 7-4. 手を動かして難しかったこと

いちばん迷ったのは、AI へのプロンプトにどこまで貼るか（どのファイルを、どの範囲で見せるか）でした。もう1つは、yml を書き直したあとにコマンドを打ち直すのを忘れがちなことです。直したら `docker compose up -d --build` をやり直します。

## この章のまとめ

- プロンプトには「今の書き方で」「してほしい動き」「接続の渡し方」を書きます。
- AI の出力は5項目中3項目が OK でした。今の Compose の書き方は押さえています。
- 間違いは4つでした。`mysql:8.0`、`server.pid` の消し忘れ、まだない `Gemfile.lock`、弱い healthcheck です。
- どれも経験があれば、出力を見た時点で気づけます。
- Mac では、`~/.docker` の持ち主、ファイルの保存場所、`compose.yml` の残りで止まりました。中身よりも、置き方や環境の問題です。

## 次の章へ

この章では、AI に Dockerfile と compose.yaml を書かせ、間違いを直して動かしました。次の第3章（追加予定）では、`compose.yml`（compose.yaml）そのものをくわしく見ます。2018年のファイルと1行ずつ比べながら、`healthcheck`、名前付きボリューム、環境変数の渡し方など、今の書き方の意味を確かめていきます。
