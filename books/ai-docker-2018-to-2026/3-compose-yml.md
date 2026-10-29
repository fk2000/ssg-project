---
title: "compose.yml"
free: false
---

第2章では、AI に `Dockerfile.dev`（開発用のコンテナの作り方を書いたファイル）と `compose.yaml`（Compose の設定ファイル）を書かせ、間違いを直しました。この章では、Dockerfile の次の段階として、複数のコンテナをまとめて動かす compose ファイルそのものを読みます。2018年のファイルと2026年のファイルを並べ、キーごとに何が変わったのかを確かめます。そのうえで、AI に compose だけを追加で聞いたときに出やすい案と、DB・ボリューム・ネットワークでつまずきやすい点を、実際のコマンドと結果つきで見ていきます。

## 1. この章でやること

この章でやることは、次の4つです。

- 2018年と2026年の compose ファイルを並べて、キーごとの違いを読む
- AI に compose だけを追加で聞いたときに考えられる案と、その落とし穴を知る
- DB（データベース）・ボリューム（データの置き場所）・ネットワーク（コンテナどうしの通信路）でハマりやすい点を、手を動かして確かめる
- `docker compose config` / `up` / `ps` / `exec` / `down` で起動を確認し、片付ける

第2章で扱ったプロンプトの全文、AI の出力そのもの、`mysql:8.0` から `8.4` への変更、`server.pid` の扱い、`Gemfile.lock*` の書き方、Mac での3つのつまずきは、ここでは繰り返しません。必要なところは「第2章参照」と書きます。

## 2. 前提環境

この章の記録は、次の環境で取りました。

- 作業用の Linux（Debian 13 / x86_64）
- Docker 29.9.1、Compose v5.6.0
- 記録の日付：2026年10月29日

※上の Docker / Compose の版は納品時の記録です。再検証は box の Docker 27.3.1 / Compose v2.29.7 でも行い、同じ趣旨の結果を確認済みです。
- パスワードはダミーの `password` です。実際のアプリでは使わないでください。

この章の目的は compose ファイルの動きを見ることなので、Rails アプリのビルド（イメージを作る作業）は省きました。`web` サービスは、`build:` の代わりに `mysql:8.4` のイメージを使い、`sleep infinity`（何もせずに待ち続けるコマンド）で起動したままにしています。こうすると、`web` コンテナの中から `db` の名前が引けるか、DB に接続できるかを、Rails なしで確かめられます。Rails を含めた起動は第1章と第2章で確かめています。

Mac（OrbStack）では、この章のコマンドはまだ実行していません。【要確認】Mac（OrbStack）で同じ手順を流し、結果が同じになるかは、今回は確かめていません。

## 3. 2018年と2026年の compose を並べる

### 3-1. 2つのファイル

まず、2018年に書いた `docker-compose.yml` です。第1章で再現したものと同じです。

```yaml
version: '3'
services:
  db:
    image: mysql:5.7
    environment:
      MYSQL_ROOT_PASSWORD: password
  web:
    build: .
    command: bundle exec rails s -p 3000 -b '0.0.0.0'
    volumes:
      - .:/app
    ports:
      - "3000:3000"
    depends_on:
      - db
```

次に、2026年の `compose.yaml` です。第2章で直した最終形と同じです。

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

行数は16行から33行に増えました。ただ、増えた分のほとんどは「DB の準備を待つ」と「DB のデータを残す」ための行です。ファイル名も `docker-compose.yml` から `compose.yaml` に変わっています。今の Compose は `compose.yaml` を優先して読みます。古い名前もまだ読めますが、新しく作るなら `compose.yaml` にしておくのが無難です。

以下、キーごとに見ていきます。

### 3-2. `version:` がなくなった

2018年のファイルの1行目は `version: '3'` でした。当時は、この番号で使える書き方が決まっていたので、必ず書くものでした。

今の Compose では、`version:` は使われていません。書いても動きますが、`docker compose config` を実行すると、次のような警告が出ます。

```text
WARN[0000] /home/user/ch3/compose.yaml: the attribute `version` is obsolete, it will be ignored, please remove it to avoid potential confusion
```

「もう使っていないので無視します。混乱しないように消してください」という意味です。AI に古い記事の形を見せると、この1行が残りやすいので、最初に消す行だと覚えておくと楽です。

### 3-3. `services:` はそのまま、ただし名前に意味がある

`services:` の下に、動かすコンテナを並べる形は2018年から変わっていません。

