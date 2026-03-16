# 家族の年間スケジュール

家族で年間の家事・メンテナンスタスクをガントチャート形式で管理するWebアプリ。

## 技術スタック

- **フロントエンド**: バニラHTML/CSS/JS（フレームワークなし）
- **バックエンド**: Firebase (Firestore + Authentication)
- **ホスティング**: GitHub Pages (https://locotas.github.io/family-schedule/)
- **リポジトリ**: https://github.com/locotas/family-schedule

## ファイル構成

```
family-schedule/
├── index.html      (597行) HTML構造・モーダル・ページビュー
├── style.css       (1027行) 全スタイル（ダークモード・レスポンシブ含む）
├── app.js          (2589行) 全ロジック
├── manifest.json   (17行)  PWAマニフェスト
├── sw.js           (45行)  Service Worker
└── CLAUDE.md       このファイル
```

## Firebase構成

- **プロジェクト名**: family-shedule（typoだが変更不可）
- **認証**: Google Sign-In（ポップアップ方式）
- **データベース**: Firestore
- **Config**: app.js先頭の`FIREBASE_CONFIG`に埋め込み済み

### Firestoreデータ構造

```
familyRooms/
  {6桁ルームコード}/
    name, createdAt, createdBy
    ├── tasks/{taskId}
    │     name, category, member, start, end, recurring, paused,
    │     memo, cost, shoppingItems, applianceId, comments[],
    │     modifiedBy, modifiedAt
    ├── members/{memberId}
    │     name, color, googleUid, photoURL
    ├── completions/{taskId-year}
    │     done, modifiedBy, modifiedAt
    ├── activityLog/{autoId}
    │     action, details, performedBy, timestamp
    ├── shopping/{itemId}
    │     name, checked, addedBy, linkedTaskId
    ├── appliances/{appId}
    │     name, category, location, purchaseDate, warrantyEnd, maintenanceCycle, memo
    ├── stock/{stockId}
    │     name, category, unit, currentStock, minStock, lastPurchaseDate
    ├── rewards/{rewardId}
    │     name, cost
    └── points/{entryId}
          memberId, memberName, points, taskName, timestamp
```

## app.js の構造（セクション順）

| 行範囲 | セクション | 内容 |
|--------|-----------|------|
| 1-11 | Firebase Config | 埋め込みConfig定数 |
| 12-37 | Constants | CATEGORIES, MONTHS, MEMBER_COLORS, CATEGORY_POINTS, APPLIANCE_CATEGORIES, STOCK_UNITS |
| 39-81 | State | グローバル状態変数（tasks, members, completions等）、Firebase状態、View/Router状態 |
| 83-253 | Data Layer (DL) | Firestore/localStorage書き込みの抽象化層。saveTask, deleteTask, toggleCompletion, addMember, removeMember, log等 |
| 255-325 | View Router | navigateTo(), renderCurrentView(), initRouter()。ハッシュベースルーティング（#schedule, #shopping等） |
| 327-340 | Sidebar Toggle | モバイルサイドバー開閉 |
| 342-371 | Load | loadLocal() - localStorageからデータ読み込み |
| 374-540 | Firebase/Auth | initFirebase(), googleSignIn(), googleSignOut(), onAuthStateChanged, updateUserBadgeWithGoogle() |
| 541-685 | Room Management | generateRoomCode(), createRoom(), joinRoom(), leaveRoom(), renderRoomInfo() |
| 735-845 | User Identity/Settings | setCurrentUser(), updateUserBadge(), saveWeatherSettings(), saveFirebaseConfig() |
| 839-860 | Helpers | daysInMonth, daysInYear, dayOfYear, escHtml, relativeTime, formatYen |
| 861-920 | Year Nav/Sort/Filters | changeYear(), setSort(), toggleDone(), getVisibleTasks() |
| 920-1100 | Render | render(), renderMonthsHeader(), renderBody(), updateTodayLine(), renderLegend(), renderFilters() |
| 1100-1200 | Mascot | renderMascot(), renderSidebarMascot() - スケちゃんの状態管理（5段階表情） |
| 1200-1400 | Task Modal | openTaskModal(), closeTaskModal(), saveTask(), deleteTask(), duplicateTask(), addTaskComment() |
| 1400-1520 | Member/Template Modal | addMember(), removeMember(), openTemplateModal(), addFromTemplate() |
| 1520-1620 | Wizard | openWizard(), wizardNext(), wizardBack(), buildWizardSuggestions() |
| 1620-1720 | Upcoming/Weather | renderUpcoming(), fetchWeather(), getWeatherIcon(), isOutdoorTask() |
| 1720-1780 | Cost Management | renderCostContent() - カテゴリ別コスト棒グラフ |
| 1780-1840 | Shopping List | renderShoppingList(), addShoppingItem(), toggleShoppingItem() |
| 1840-1950 | Annual Report | renderReportContent() - SVG円グラフ、カテゴリ別達成率、メンバーランキング |
| 1950-2065 | Appliance Management | renderApplianceList(), saveAppliance() - 家電登録、保証期限管理 |
| 2065-2170 | Points & Rewards | renderRewardsContent(), addReward(), redeemReward() - ポイント獲得・ごほうび交換 |
| 2170-2295 | Stock Management | renderStockList(), saveStockItem(), addLowStockToShopping() |
| 2295-2465 | View Render Functions | 各ページビューのレンダリング関数（renderUpcomingView, renderCostView等） |
| 2465-2475 | PWA | registerSW() |
| 2478-2590 | Init & Room UI | init(), showJoinRoomModal(), quickCreateRoom(), quickJoinRoom(), autoAddGoogleMember(), copyInviteLink() |

## index.html の構造

| 行範囲 | 要素 | 内容 |
|--------|-----|------|
| 15-26 | Login Screen | 全画面Googleログイン画面 |
| 28-80 | Sidebar | 左サイドバー（ナビ11項目、ミニマスコット、同期状態、ユーザーバッジ） |
| 85-410 | Main Wrapper | トップバー + 11のページビュー（schedule, upcoming, cost, shopping, report, appliance, rewards, stock, activity, members, settings） |
| 413-430 | Mobile Tab Bar | モバイル下部タブバー（5項目） |
| 437-481 | Task Modal | タスク追加/編集モーダル（コメントセクション含む） |
| 484-547 | Other Modals | テンプレート、ユーザー選択、ウィザード |
| 549-586 | Join Room Modal | ルーム参加/作成モーダル（Googleログイン→ルーム選択の2段階） |
| 590-595 | Scripts | Firebase SDK（app, auth, firestore）+ app.js |

## style.css の構造

| セクション | 内容 |
|-----------|------|
| Login Screen | ログイン画面のフルスクリーンレイアウト |
| :root variables | カラー、サイズ等のCSS変数 |
| Sidebar | 固定左サイドバー（220px）、ナビ項目、マスコットミニ |
| Topbar | 上部バー（ページタイトル、年ナビ、追加ボタン） |
| Mascot | スケちゃんのCSS描画（5段階状態：great/good/ok/sad/bad） |
| Gantt Chart | ガントチャートのグリッド、タスク行、バー、今日の線 |
| Month Zoom | 月ズーム表示（日単位グリッド） |
| Modals | モーダルオーバーレイ、フォーム、ボタン |
| Wizard | セットアップウィザードのオプション選択UI |
| View Pages | 各ページビューの共通レイアウト（view-header, view-body） |
| Mobile | 768px以下のレスポンシブ（サイドバー非表示、ボトムタブ、カード表示） |
| Dark Mode | body.dark時のCSS変数オーバーライド |

## 主要な機能一覧

1. **年間スケジュール（ガントチャート）** - 12ヶ月横軸のタスクバー表示
2. **次にやること** - 直近7/30日のタスク一覧（天気情報付き）
3. **コスト管理** - タスクごとの費用記録、カテゴリ別年間コスト
4. **買い物リスト** - 共有リスト、タスクの「必要なもの」から自動追加
5. **年間レポート** - 完了率、カテゴリ別達成、メンバーランキング
6. **家電管理** - 購入日・保証期限・メンテ周期管理
7. **ポイント&ごほうび** - タスク完了でポイント獲得（カテゴリ別5-20pt、早期完了1.5倍）
8. **ストック管理** - 消耗品の在庫トラッキング、低在庫→買い物リスト連動
9. **マスコット（スケちゃん）** - たまごっち風キャラ、タスク消化率で5段階変化
10. **Google認証** - ポップアップ方式、自動メンバー作成
11. **家族ルーム** - 6桁コードで共有、招待リンク対応
12. **リアルタイム同期** - Firestoreリスナーで全端末同期
13. **PWA** - ホーム画面追加可能
14. **ダークモード** - OS設定自動追従 + 手動切替
15. **テンプレート** - 季節タスク30種以上をワンタップ追加
16. **セットアップウィザード** - 初回質問→おすすめタスク自動提案

## 認証フロー

```
アプリ起動
  ↓ initFirebase(FIREBASE_CONFIG)
  ↓ onAuthStateChanged
  ├─ ユーザーあり → hideLoginScreen → ルーム接続 → アプリ表示
  └─ ユーザーなし → showLoginScreen
       ↓ 「Googleでログイン」タップ
       ↓ signInWithPopup (WebViewなら警告メッセージ)
       ↓ onAuthStateChanged再発火 → ユーザーあり
       ↓ ルーム未接続なら joinRoomModal表示
       ↓ ルーム参加 → autoAddGoogleMember → アプリ表示
```

## 注意事項

- Firebase Consoleの「Authentication → 承認済みドメイン」に `locotas.github.io` が必要
- Firestoreセキュリティルールはテストモード（30日期限あり、要変更）
- プロジェクト名が `family-shedule`（scheduleのtypo）だが、Firebase側で変更不可
- ポップアップ方式のGoogle認証はWebView（LINE等のアプリ内ブラウザ）では動かない
- iPhoneユーザーはSafariの「ポップアップブロック」をオフにする必要がある場合あり
