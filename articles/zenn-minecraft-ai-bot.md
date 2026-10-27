---
title: "【個人開発】Jev×Gemini×Mineflayerで月数円で動くマイクラAI Botの設計パターン【GitHub公開】"
emoji: "🤖"
type: "tech"
topics: ["minecraft", "typescript", "gemini", "ai", "cloudflareworkers"]
published: true
---

## はじめに

「マイクラの世界で、自然文の指示を理解して動く Bot を作りたい。でも、AI の API や Bot の常時稼働に大きなお金はかけたくない」――そんなときの設計パターンを紹介します。

この記事では、Jev を指示や会話の流れをまとめるアプリケーション層として置き、Gemini に行動を考えさせ、Mineflayer で Minecraft Java Edition のサーバーに接続します。Cloudflare Workers は外部からの受付や AI 呼び出しの窓口に使い、ゲーム接続を維持する Bot 本体とは役割を分けます。

> この記事は設計例です。対象リポジトリには Bot の実装や Jev の API 定義が含まれていないため、特定の Jev SDK/API がそのまま動作するとは主張しません。Jev の実際のインターフェースに合わせて、後述の `buildPrompt` などを置き換えてください。

## 先に押さえたいこと

「月数円」は、既存のマシンを Bot の実行場所に使い、各サービスの無料枠内に収められた場合の**目標**です。Mineflayer は Minecraft サーバーへの接続を保つ Node.js プロセスなので、Cloudflare Workers の中で Bot を常時稼働させることはできません。Bot を動かすマシンを新たに契約する場合、その料金だけで月数円を超えることがあります。

Gemini や Cloudflare の無料枠・料金、利用可能なモデルは変更されます。無料枠超過時の料金を含め、公開前に各サービスの最新条件を確認してください。この記事の構成は「必ず月数円」を保証するものではありません。

## アーキテクチャ

```text
┌──────────────────────┐
│ 操作者 / Web UI      │
└──────────┬───────────┘
           │ HTTPS（認証つき指示）
           ▼
┌──────────────────────┐
│ Cloudflare Worker    │
│ ・入力検証、レート制限│
│ ・Jev の指示を整形    │
│ ・Gemini API 呼び出し │
│ ・許可済み行動だけ返す│
└──────────┬───────────┘
           │ HTTPS（短い指示を取得）
           ▼
┌──────────────────────┐
│ Mineflayer Bot       │
│ Node.js 常駐プロセス  │
│ ・行動を再検証        │
│ ・実行、結果を報告    │
└──────────┬───────────┘
           │ Minecraft プロトコル（TCP）
           ▼
┌──────────────────────┐
│ Minecraft Java Server│
└──────────────────────┘
```

Worker と Bot の間を HTTPS にすることで、Bot 側から外向きに接続できればよくなります。Minecraft サーバーへの接続は Bot が担当します。Worker にゲーム接続を持たせようとしたり、AI の応答をそのままゲーム内コマンドとして実行したりしないことがポイントです。

## コンポーネントごとの責務

### Jev：指示と会話の文脈をまとめる

Jev の層では、ユーザーの自然文、Bot の役割、現在の状況、実行可能な行動を一つの入力にまとめます。ゲーム内のチャットをそのままプロンプトに連結するのではなく、長さや制御文字を制限し、信頼できない発言を命令として扱わない設計にします。

### Gemini：行動候補を構造化して返す

Gemini には自由形式の文章ではなく、事前に決めた行動のいずれかを選ばせます。応答は必ずスキーマ検証し、想定外の値や曖昧な応答は実行せずに終了します。

### Mineflayer：ゲーム内の操作を担当する

Mineflayer はゲームサーバーへの接続、状態の取得、許可済み行動の実行を担当します。AI の応答を Minecraft コマンドとして直接流し込まず、アプリケーション側の行動関数に対応づけます。

### Cloudflare Workers：軽量な API の窓口になる