気をつけたいのは、`db` や `web` というサービス名が、ただのラベルではないことです。Compose は、サービス名をそのまま、コンテナどうしの通信で使うホスト名（接続先の名前）にします。2026年のファイルでは、`DATABASE_URL` の `@db:3306` の `db` がそれです。

つまり、サービス名を `db` から `mysql` に変えたら、`DATABASE_URL` の `@db` も `@mysql` に変える必要があります。片方だけ変えると、`web` から DB が見つからなくなります。

### 3-4. `volumes:` に2種類ある

2026年のファイルには、`volumes:` が2種類出てきます。

- `web` の `- .:/app`：**バインドマウント**（手元のフォルダをコンテナの中に見せる方法）です。手元でコードを書き換えると、コンテナの中にもすぐ反映されます。2018年にもありました。
- `db` の `- db-data:/var/lib/mysql`：**名前付きボリューム**（Docker が管理するデータの置き場所に、名前を付けたもの）です。MySQL のデータがここに入ります。

名前付きボリュームを使うときは、ファイルの一番下の `volumes:` に `db-data:` と書いて、「このボリュームを使います」と宣言します。書き忘れると、Compose が「宣言されていないボリュームです」とエラーにします。

2018年のファイルには、`db` の `volumes:` がありませんでした。それでも MySQL のイメージは、データを匿名ボリューム（名前のないボリューム）に書きます。この違いは 5-2 で確かめます。

### 3-5. `depends_on:` が「順番」から「準備完了」へ

2018年の `depends_on: - db` は、「`db` を先に起動してから `web` を起動する」という順番だけを決めていました。`db` のコンテナが起動しても、MySQL が接続を受け付けられる状態になるまでには時間がかかります。そのため、Rails が先に接続しにいって失敗することがありました。

2026年の形では、次のように書いています。

```yaml
    depends_on:
      db:
        condition: service_healthy
```

`condition: service_healthy` は、「`db` の健康チェックが通るまで `web` を起動しない」という意味です。順番ではなく、準備ができたかどうかで待つようになりました。

### 3-6. `healthcheck:` は db 側に書く

`service_healthy` で待つには、待たれる側の `db` に `healthcheck:`（健康チェック）を書く必要があります。`web` 側に書いても意味がありません。

```yaml
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "127.0.0.1", "-ppassword"]
      interval: 10s
      timeout: 5s
      retries: 20
```

- `test`：チェックに使うコマンドです。`mysqladmin ping` で、MySQL が応答するかを見ます。
- `interval`：何秒おきにチェックするか
- `timeout`：1回のチェックを何秒で打ち切るか
- `retries`：何回続けて失敗したら「不健康」とするか

`-h 127.0.0.1` と `-ppassword` にした理由と、`retries` を 5 から 20 に増やした経緯は第2章参照です。

### 3-7. `networks:` は書いていない

2026年のファイルには、`networks:` がありません。書かなくても、Compose はプロジェクトごとに `default` というネットワークを自動で作り、すべてのサービスをそこにつなぎます。`web` から `db` という名前で接続できるのは、このおかげです。

サービスが2つで、どちらも同じネットワークにいてよい今回の構成なら、`networks:` を書く理由はありません。書くと行が増え、読む人が「何か特別な分け方をしているのか」と考える手間が増えます。実際に `default` ネットワークができていることは、6-1 と 6-4 で確かめます。

### 3-8. キーの対比表

ここまでを表にまとめます。

| キー | 2018年 | 2026年 | 変わった理由 |
| --- | --- | --- | --- |
| ファイル名 | `docker-compose.yml` | `compose.yaml` | 今の Compose が優先して読む名前 |
| `version:` | `'3'` | なし | 使われなくなり、書くと警告 |
| `db` の `image:` | `mysql:5.7` | `mysql:8.4` | 第2章参照 |
| `db` の `volumes:` | なし（匿名ボリューム） | `db-data:/var/lib/mysql` | データの置き場所を名前で管理 |
| `healthcheck:` | なし | `db` 側にあり | 準備完了を判定するため |
| `web` の `build:` | `.` | `context` と `dockerfile` | 開発用の `Dockerfile.dev` を指定 |
| `environment:`（web） | なし | `DATABASE_URL` など | 接続先を1行で渡す |
| `depends_on:` | 順番だけ | `condition: service_healthy` | DB の準備を待つ |
| `networks:` | なし | なし | `default` で足りる |
| 一番下の `volumes:` | なし | `db-data:` | 名前付きボリュームの宣言 |

