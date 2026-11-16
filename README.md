# 昇天 ― 雲ヲ抜ケ、仏ニ見ユ

浮世絵と地獄草紙の筆致で描く、完全プロシージャルなインタラクティブ・ホラーアート。
画像アセットも音声ファイルも一切使わず、すべて Canvas 2D と Web Audio でリアルタイムに生成する。

**遊ぶ →** https://shouten.vercel.app

## 操作

| 入力 | 意味 |
| --- | --- |
| 画面を長押し / `Space` を押し続ける | 昇天（押し続けるほど加速する） |
| 離す | 失速し、やがて堕ちる |
| `M` / 右下の「音」 | 音の有無 |

雲のワームホールを抜けると仏が現れ、審判の間を経て、変貌・墜落・暗転・回帰までが
ひと続きの演出として流れる（審判以降は操作不能）。

## 構成

State（演出の台本）・Render（描画）・Audio（音響）・UI の四層を、`app/Experience`
だけが知る形にしてある。各エンジンは `FrameState` と `TimelineEvent` という
契約だけを受け取り、互いを直接参照しない。

```
src/
  main.tsx            束縛のみの入口
  App.tsx             Canvas と言葉のオーバーレイを置く薄い殻
  app/Experience.ts   合成ルート（フレームループと配線）
  state/
    types.ts          Phase / FrameState / TimelineEvent（層をまたぐ契約）
    Timeline.ts       演出ステートマシンと物理（押下・失速・心拍・雷鳴）
  render/
    Renderer.ts       合成順の統括（場面 → 雷光 → ビネット → 血 → 反転 → 白飛び → 和紙）
    CloudTunnel.ts    渦巻く雲のワームホール
    Deity.ts          仏と鬼神（同一の造形をモーフさせる）
    DeityFeatures.ts  眼・口・ひび
    Halo.ts           光背
    Flames.ts         炎
    HellFall.ts       衝撃波・掴む腕・業火・火の粉・呑み込み
    Brush.ts          筆致（墨のかすれ・流線）
    PaperTexture.ts   和紙の質感
  audio/AudioEngine.ts オシレータ・ノイズ・フィルタのみのリアルタイム音響合成
  ui/
    Overlay.tsx       縦書き明朝の言葉だけ（ボタンも枠も持たない）
    InputController.ts 長押しの正規化
    kanji.ts          数を漢数字へ
  core/
    math.ts           決定論的なノイズ・乱数・補間
    palette.ts        岩絵具・墨のパレットと色演算
```

## 開発

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # 型検査（tsc --noEmit）＋ Vite ビルド → dist/
npm run preview   # ビルド結果を確認
```

## デプロイ

Vercel（静的配信）。`vercel.json` で framework を `vite`、出力先を `dist` に固定してある。

```bash
vercel --prod
```

## 注意

音は最初の長押しで解錠される（ブラウザの自動再生制限のため）。
`prefers-reduced-motion` では文字の明滅・震えを止める。
