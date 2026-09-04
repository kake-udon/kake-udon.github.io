// 画面遷移の実行関数を app.js から登録し、シートなど他モジュールから呼び出せるようにする。
// （app.js → standings.js → team-sheet.js の順に読み込まれるため、
//   team-sheet.js から app.js を直接importすると循環参照になる。それを避けるための薄い仲介役。）
let navigateFn = null;

export function setNavigator(fn) {
  navigateFn = fn;
}

export function goToRoute(route) {
  if (navigateFn) navigateFn(route);
}