## 4. AI に compose だけを追加で聞いたときの落とし穴

第2章では、Dockerfile と compose を一緒に書かせました。実際の作業では、そのあと compose だけを追加で聞くことがよくあります。「ここを直して」「もっと良くして」と聞いたときに考えられる案（今回は実出力ログなし）と、その落とし穴を挙げます。

この節の2つの例（4-1、4-2）は、AI の出力をそのまま保存したログがありません。そのため、ここに書くのは実際の出力ではなく、考えられる案の要点です。【要確認】Grok Bot で同じ質問を聞き直して答えの形を比べることは、今回は確かめていません。

### 4-1. 例1：ネットワークを明示すべきか

「この compose.yaml で、ネットワークは明示したほうがいいですか」と聞いた場合に考えられる案（今回は実出力ログなし）は、`backend` などの名前でネットワークを作り、`db` と `web` の両方につなぐ案です。

```yaml
services:
  db:
    networks:
      - backend
  web:
    networks:
      - backend
networks:
  backend:
```

この形でも動きます。ただ、今回の構成では `default` と同じことを、行を増やして書いているだけです。ネットワークを分ける意味が出るのは、たとえば「外に見せるサービス」と「DB」を別のネットワークに分けたいときです。サービスが2つの開発環境なら、書かないほうが読みやすいと判断しました。【要確認】Grok Bot で聞き直したときに、この案が実際に返ってくるかは、今回は確かめていません。

### 4-2. 例2：DB を最初から作っておけるか

「起動したときに `app_development` のデータベースができているようにしたい」と聞いた場合に考えられる案（今回は実出力ログなし）は、`db` の `environment:` に `MYSQL_DATABASE` を足す案です。

```yaml
    environment:
      MYSQL_ROOT_PASSWORD: password
      MYSQL_DATABASE: app_development
```

`MYSQL_DATABASE` は、MySQL のイメージが最初に起動したときに、その名前のデータベースを作る設定です。6-3 で、実際に `app_development` ができることを確かめました。

注意点は2つあります。

- 作られるのは、ボリュームが空のときの最初の1回だけです。すでにデータが入った `db-data` があると、この設定を足しても何も起きません。
- `environment:` の中に同じキーを2回書くと、エラーになります。AI の案を手で貼り付けたときに起きやすい間違いです。作業用の Linux で `MYSQL_ROOT_PASSWORD` を2回書いて `docker compose config` を実行すると、次のエラーが出ました。

```text
yaml: unmarshal errors:
  line 6: mapping key "MYSQL_ROOT_PASSWORD" already defined at line 5
```

2018年の構成では、DB が空のまま起動していたので `rails db:create` が必要だった、という記憶があります。ただ、これは今回再現していません。【要確認】2018年の構成で DB が空で起動したことは、今回は確かめていません。

### 4-3. 名前付きボリュームを消してくる案

「compose.yaml をもっと短くして」と頼むと、`db` の `volumes:` と一番下の `volumes:` を消す案も考えられます（今回は実出力ログなし）。消しても起動はします。ただ、データは匿名ボリュームに入るようになり、どのボリュームが DB のデータなのか、名前から分からなくなります（5-2 参照）。

短くする案を受け取ったら、「消えた行が何をしていたか」を1行ずつ確かめてください。【要確認】短くするよう頼んだときに volumes を消す案が実際に返ってくるかは、今回は確かめていません。

### 4-4. ポートの番号をそのまま足す案

手元で別の MySQL が動いていて、3306番がぶつかるときに、「ホスト側を 13306 にして」と頼むと、`ports:` を `"13306:3306"` にしたうえで、`DATABASE_URL` まで `@db:13306` に書き換える案も考えられます（今回は実出力ログなし）。

これは間違いです。`ports:` の左側（13306）は、手元のパソコンから見た番号です。コンテナどうしは、右側の 3306 で直接話します。`web` から `db` へは、`ports:` を変えても `@db:3306` のままです。

同じように、サービス名を変えたのに `DATABASE_URL` に `@db` が残る案もありえます（3-3 参照）。【要確認】13306 を `DATABASE_URL` に書く案と、サービス名を変えたあとに `@db` が残る案が実際に返ってくるかは、今回は確かめていません。

## 5. DB・ボリューム・ネットワークでハマりやすい点

ここからは、作業用の Linux で実際に動かして確かめた内容です。

### 5-1. `down` ではデータは消えない

`docker compose down` は、コンテナとネットワークを消します。名前付きボリュームは消しません。

