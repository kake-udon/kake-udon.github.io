// ボトムシート（試合詳細・チーム詳細・選手詳細）の簡易な戻り先スタック。
// あるシートの中から別のシートを開いた場合、閉じたときに元のシートへ戻れるようにする。
const backStack = [];

// これから別のシートを開く前に、現在表示中のシートを再度開くための関数を積んでおく
export function pushSheetBack(reopenCurrentSheet) {
  backStack.push(reopenCurrentSheet);
}

// 戻り先が積まれているか（「元に戻る」ボタンの表記を切り替えるために使う）
export function hasSheetBack() {
  return backStack.length > 0;
}

// 戻り先をすべて破棄する。シートから別の画面へ移動するときに使う。
export function clearSheetStack() {
  backStack.length = 0;
}

// シートを閉じる。戻り先があれば元のシートを再表示し、なければ完全に閉じる。
export function closeSheet(root) {
  const back = backStack.pop();
  if (back) {
    back();
  } else {
    root.innerHTML = '';
  }
}
