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

export const TEAMS = {
  110: { name: 'オリオールズ', short: 'BAL', league: 103, division: 201, color: '#DF4601' },
  111: { name: 'レッドソックス', short: 'BOS', league: 103, division: 201, color: '#BD3039' },
  147: { name: 'ヤンキース', short: 'NYY', league: 103, division: 201, color: '#0C2340' },
  139: { name: 'レイズ', short: 'TB', league: 103, division: 201, color: '#092C5C' },
  141: { name: 'ブルージェイズ', short: 'TOR', league: 103, division: 201, color: '#134A8E' },

  145: { name: 'ホワイトソックス', short: 'CWS', league: 103, division: 202, color: '#27251F' },
  114: { name: 'ガーディアンズ', short: 'CLE', league: 103, division: 202, color: '#E31937' },
  116: { name: 'タイガース', short: 'DET', league: 103, division: 202, color: '#0C2340' },
  118: { name: 'ロイヤルズ', short: 'KC', league: 103, division: 202, color: '#004687' },
  142: { name: 'ツインズ', short: 'MIN', league: 103, division: 202, color: '#002B5C' },

  117: { name: 'アストロズ', short: 'HOU', league: 103, division: 200, color: '#EB6E1F' },
  108: { name: 'エンゼルス', short: 'LAA', league: 103, division: 200, color: '#BA0021' },
  133: { name: 'アスレチックス', short: 'ATH', league: 103, division: 200, color: '#003831' },
  136: { name: 'マリナーズ', short: 'SEA', league: 103, division: 200, color: '#0C2C56' },
  140: { name: 'レンジャーズ', short: 'TEX', league: 103, division: 200, color: '#C0111F' },

  144: { name: 'ブレーブス', short: 'ATL', league: 104, division: 204, color: '#CE1141' },
  146: { name: 'マーリンズ', short: 'MIA', league: 104, division: 204, color: '#00A3E0' },
  121: { name: 'メッツ', short: 'NYM', league: 104, division: 204, color: '#FF5910' },
  143: { name: 'フィリーズ', short: 'PHI', league: 104, division: 204, color: '#E81828' },
  120: { name: 'ナショナルズ', short: 'WSH', league: 104, division: 204, color: '#AB0003' },

  112: { name: 'カブス', short: 'CHC', league: 104, division: 205, color: '#0E3386' },
  113: { name: 'レッズ', short: 'CIN', league: 104, division: 205, color: '#C6011F' },
  158: { name: 'ブリュワーズ', short: 'MIL', league: 104, division: 205, color: '#12284B' },
  134: { name: 'パイレーツ', short: 'PIT', league: 104, division: 205, color: '#FDB827' },
  138: { name: 'カージナルス', short: 'STL', league: 104, division: 205, color: '#C41E3A' },

  109: { name: 'ダイヤモンドバックス', short: 'AZ', league: 104, division: 203, color: '#A71930' },
  115: { name: 'ロッキーズ', short: 'COL', league: 104, division: 203, color: '#333366' },
  119: { name: 'ドジャース', short: 'LAD', league: 104, division: 203, color: '#005A9C' },
  135: { name: 'パドレス', short: 'SD', league: 104, division: 203, color: '#2F241D' },
  137: { name: 'ジャイアンツ', short: 'SF', league: 104, division: 203, color: '#FD5A1E' },
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
