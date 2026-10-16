---
title: "OpenAI SDK のコードを Grok API に移したら、変更は2か所・費用は計測できた分で約$0.16だった"
emoji: "🔁"
type: "tech"
topics: ["grok", "openai", "python", "llm", "api"]
published: false
---

## 結論（先に）

- OpenAI SDK のコードから変更が必要だった箇所：`api_key` と `base_url` の2か所だけ（4本とも、ほかの変更なしで動きました）
- 検証にかかった費用の合計：約 $0.164（API の usage に返ってきた金額の合計。stream.py の分は含みません）。うち約 $0.153 が検索ありの1回でした
- Web 検索ツールの有無による違い：検索なしは「確認できる情報はありません」と答え、検索ありは Web 検索を9回行い、主なプランと料金は公式発表と一致しました

## この記事でやること

Python の OpenAI SDK で書いたコードを、**API キーと `base_url` だけ変えて** SpaceXSI の Grok API で動かしてみました。この記事では次の4点を確かめた結果を記録します。

1. 最小コード（Responses API）がそのまま動くか
2. ストリーミングと Function calling も同じ書き方で動くか
3. Web 検索ツールを有効にしたときと、しないときで回答がどう変わるか
4. 実際にかかったトークン数と金額

検証環境：Linux 6.12（Python venv）／Python 3.13.5／openai 3.31.0／検証日 2026-10-16

## 準備

### API キーを発行する