Worker は認証、入力検証、AI 呼び出し、結果の返却など、短時間で完了する HTTP 処理に向いています。Mineflayer のような TCP 接続を長時間維持する処理は Worker に置かず、Bot を動かす Node.js 環境に分離します。

## 行動を限定する

以下は、自然文をアプリケーション内の許可済み行動に変換する TypeScript の例です。Jev 固有の SDK を示すものではなく、Jev のプロンプト生成・Gemini 呼び出し部分に接続する境界の例です。

```ts
type BotAction =
  | { type: "say"; text: string }
  | { type: "follow"; target: string }
  | { type: "stop" };

const allowedActions = new Set(["say", "follow", "stop"]);

function parseAction(value: unknown): BotAction | null {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return null;
  }

  const action = value as Record<string, unknown>;

  if (typeof action.type !== "string" || !allowedActions.has(action.type)) {
    return null;
  }

  if (action.type === "say" && typeof action.text === "string") {
    return { type: "say", text: action.text.slice(0, 160) };
  }

  if (action.type === "follow" && typeof action.target === "string") {
    return { type: "follow", target: action.target.slice(0, 32) };
  }

  if (action.type === "stop") {
    return { type: "stop" };
  }

  return null;
}
```

この例は最小の型検証です。実際の API では JSON Schema などを使い、文字列の長さ・文字種、プレイヤー名の存在、行動ごとの引数も検証してください。型アサーションを使わず、外部入力は `unknown` のまま境界で絞り込むのが基本です。

## Gemini の呼び出し例

API キーはコードや GitHub に含めず、Worker の Secret として登録します。以下は「モデルが返した JSON を、さらにアプリ側で検証する」という流れを示す概念例です。モデル名や SDK の呼び出し形式は、利用する Gemini API の現行仕様に合わせてください。

```ts
interface Env {
  GEMINI_API_KEY: string;
}

async function requestDecision(
  env: Env,
  prompt: string,
): Promise<BotAction | null> {
  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini API returned ${response.status}`);
  }

  const result: unknown = await response.json();
  const text = extractModelText(result);

  if (text === null) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  return parseAction(parsed);
}
```

`extractModelText` は Gemini のレスポンス型に合わせて実装してください。JSON モードを指定しても、ネットワークエラー、上限到達、空応答、壊れた JSON は起こり得ます。失敗時は行動を実行しない fail-closed な動きにします。

## Mineflayer 側で行動を実行する

Worker から受け取った値も信頼せず、Bot 側で再度検証してから Mineflayer の API に渡します。次は行動を関数に対応づける例です。

```ts
import mineflayer from "mineflayer";

const bot = mineflayer.createBot({
  host: process.env.MINECRAFT_HOST!,
  port: Number(process.env.MINECRAFT_PORT ?? 25565),
  username: process.env.MINECRAFT_USERNAME!,
});