```console
$ docker compose down
$ docker volume ls
DRIVER    VOLUME NAME
local     ch3_db-data
```

もう一度 `docker compose up -d` すると、前に作ったデータベースやテーブルがそのまま残っていました。開発中は、この動きのおかげで、毎回データを作り直さずに済みます。

データまで消したいときは、`-v` を付けます。

```console
$ docker compose down -v
$ docker volume ls
DRIVER    VOLUME NAME
```

`ch3_db-data` が消えました。`-v` は元に戻せないので、付ける前に「本当に消してよいデータか」を確かめてください。

### 5-2. 匿名ボリュームは名前が読めないまま残る

`db` の `volumes:` を書かずに起動すると、MySQL のデータは匿名ボリュームに入ります。`docker volume ls` で見ると、次のような64文字の名前になります。

```console
$ docker volume ls
DRIVER    VOLUME NAME
local     3f1c9a…（64文字の英数字）
```

この名前からは、どのプロジェクトの、何のデータかが分かりません。しかも、`docker compose down`（`-v` なし）のあとも残りました。何度も作り直していると、読めない名前のボリュームが少しずつたまっていきます。2018年のファイルで起きていたのは、この状態です。名前付きボリュームにしておけば、`ch3_db-data` のように、プロジェクト名とボリューム名で見分けられます。

### 5-3. `ports:` のホスト側がぶつかる

手元で別の MySQL がすでに 3306 番を使っているときに、`db` に `ports: - "3306:3306"` を書いて起動すると、次のエラーで止まりました。

```text
Error response from daemon: ... Bind for 0.0.0.0:3306 failed: port is already allocated
```

「3306番はもう使われています」という意味です。直し方は、左側（ホスト側）の番号を変えることです。右側（コンテナ側）は変えません。そもそも、`web` から DB を使うだけなら、`db` に `ports:` は要りません。手元の DB ツールから接続したいときだけ書きます。2026年のファイルで `db` に `ports:` がないのは、このためです。

### 5-4. `localhost` はコンテナ自身を指す

`DATABASE_URL` に `@localhost:3306` と書くと、`web` は DB に接続できません。コンテナの中の `localhost` は、そのコンテナ自身を指すからです。`web` のコンテナの中に MySQL はいません。

コンテナどうしで接続するときは、サービス名（`db`）を使います。6-3 で、`web` の中から `db` の名前が引けることを確かめます。`healthcheck:` の `127.0.0.1` は `db` 自身の中で実行されるので、こちらは自分を指して正しい、という違いがあります。

### 5-5. プロジェクト名が変わると、別のボリュームになる

ボリューム名 `ch3_db-data` の `ch3` は、プロジェクト名です。何も指定しないと、compose ファイルを置いたフォルダの名前がプロジェクト名になります。

そのため、フォルダの名前を変えたり、別のフォルダにコピーして起動したりすると、プロジェクト名が変わり、新しい空のボリュームが作られます。「データが消えた」と思っても、実は前のボリュームが別の名前で残っている、ということがあります。プロジェクト名を固定したいときは、`docker compose -p ch3 up -d` のように `-p` で指定するか、compose ファイルの先頭に `name: ch3` と書きます。

### 5-6. 2018年→2026年の差のまとめ

| ハマりどころ | 2018年 | 2026年 |
| --- | --- | --- |
| DB の起動待ち | 順番だけ。接続に失敗することがある | `service_healthy` で準備を待つ |
| DB のデータ | 匿名ボリューム（名前が読めない） | 名前付きボリューム（`ch3_db-data`） |
| データを消す | `down -v` | `down -v`（変わらない） |
| コンテナ間の接続先 | サービス名 | サービス名（変わらない） |
| ネットワーク | `default` | `default`（変わらない） |

変わったのは「待ち方」と「データの置き方」です。ネットワークとサービス名の考え方は、2018年から同じでした。

## 6. 起動確認の手順と結果

作業用の Linux で、`ch3` というフォルダに compose ファイルを置いて確かめました。「2. 前提環境」で書いたとおり、`web` は `mysql:8.4` と `sleep infinity` で代用しています。確認に使った `web` の部分は次のとおりです。

```yaml
  web:
    image: mysql:8.4
    command: sleep infinity
    environment:
      DATABASE_URL: mysql2://root:password@db:3306/app_development
    depends_on:
      db:
        condition: service_healthy
```

`db` には、4-2 の `MYSQL_DATABASE: app_development` を足しています。

### 6-1. `docker compose config`：書いた内容を展開して読む

