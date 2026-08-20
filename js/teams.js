// 30球団メタデータ（著作権配慮のためロゴ・商標は使用せず、色とテキストのみで表現）
// id は MLB Stats API の team.id と一致
export const LEAGUES = {
  103: 'ア・リーグ',
  104: 'ナ・リーグ',
};

// 地区IDは MLB Stats API の division.id と一致させること（/api/v1/divisions?sportId=1 で確認可能）
export const DIVISIONS = {
  200: 'ア・リーグ西地区',
  201: 'ア・リーグ東地区',
  202: 'ア・リーグ中地区',
  203: 'ナ・リーグ西地区',
  204: 'ナ・リーグ東地区',
  205: 'ナ・リーグ中地区',
};

// name は「地名・チーム名」表記に統一（例：シカゴ・ホワイトソックス、シカゴ・カブス）。
// アスレチックスのみ、本拠地移転に伴い正式名称に地名が含まれないためチーム名単独表記。
export const TEAMS = {
  110: { name: 'ボルチモア・オリオールズ', short: 'BAL', league: 103, division: 201, color: '#DF4601' },
  111: { name: 'ボストン・レッドソックス', short: 'BOS', league: 103, division: 201, color: '#BD3039' },
  147: { name: 'ニューヨーク・ヤンキース', short: 'NYY', league: 103, division: 201, color: '#0C2340' },
  139: { name: 'タンパベイ・レイズ', short: 'TB', league: 103, division: 201, color: '#092C5C' },
  141: { name: 'トロント・ブルージェイズ', short: 'TOR', league: 103, division: 201, color: '#134A8E' },

  145: { name: 'シカゴ・ホワイトソックス', short: 'CWS', league: 103, division: 202, color: '#27251F' },
  114: { name: 'クリーブランド・ガーディアンズ', short: 'CLE', league: 103, division: 202, color: '#E31937' },
  116: { name: 'デトロイト・タイガース', short: 'DET', league: 103, division: 202, color: '#0C2340' },
  118: { name: 'カンザスシティ・ロイヤルズ', short: 'KC', league: 103, division: 202, color: '#004687' },
  142: { name: 'ミネソタ・ツインズ', short: 'MIN', league: 103, division: 202, color: '#002B5C' },

  117: { name: 'ヒューストン・アストロズ', short: 'HOU', league: 103, division: 200, color: '#EB6E1F' },
  108: { name: 'ロサンゼルス・エンゼルス', short: 'LAA', league: 103, division: 200, color: '#BA0021' },
  133: { name: 'アスレチックス', short: 'ATH', league: 103, division: 200, color: '#003831' },
  136: { name: 'シアトル・マリナーズ', short: 'SEA', league: 103, division: 200, color: '#0C2C56' },
  140: { name: 'テキサス・レンジャーズ', short: 'TEX', league: 103, division: 200, color: '#C0111F' },

  144: { name: 'アトランタ・ブレーブス', short: 'ATL', league: 104, division: 204, color: '#CE1141' },
  146: { name: 'マイアミ・マーリンズ', short: 'MIA', league: 104, division: 204, color: '#00A3E0' },
  121: { name: 'ニューヨーク・メッツ', short: 'NYM', league: 104, division: 204, color: '#FF5910' },
  143: { name: 'フィラデルフィア・フィリーズ', short: 'PHI', league: 104, division: 204, color: '#E81828' },
  120: { name: 'ワシントン・ナショナルズ', short: 'WSH', league: 104, division: 204, color: '#AB0003' },

  112: { name: 'シカゴ・カブス', short: 'CHC', league: 104, division: 205, color: '#0E3386' },
  113: { name: 'シンシナティ・レッズ', short: 'CIN', league: 104, division: 205, color: '#C6011F' },
  158: { name: 'ミルウォーキー・ブリュワーズ', short: 'MIL', league: 104, division: 205, color: '#12284B' },
  134: { name: 'ピッツバーグ・パイレーツ', short: 'PIT', league: 104, division: 205, color: '#FDB827' },
  138: { name: 'セントルイス・カージナルス', short: 'STL', league: 104, division: 205, color: '#C41E3A' },

  109: { name: 'アリゾナ・ダイヤモンドバックス', short: 'AZ', league: 104, division: 203, color: '#A71930' },
  115: { name: 'コロラド・ロッキーズ', short: 'COL', league: 104, division: 203, color: '#333366' },
  119: { name: 'ロサンゼルス・ドジャース', short: 'LAD', league: 104, division: 203, color: '#005A9C' },
  135: { name: 'サンディエゴ・パドレス', short: 'SD', league: 104, division: 203, color: '#2F241D' },
  137: { name: 'サンフランシスコ・ジャイアンツ', short: 'SF', league: 104, division: 203, color: '#FD5A1E' },
};

export function teamName(id) {
  return TEAMS[id] ? TEAMS[id].name : '不明';
}

export function teamShort(id) {
  return TEAMS[id] ? TEAMS[id].short : '???';
}

export function teamColor(id) {
  return TEAMS[id] ? TEAMS[id].color : '#888888';
}

// 日本人選手が過去〜現在に多く所属してきた実績のある注目チーム（お気に入り初期候補などに利用可）
export const NPB_LINK_NOTE = true;