function executeAction(action: BotAction): void {
  switch (action.type) {
    case "say":
      bot.chat(action.text);
      return;
    case "follow": {
      const target = bot.players[action.target]?.entity;
      if (target) {
        // 実際の追従には pathfinder 等の追加設定が必要。
        bot.chat(`${action.target} さんの近くに向かいます。`);
      }
      return;
    }
    case "stop":
      bot.clearControlStates();
      return;
  }
}
```

追従や採掘などの操作を追加するときも、行動を一つずつ追加し、対象・距離・時間の上限や中断条件を設けます。サーバー運営者の許可を得た環境でのみ Bot を接続し、サーバーのルールや他のプレイヤーの体験を尊重してください。

## Bot と Worker 間の通信

常時接続を前提とした仕組みにする前に、最小構成では Bot から Worker へ定期的に指示を取りに行く方法が扱いやすいです。

```ts
async function pollCommand(workerUrl: string, botToken: string) {
  const response = await fetch(`${workerUrl}/api/commands/next`, {
    headers: { Authorization: `Bearer ${botToken}` },
  });

  if (response.status === 204) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Command API returned ${response.status}`);
  }

  const data: unknown = await response.json();
  return parseAction(data);
}
```

トークンは環境変数などの Secret 管理手段に保存し、Bot ごとに発行・失効できるようにします。ポーリング間隔を短くしすぎず、連続失敗時は待ち時間を伸ばすバックオフを実装します。Worker 側では認証、リクエストサイズの制限、レート制限、重複実行防止を行います。タスクを複数保持する段階になったら、利用規模と料金を確認したうえでキューなどに置き換えます。

## 運用コストを小さく保つ工夫

- Gemini へは、行動を選ぶ必要があるときだけ問い合わせる。
- 会話履歴や周辺状況を必要最小限にし、毎回大量のログを送らない。
- 1 人あたりの頻度上限、クールダウン、1 回の行動時間を設ける。
- 「say」「follow」「stop」など少数の行動から始め、危険な任意コマンドを許可しない。
- Worker の利用量、Gemini の利用量、Bot 実行環境の料金をそれぞれ監視する。
- 無料枠を超えたときに意図せず課金が続かないよう、上限・通知・停止手順を用意する。

実際の月額は Bot を動かすマシン、稼働時間、AI の利用量、各サービスの料金体系で変わります。手元のマシンを使う場合も、電気代やネットワーク費用は別途考慮してください。

## ローカルで試す

まずは Worker や公開サーバーを使わず、手元で Bot と Minecraft サーバーを接続して動作確認します。Zenn 記事のプレビューはリポジトリのルートで実行できます。

```bash
# Zenn CLI の依存関係をインストール
npm install

# 記事をプレビュー（http://localhost:8000）
npm run zenn:preview
```

Bot を動かす場合は、Minecraft サーバーの接続情報や API キーを `.env` などで管理し、`.env` を Git に追加しないでください。公開する前に、意図しない行動をしないか、AI API が失敗した場合に停止するか、Bot を安全に切断できるかを確認します。

## 🚀 公開リポジトリ

コードはすべて GitHub にてオープンソースで公開しています。

👉 **[GitHub: fk2000/minecraft-ai-bot](https://github.com/fk2000/minecraft-ai-bot)**

---

## 📦 使い方（デプロイ手順）

### 1. リポジトリのクローン

```bash
git clone https://github.com/fk2000/minecraft-ai-bot.git
cd minecraft-ai-bot
npm ci
cp .env.example .env
```

### 2. 環境変数の設定

`.env` を編集し、Minecraft サーバーの接続先と Bot アカウント、Jev API キーを設定します。実際の API キーや認証情報は Git にコミットしないでください。Gemini による会話機能を使う場合は `GEMINI_API_KEY` も設定します。

### 3. コンテナのビルドと起動

```bash
npm run build:container
npm run start:container
```

Discord 連携などの任意機能を含む詳しい設定は、[公開リポジトリの README](https://github.com/fk2000/minecraft-ai-bot#readme) を確認してください。Minecraft サーバー運営者の許可を得た環境で利用し、各サービスの利用規約とサーバーのルールに従ってください。

## まとめ

Jev で指示を組み立て、Gemini で許可済み行動を選び、Mineflayer でゲームに接続する――この分担にすると、AI の生成結果をそのまま実行する危険を減らし、各コンポーネントを独立してテストできます。Cloudflare Workers は HTTP の受付や短い処理に使い、Mineflayer の長時間接続は Node.js プロセスに任せるのが大切です。

月数円は利用条件や実行環境によっては達成できないため、無料枠と常時稼働コストを必ず個別に見積もってください。安全な小さな行動から始め、ログと上限を整えてから機能を広げましょう。

読んで役に立ったら、Zenn の Like やバッジなどのサポート機能で応援していただけるとうれしいです。

---

この Bot のように AI に手伝わせて作るとき、Docker まわりの設定も AI に書かせることが増えました。Zennで本[『AI × Docker』](https://zenn.dev/fk2000/books/ai-docker-2018-to-2026)を公開しました。AI が書いた Dockerfile や compose.yml を人が確かめて直す流れを、実際のコマンドと結果つきでまとめています（第1章は無料）。
