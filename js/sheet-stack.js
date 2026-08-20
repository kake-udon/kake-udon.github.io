// ボトムシート（試合詳細・チーム詳細・選手詳細）の簡易な戻り先スタック。
// あるシートの中から別のシートを開いた場合、閉じたときに元のシートへ戻れるようにする。
const backStack = [];

// これから別のシートを開く前に、現在表示中のシートを再度開くための関数を積んでおく
export function pushSheetBack(reopenCurrentSheet) {
  backStack.push(reopenCurrentSheet);
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