[console.x.ai](https://console.x.ai/) でアカウントを作り、クレジットをチャージしてから、API Keys ページでキーを発行します。API の利用には事前のチャージが必要です。

### キーを .env に置く

```bash:.env
XAI_API_KEY=your_api_key
```

`.env` は Git にコミットしないよう、`.gitignore` に追加しておきます。

```bash
echo ".env" >> .gitignore
pip install openai python-dotenv
```

## 1. 最小コード：base_url を差し替えるだけ

OpenAI SDK のクライアントを作るときに、`base_url="https://api.x.ai/v1"` を渡すだけです。モデルは `grok-4.7` を指定します。

```python:hello.py
import os

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

client = OpenAI(
    api_key=os.environ["XAI_API_KEY"],
    base_url="https://api.x.ai/v1",
)

response = client.responses.create(
    model="grok-4.7",
    input="次の関数のバグを直して、原因を説明してください: function median(a){a.sort();return a[a.length/2]}",
)

print(response.output_text)
print("---")
print("input_tokens:", response.usage.input_tokens)
print("output_tokens:", response.usage.output_tokens)
```

実行結果：

````text
原因は主に3つあります。

1. `sort()` は比較関数なしだと文字列として並べるので、`[10, 2, 1]` が `[1, 10, 2]` になります。
2. `a.length / 2` は奇数長だと `2.5` のような非整数になり、`a[2.5]` は `undefined` です。偶数長でも中央2つの平均を取っていません。
3. `sort()` は元の配列を破壊します。

```javascript
function median(a) {
  if (a.length === 0) return undefined;
  const s = [...a].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
```
---
input_tokens: 1273
output_tokens: 817
````

コード上で書き換えたのは `api_key` と `base_url` の2か所です。実行してみて、ほかに変更が必要だった点：なし

## 2. ストリーミングと Function calling

### ストリーミング（Chat Completions）

既存のコードでは Chat Completions API を使っていることも多いので、こちらで確かめました。なお、公式ドキュメントでは Chat Completions は「Legacy」扱いになっています。新しく書くなら Responses API がおすすめです。`stream=True` を付けるだけです。推論モデルは応答が長くなることがあるため、公式ドキュメントにならってタイムアウトを長めにしています。

```python:stream.py
import os

import httpx
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

client = OpenAI(
    api_key=os.environ["XAI_API_KEY"],
    base_url="https://api.x.ai/v1",
    timeout=httpx.Timeout(3600.0),
)

stream = client.chat.completions.create(
    model="grok-4.7",
    messages=[
        {"role": "system", "content": "あなたは簡潔に答えるアシスタントです。"},
        {"role": "user", "content": "ニューラルネットワークが学習する仕組みを2文で説明してください。"},
    ],
    stream=True,
)

for chunk in stream:
    if chunk.choices and chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
print()
```

実行結果：

```text
ニューラルネットワークは、予測と正解の差（誤差）が小さくなるよう、各結合の重みを少しずつ調整して学習します。この調整は誤差逆伝播と勾配降下で行われ、データを繰り返し処理することでパターンを捉える精度が上がります。
```

文字が少しずつ表示されたか：出力をファイルに保存しながら実行したため、画面での表示の様子は見ていません。エラーなく最後まで受け取れました。なお、このコードでは `usage` が取れませんでした（後述）。

### Function calling（Responses API）

関数を定義しておくと、モデルが「この関数を呼んでほしい」と返してきます。手元で関数を実行し、その結果を `previous_response_id` を付けて返すと、続きの回答が得られます。

```python:function_call.py
import json
import os

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

client = OpenAI(
    api_key=os.environ["XAI_API_KEY"],
    base_url="https://api.x.ai/v1",
)

tools = [
    {
        "type": "function",
        "name": "get_temperature",
        "description": "指定した都市の現在の気温を返す",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {"type": "string", "description": "都市名"},
                "unit": {"type": "string", "enum": ["celsius", "fahrenheit"], "default": "celsius"},
            },
            "required": ["location"],
        },
    },
]


def get_temperature(location: str, unit: str = "celsius") -> dict:
    # ダミーの値を返す（実際には天気 API などを呼ぶ）
    temp = 15 if unit == "celsius" else 59
    return {"location": location, "temperature": temp, "unit": unit}


response = client.responses.create(
    model="grok-4.7",
    input=[{"role": "user", "content": "東京の気温を教えてください。"}],
    tools=tools,
)

calls = [item for item in response.output if item.type == "function_call"]
for call in calls:
    args = json.loads(call.arguments)
    print("function_call:", call.name, args)

if calls:
    outputs = [
        {
            "type": "function_call_output",
            "call_id": call.call_id,
            "output": json.dumps(get_temperature(**json.loads(call.arguments)), ensure_ascii=False),
        }
        for call in calls
    ]
    response = client.responses.create(
        model="grok-4.7",
        input=outputs,
        tools=tools,
        previous_response_id=response.id,
    )

print(response.output_text)
```

実行結果：

```text
function_call: get_temperature {'location': '東京'}
東京の現在の気温は**15°C**です。
```

## 3. Web 検索ツールあり／なしで比べる

Grok 4.7 の知識カットオフは2026年5月です。それより後の出来事を聞いたときに、検索ツールの有無で回答がどう変わるかを比べました。題材には、2026年10月12日（米国時間）に発表された「The X Subscription」（Grok・Cursor・X Premium をまとめた新プラン）を使いました（出典：[窓の杜](https://forest.watch.impress.co.jp/docs/news/2147453.html)、[公式発表](https://x.ai/news/x-subscription)）。検索ありの回答が正しいかどうかは、この2つの出典と照らし合わせて確かめられます。検索ツールは `tools=[{"type": "web_search"}]` を渡すだけで有効になり、検索はサーバー側で実行されます。

```python:search_compare.py
import os

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

client = OpenAI(
    api_key=os.environ["XAI_API_KEY"],
    base_url="https://api.x.ai/v1",
)

QUESTION = "2026年10月に発表された SpaceXSI の新しいサブスクリプションについて教えてください。"


def ask(use_search: bool) -> None:
    kwargs = {"tools": [{"type": "web_search"}]} if use_search else {}
    response = client.responses.create(
        model="grok-4.7",
        input=[{"role": "user", "content": QUESTION}],
        **kwargs,
    )
    print(f"===== web_search: {use_search} =====")
    print(response.output_text)
    print("input_tokens:", response.usage.input_tokens)
    print("output_tokens:", response.usage.output_tokens)
    if use_search:
        print_citations(response)
    print()


def print_citations(response) -> None:
    # 1) 回答本文中で引用された出典（output_text の annotations）
    print("--- inline citations (annotations) ---")
    found = False
    for item in getattr(response, "output", None) or []:
        if getattr(item, "type", None) != "message":
            continue
        for content in getattr(item, "content", None) or []:
            if getattr(content, "type", None) != "output_text":
                continue
            for ann in getattr(content, "annotations", None) or []:
                if getattr(ann, "type", None) == "url_citation":
                    print(f"[{getattr(ann, 'title', '?')}] {getattr(ann, 'url', '')}")
                    found = True
    if not found:
        print("(なし)")

    # 2) 検索中に参照したすべての出典（response.citations）
    #    OpenAI SDK の型にない独自フィールドなので、model_extra からも探す
    citations = getattr(response, "citations", None)
    if citations is None:
        extra = getattr(response, "model_extra", None) or {}
        citations = extra.get("citations")
    print("--- all citations ---")
    if citations:
        for url in citations:
            print(url)
    else:
        print("(なし)")


ask(use_search=False)
ask(use_search=True)
```

実行結果（検索なし）：

```text
2026年10月に発表された「SpaceXSI」の新しいサブスクリプションについて、確認できる情報はありません。

SpaceX（スターリンクなど）の公式サービスとは別に、「SpaceXSI」という名称の発表やサブスクリプションを裏づける公開情報は見当たりません。公式発表の出典（企業サイト、プレスリリース、日付）があれば、それに基づいて内容を整理できます。
input_tokens: 1264
output_tokens: 360
```

実行結果（検索あり）：

```text
2026年10月12日（現地時間）、SpaceXSI（SpaceX Super Intelligence。旧SpaceXAI／xAI）は、**「The X Subscription」**を発表しました。Grok、Grok Bot、Cursor、X Premiumを1つのサブスクリプションにまとめたものです。

公式発表では「思考・制作から開発・共有までを、1つのAIサブスクで支える」としています。新規契約は同日から開始され、既存のSuperGrok・Cursor・X Premium契約者には、請求設定から任意で移行できる選択肢が順次表示されます。

## プラン構成（米ドルの定価）

| プラン | 月額 | 年額 | 利用枠（Plus比） | 主な内容 |
| --- | --- | --- | --- | --- |
| Free | $0 | $0 | 限定 | Grokの日常利用、Cursorのお試し枠、標準のX |
| Plus | $8 | $80 | 基準 | 青バッジ、広告削減、クリエイターツール、Grok（チャット・音声・画像など）とCursor、Grok API |
| Premium | $30 | $300 | 4倍 | SuperGrok＋Cursor Pro＋X Premium+相当（従来は合計約$90）。Grok Bot、最新モデル、動画生成、広告ほぼなし |
| Super | $100 | $1,000 | 15倍 | Premiumの内容に加え、混雑時の優先アクセス |
| Ultra | $200 | $2,000 | 50倍 | さらに大きな利用枠。新製品・新モデルへの先行アクセス |

出典は公式発表と料金ドキュメントです。

ポイントは次のとおりです。

- **利用枠は週次で、GrokとCursorで共有**されます。Grokアプリ、XのGrokタブ、Cursorのどこで使っても同じ枠から消費されます。
- **Grok BotはPremium以上**に含まれます。Plusには含まれません。
- **Cursorの他社モデル**（ClaudeやGPTなど）は枠に含まれず、Premium以上でAPI定価の別課金（トップアップ）です。
- 自社モデルのコーディング利用枠は、同等の旧Cursorプランと比べ**少なくとも2倍**とされています。
- チーム向けはPremium／Super／Ultraを個人と同じシート単価で提供。SSOや管理機能、請求の一元化などが付きます。Plusのチームプランはありません。

## 日本のWeb版価格

日本の報道によると、Web版の価格はおおむね次のとおりです（年額は月額の10か月分相当）。

| プラン | 月額（Web） | 年額（Web） | 旧プランとの関係 |
| --- | --- | --- | --- |
| Plus | 1,280円 | 12,800円 | 旧プレミアム（980円）相当。円建てでは値上げ |
| Premium | 5,280円 | 52,800円 | 旧プレミアムプラス（6,080円）相当。円建てでは値下げ |
| Super | 17,800円 | 178,000円 | 新規 |
| Ultra | 34,800円 | 348,000円 | 新規 |

アプリ内課金はWebより高く、iPhoneではPlusが月1,580円などの例が報じられています。発表時点では、Plusの6か月25%オフや、Premium以上の初月50%オフといった期間限定割引も表示されていました。

米国では旧プレミアムも新Plusも月8ドルで同額です。日本のPlus値上げは、主に円建ての価格設定によるものと説明されています。

## 既存契約者の扱い

- **切り替えは任意**です。旧プランの料金・機能はそのまま継続できます。
- 切り替えると、対象の旧契約は解約され、未使用分は日割りで元の支払い方法へ返金されます。返金はチェックアウト額から差し引かれず、新プランは満額請求です。
- **切り替えは取り消せません**。旧プランは新規受付を終了しているため、一度やめると旧料金には戻れません。
- Xの特典は**個人アカウント**に限られ、組織管理のアカウントは対象外です。
- Apple App Store経由のCursorは、切り替えだけでは解約・返金されません。設定から自分で解約する必要があります。

詳細な最新価格と条件は、公式の料金ページ（[x.ai/pricing](https://x.ai/pricing)）とドキュメント（[docs.x.ai](https://docs.x.ai/x-subscription/pricing)）で確認するのが確実です。
input_tokens: 89315
output_tokens: 2388
```

検索ありのときは、出典も2種類表示するようにしています。公式ドキュメント（Citations）によると、Responses API ではインライン引用が初期設定で有効になっています。回答本文に `[[1]](URL)` の形でリンクが入り、同じ情報が `output_text` の `annotations`（`type: "url_citation"`、`url`、`title` など）にも入ります。これとは別に、`response.citations` には検索中に参照したすべての URL が入ります。ただし、このリストには回答で使われなかった URL も含まれます。`citations` は OpenAI SDK の型定義にない独自フィールドなので、`getattr` と `model_extra` で取り出し、値がない場合も落ちないようにしました。

表示された出典（2026-10-16、openai 3.31.0、grok-4.7、Responses API を OpenAI SDK 経由で呼んだ1回の結果）：`annotations` からは38件の URL が出ました。公式の docs.x.ai（x-subscription の pricing、overview、faq など）、x.ai/news/x-subscription、窓の杜、TechnoEdge、GIGAZINE、CNET Japan などに加えて、まとめサイトや X の投稿も含まれていました。一方、`response.citations` の欄は「(なし)」でした。OpenAI SDK 経由の Responses API の応答には、トップレベルの `citations` が入っていませんでした（`model_extra` にもありませんでした）。また、公式ドキュメントでは `title` は「1」「2」のような引用番号とされていますが、今回は URL がそのまま入っていて、本文にも `[[N]](URL)` の形のリンクは出ませんでした。SDK 側の仕様か API 側の挙動かは切り分けていません。

主な出典（抜粋）：

```text
https://x.ai/news/x-subscription
https://docs.x.ai/x-subscription/pricing
https://docs.x.ai/x-subscription/overview
https://forest.watch.impress.co.jp/docs/news/2147453.html
https://www.techno-edge.net/article/2026/10/13/5577.html
```

出典が窓の杜・公式発表の内容と合っていたか：発表日（10月12日）、5つのプランの月額・年額、利用枠の倍率（4・15・50倍）、Premium が従来の合計 $90 相当であること、Grok と Cursor で週ごとの枠を共有すること、他社モデルが別料金になることは、窓の杜と公式発表の内容と一致しました。円価格（Plus 1,280円、Premium 5,280円など）は TechnoEdge の報道と一致します。旧プランとの円での比較（旧プレミアム 980円、旧プレミアムプラス 6,080円）も TechnoEdge の報道と一致しました。

比べてわかったこと：検索なしでは「SpaceXSI という名称の発表を裏づける情報は見当たりません」と答え、知識カットオフ後の出来事は知らないことがわかりました。検索ありでは、Web 検索を9回行ったうえで、表つきの詳しい回答になりました。その代わり入力トークンは約70倍（1,264 → 89,315）に増え、費用も大きく増えました。

## 4. 実測コスト

Responses API の `usage` には、トークン数のほかに `cost_in_usd_ticks` というフィールドが返ってきました。公式単価で計算した金額と一致したので、1 tick ＝ 100億分の1ドルと読めます。表の金額はこの値から出しました（コンソールの Usage explorer の画面は見ていません）。また、出力トークンには推論トークン（`output_tokens_details.reasoning_tokens`）が含まれていて、出力の単価で課金されていました。たとえば hello.py は、出力817トークンのうち610トークンが推論でした。

| スクリプト | 入力トークン（うちキャッシュ） | 出力トークン（うち推論） | 金額 |
|---|---|---|---|
| hello.py | 1,273（1,152） | 817（610） | $0.00572 |
| stream.py | 取得できず | 取得できず | 取得できず |
| function_call.py | 1,364＋1,419（各1,152） | 28＋35（17＋21） | $0.00249 |
| search_compare.py（検索なし） | 1,264（1,152） | 360（272） | $0.00296 |
| search_compare.py（検索あり） | 89,315（56,448） | 2,388（1,143） | $0.15329（Web 検索9回 $0.045 を含む） |
| 合計（stream.py を除く） | | | $0.16445 |

stream.py は Chat Completions のストリーミングで、チャンクに `usage` が入っていなかったため、トークン数と金額を取れませんでした。2026-10-16、openai 3.31.0 で、このコードのまま受け取った各チャンクには `usage` が入っていませんでした。公式ドキュメントのレスポンス例では各チャンクに `usage` が含まれており、今回の結果とは異なります。

検索ありの1回の内訳：キャッシュなし入力 32,867トークン × $2.00 ＝ $0.0657、キャッシュ入力 56,448トークン × $0.50 ＝ $0.0282、出力 2,388トークン × $6.00 ＝ $0.0143（いずれも100万トークンあたり）、Web 検索 9回 × $0.005 ＝ $0.045。合計 $0.1533 で、`cost_in_usd_ticks` と一致しました。

参考として、公式の料金表（記事執筆時点）を載せておきます。grok-4.7 は100万トークンあたり、入力 $2.00、キャッシュ入力 $0.50、出力 $6.00 です。プロンプトが20万トークン以上になると、そのリクエストの**全トークン**が入力 $4.00／キャッシュ入力 $1.00／出力 $12.00 で計算されます（公式料金表、2026-10-15 確認）。Web 検索ツールには、トークン代とは別に1,000回あたり $5 がかかります。

検索ツールの料金：API の `usage` には `num_server_side_tools_used: 9` と `server_side_tool_usage_details.web_search_calls: 9` が返り、金額（`cost_in_usd_ticks`）に検索の料金も含まれていました。コンソールの画面での表示のされ方は確認していません。

## 5. ハマりどころ

- **`logprobs` は無視される**：grok-4.20 以降のモデルでは、`logprobs`／`top_logprobs` を指定してもエラーにならず、黙って無視されます。OpenAI 向けのコードでこれらを使っている場合は注意が必要です。
- **`-latest` エイリアス**：`-latest` の付いたモデル名は、自動で新しいバージョンに切り替わります。結果を安定させたい場合は、バージョン付きの名前を指定します。
- **画像入力の制限**：1枚 20MiB まで、形式は jpg/jpeg と png のみです。
- **20万トークンの境目**：プロンプトが20万トークン以上になると、そのリクエスト全体が長文脈の単価（入出力とも2倍）で計算されます。
- **今回の検証でわかった点**：ストリーミング（Chat Completions）では、このコードのままだと `usage` が返ってきませんでした。また、検索ありでは、2026-10-16、openai 3.31.0、grok-4.7 での1回の結果として、`response.citations` が取れず、出典は `annotations` からだけ取れました。

## 移行チェックリスト

- [ ] `api_key` を `XAI_API_KEY` に、`base_url` を `https://api.x.ai/v1` に変える
- [ ] モデル名を Grok のモデル（例：`grok-4.7`）に変える。結果を固定したいならバージョン付きの名前にする
- [ ] `logprobs`／`top_logprobs` に頼る処理がないか確認する（黙って無視される）
- [ ] 推論モデルのストリーミングでは、タイムアウトを長めにする
- [ ] プロンプトが20万トークン以上になると単価が2倍になる点を考えておく
- [ ] `web_search` を使う場合は、トークン代とは別に検索の料金がかかる
- [ ] 新しく書くコードは、Legacy 扱いの Chat Completions ではなく Responses API にする

## まとめ

- 今回の検証では、`api_key` と `base_url` の2か所を書き換えて、Responses API、Chat Completions のストリーミング、Function calling を試しました。それ以外に必要だった変更はありませんでした
- 最新の情報が必要な質問では、`web_search` ツールを有効にする必要があります。トークン代とは別に検索ツールの料金がかかります。
- 今回の検証にかかった費用は、API が返した金額で合計約 $0.164 でした（stream.py の分を除く）。そのうち9割以上は、Web 検索ありの1回です。

## 参考

- Quickstart: https://docs.x.ai/developers/quickstart
- Models and Pricing: https://docs.x.ai/developers/models
- Pricing（ツール料金）: https://docs.x.ai/developers/pricing
- Streaming: https://docs.x.ai/developers/model-capabilities/text/streaming
- Function Calling: https://docs.x.ai/developers/tools/function-calling
- Web Search: https://docs.x.ai/developers/tools/web-search
- Citations: https://docs.x.ai/developers/tools/citations

---

毎週の AI・開発ツールまとめは note で配信しています → https://note.com/fk2000/membership?utm_source=zenn&utm_medium=article&utm_campaign=grok-api-openai-sdk
