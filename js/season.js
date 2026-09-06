// シーズンの時期（レギュラーシーズン／ポストシーズン／オフシーズン）をJSTの日付から判定する。
// MLBの日程は年によって数日ずれるため、ここで持つのは「おおよその境目」であって正確な日付ではない。
// データが実際に取れるかどうかは各画面がAPIのレスポンスで判断し、この判定は
// 「文言をどう出すか」「時期外れのAPIを叩かないか」の目安としてだけ使うこと。
import { toJstDateString } from './api.js';

// ポストシーズンの日程を取りに行く時期（実際の開幕は9月末〜10月頭、終了は11月頭）。
// 前後に余裕を持たせてある。
const POSTSEASON_WINDOW_START_MMDD = '09-01';
const POSTSEASON_WINDOW_END_MMDD = '11-20';

// オフシーズン（ワールドシリーズ終了後〜翌シーズン開幕前）。
// 開幕日は年によって3月下旬のいつになるか変わるため、3月19日までをオフシーズン扱いにしている。
const OFFSEASON_START_MMDD = '11-21';
const OFFSEASON_END_MMDD = '03-19';
const OPENING_MONTH = 3;

// ポストシーズンの日程を取得しにいく時期かどうか。
// オフシーズンに毎回 /schedule/postseason を叩かないための目安で、
// 実際にトーナメント表を出すかどうかは取得した日程に試合があるかで最終判断する。
export function isPostseasonWindow(jstDateStr = toJstDateString()) {
  return jstDateStr.slice(5) >= POSTSEASON_WINDOW_START_MMDD
    && jstDateStr.slice(5) <= POSTSEASON_WINDOW_END_MMDD;
}

export function isOffseason(jstDateStr = toJstDateString()) {
  const md = jstDateStr.slice(5);
  return md >= OFFSEASON_START_MMDD || md <= OFFSEASON_END_MMDD;
}

// シーズンまとめの対象になる「直近の完了シーズン」。年明けから開幕前までは前年を指す。
// オフシーズンの表示で使う前提の関数で、シーズン中に呼ぶと当年（＝まだ完了していない年）を返す。
export function summarySeasonYear(jstDateStr = toJstDateString()) {
  const year = Number(jstDateStr.slice(0, 4));
  return jstDateStr.slice(5) <= OFFSEASON_END_MMDD ? year - 1 : year;
}

// 次のシーズンの開幕（年・月）。正確な開幕日はAPIから取れないため月までの目安を返す。
export function nextSeasonOpening(jstDateStr = toJstDateString()) {
  const year = Number(jstDateStr.slice(0, 4));
  return {
    year: jstDateStr.slice(5) <= OFFSEASON_END_MMDD ? year : year + 1,
    month: OPENING_MONTH,
  };
}

// オフシーズンに各画面で出す共通の文言
export function offseasonMessageJa(jstDateStr = toJstDateString()) {
  const { year, month } = nextSeasonOpening(jstDateStr);
  return `${summarySeasonYear(jstDateStr)}年シーズンは終了しました。${year}年シーズンは${month}月開幕予定です。`;
}