`docker compose config` は、compose ファイルを Compose が実際に読んだ形に展開して表示します。起動する前に、書き間違いがないかを確かめられます。

```console
$ docker compose config
```

確かめたことは3つです。

- `version: '3'` を残したファイルでは、3-2 の警告が出ました。
- `networks:` を書いていないのに、各サービスに `networks: default` が付いていました。
- `db-data` が `ch3_db-data` という名前に展開されていました（`name: ch3_db-data`）。

キーの重複（4-2）も、この段階でエラーとして見つかります。AI の案を貼り付けたら、まず `config` を通す習慣にしておくと安心です。

### 6-2. `docker compose up -d` と `docker compose ps`

```console
$ docker compose up -d
 ✔ Network ch3_default    Created
 ✔ Volume "ch3_db-data"   Created
 ✔ Container ch3-db-1     Healthy
 ✔ Container ch3-web-1    Started
```

途中経過では、`db` が Waiting から Healthy に変わってから、`web` が Started になりました。`service_healthy` で待っていることが分かります。かかった時間は 16.683秒でした（イメージは取得済みの状態です）。

```console
$ docker compose ps
NAME        IMAGE       COMMAND                  SERVICE   STATUS
ch3-db-1    mysql:8.4   "docker-entrypoint.s…"   db        Up (healthy)
ch3-web-1   mysql:8.4   "docker-entrypoint.s…"   web       Up
```

`db` の STATUS が `Up (healthy)` になっていれば、健康チェックが通っています。

### 6-3. `docker compose exec`：中に入って確かめる

`web` の中から、`db` という名前が引けるかを確かめます。

```console
$ docker compose exec web getent hosts db
172.18.0.2      db
```

`db` が `172.18.0.2` に解決されました。サービス名がそのままホスト名になっています。

次に、`MYSQL_DATABASE` でデータベースが作られたかを確かめます。

```console
$ docker compose exec db mysql -uroot -ppassword -e "SHOW DATABASES;"
```

結果の一覧に `app_development` がありました。

### 6-4. ネットワークとボリュームを見る

```console
$ docker network ls
$ docker volume ls
```

ネットワークには `ch3_default`、ボリュームには `ch3_db-data` がありました。`networks:` を書かなくても `default` ができていること、名前付きボリュームがプロジェクト名付きで作られていることが確かめられます。

### 6-5. 片付け

```console
$ docker compose down
$ docker volume ls
```

`down` のあとも `ch3_db-data` は残り、もう一度 `up -d` するとデータも残っていました（5-1）。最後に、データごと片付けます。

```console
$ docker compose down -v
```

ボリュームが消えたことを `docker volume ls` で確かめて終わりです。5-2 で作った匿名ボリュームが残っているときは、`docker volume ls` で名前を確かめてから `docker volume rm` で消します。

## 7. この章のまとめ

- `version:` は消す。書くと警告が出ます。
- サービス名はホスト名になる。名前を変えたら `DATABASE_URL` も変えます。
- DB のデータは名前付きボリュームに入れ、一番下の `volumes:` で宣言します。
- `depends_on:` は `condition: service_healthy` で準備を待ち、`healthcheck:` は `db` 側に書きます。
- `networks:` は、分ける理由がなければ書きません。
- `ports:` の左はホスト側、右はコンテナ側。コンテナどうしは右の番号で話します。
- `down` ではデータは消えません。消すのは `down -v` です。
- AI の案を貼ったら、まず `docker compose config` を通します。

### コマンド一覧

| コマンド | すること |
| --- | --- |
| `docker compose config` | 展開した設定を表示し、書き間違いを見つける |
| `docker compose up -d` | バックグラウンドで起動する |
| `docker compose ps` | 状態（healthy かどうか）を見る |
| `docker compose exec web getent hosts db` | `web` から `db` の名前が引けるか確かめる |
| `docker compose exec db mysql -uroot -ppassword -e "SHOW DATABASES;"` | データベースの一覧を見る |
| `docker network ls` / `docker volume ls` | ネットワークとボリュームを見る |
| `docker compose down` | コンテナとネットワークを消す（データは残る） |
| `docker compose down -v` | ボリュームも消す（元に戻せない） |

## 次の章へ

この章では、compose ファイルをキーごとに読み、DB・ボリューム・ネットワークの動きを手元で確かめました。手元で動く形ができたので、次の章（追加予定）では、この構成を Render にデプロイします。手元の compose がそのまま使える部分と、置き換えが必要な部分を見ていきます。
