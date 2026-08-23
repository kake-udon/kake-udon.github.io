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
// founded: 球団創設年 / pennants: リーグ優勝（ペナント）回数 / worldSeries: ワールドシリーズ優勝回数
// homepage: 球団公式サイト（MLB.com内の球団ページ）。いずれも2025シーズン終了時点。
export const TEAMS = {
  110: { name: 'ボルチモア・オリオールズ', short: 'BAL', league: 103, division: 201, color: '#DF4601', founded: 1901, pennants: 7, worldSeries: 3, homepage: 'https://www.mlb.com/orioles' },
  111: { name: 'ボストン・レッドソックス', short: 'BOS', league: 103, division: 201, color: '#BD3039', founded: 1901, pennants: 14, worldSeries: 9, homepage: 'https://www.mlb.com/redsox' },
  147: { name: 'ニューヨーク・ヤンキース', short: 'NYY', league: 103, division: 201, color: '#0C2340', founded: 1901, pennants: 40, worldSeries: 27, homepage: 'https://www.mlb.com/yankees' },
  139: { name: 'タンパベイ・レイズ', short: 'TB', league: 103, division: 201, color: '#092C5C', founded: 1998, pennants: 2, worldSeries: 0, homepage: 'https://www.mlb.com/rays' },
  141: { name: 'トロント・ブルージェイズ', short: 'TOR', league: 103, division: 201, color: '#134A8E', founded: 1977, pennants: 3, worldSeries: 2, homepage: 'https://www.mlb.com/bluejays' },

  145: { name: 'シカゴ・ホワイトソックス', short: 'CWS', league: 103, division: 202, color: '#27251F', founded: 1901, pennants: 6, worldSeries: 3, homepage: 'https://www.mlb.com/whitesox' },
  114: { name: 'クリーブランド・ガーディアンズ', short: 'CLE', league: 103, division: 202, color: '#E31937', founded: 1901, pennants: 6, worldSeries: 2, homepage: 'https://www.mlb.com/guardians' },
  116: { name: 'デトロイト・タイガース', short: 'DET', league: 103, division: 202, color: '#0C2340', founded: 1901, pennants: 11, worldSeries: 4, homepage: 'https://www.mlb.com/tigers' },
  118: { name: 'カンザスシティ・ロイヤルズ', short: 'KC', league: 103, division: 202, color: '#004687', founded: 1969, pennants: 4, worldSeries: 2, homepage: 'https://www.mlb.com/royals' },
  142: { name: 'ミネソタ・ツインズ', short: 'MIN', league: 103, division: 202, color: '#002B5C', founded: 1901, pennants: 6, worldSeries: 3, homepage: 'https://www.mlb.com/twins' },

  117: { name: 'ヒューストン・アストロズ', short: 'HOU', league: 103, division: 200, color: '#EB6E1F', founded: 1962, pennants: 5, worldSeries: 2, homepage: 'https://www.mlb.com/astros' },
  108: { name: 'ロサンゼルス・エンゼルス', short: 'LAA', league: 103, division: 200, color: '#BA0021', founded: 1961, pennants: 1, worldSeries: 1, homepage: 'https://www.mlb.com/angels' },
  133: { name: 'アスレチックス', short: 'ATH', league: 103, division: 200, color: '#003831', founded: 1901, pennants: 15, worldSeries: 9, homepage: 'https://www.mlb.com/athletics' },
  136: { name: 'シアトル・マリナーズ', short: 'SEA', league: 103, division: 200, color: '#0C2C56', founded: 1977, pennants: 0, worldSeries: 0, homepage: 'https://www.mlb.com/mariners' },
  140: { name: 'テキサス・レンジャーズ', short: 'TEX', league: 103, division: 200, color: '#C0111F', founded: 1961, pennants: 3, worldSeries: 1, homepage: 'https://www.mlb.com/rangers' },

  144: { name: 'アトランタ・ブレーブス', short: 'ATL', league: 104, division: 204, color: '#CE1141', founded: 1871, pennants: 18, worldSeries: 4, homepage: 'https://www.mlb.com/braves' },
  146: { name: 'マイアミ・マーリンズ', short: 'MIA', league: 104, division: 204, color: '#00A3E0', founded: 1993, pennants: 2, worldSeries: 2, homepage: 'https://www.mlb.com/marlins' },
  121: { name: 'ニューヨーク・メッツ', short: 'NYM', league: 104, division: 204, color: '#FF5910', founded: 1962, pennants: 5, worldSeries: 2, homepage: 'https://www.mlb.com/mets' },
  143: { name: 'フィラデルフィア・フィリーズ', short: 'PHI', league: 104, division: 204, color: '#E81828', founded: 1883, pennants: 8, worldSeries: 2, homepage: 'https://www.mlb.com/phillies' },
  120: { name: 'ワシントン・ナショナルズ', short: 'WSH', league: 104, division: 204, color: '#AB0003', founded: 1969, pennants: 1, worldSeries: 1, homepage: 'https://www.mlb.com/nationals' },

  112: { name: 'シカゴ・カブス', short: 'CHC', league: 104, division: 205, color: '#0E3386', founded: 1876, pennants: 17, worldSeries: 3, homepage: 'https://www.mlb.com/cubs' },
  113: { name: 'シンシナティ・レッズ', short: 'CIN', league: 104, division: 205, color: '#C6011F', founded: 1881, pennants: 9, worldSeries: 5, homepage: 'https://www.mlb.com/reds' },
  158: { name: 'ミルウォーキー・ブリュワーズ', short: 'MIL', league: 104, division: 205, color: '#12284B', founded: 1969, pennants: 1, worldSeries: 0, homepage: 'https://www.mlb.com/brewers' },
  134: { name: 'ピッツバーグ・パイレーツ', short: 'PIT', league: 104, division: 205, color: '#FDB827', founded: 1882, pennants: 9, worldSeries: 5, homepage: 'https://www.mlb.com/pirates' },
  138: { name: 'セントルイス・カージナルス', short: 'STL', league: 104, division: 205, color: '#C41E3A', founded: 1882, pennants: 19, worldSeries: 11, homepage: 'https://www.mlb.com/cardinals' },

  109: { name: 'アリゾナ・ダイヤモンドバックス', short: 'AZ', league: 104, division: 203, color: '#A71930', founded: 1998, pennants: 2, worldSeries: 1, homepage: 'https://www.mlb.com/dbacks' },
  115: { name: 'コロラド・ロッキーズ', short: 'COL', league: 104, division: 203, color: '#333366', founded: 1993, pennants: 1, worldSeries: 0, homepage: 'https://www.mlb.com/rockies' },
  119: { name: 'ロサンゼルス・ドジャース', short: 'LAD', league: 104, division: 203, color: '#005A9C', founded: 1883, pennants: 26, worldSeries: 9, homepage: 'https://www.mlb.com/dodgers' },
  135: { name: 'サンディエゴ・パドレス', short: 'SD', league: 104, division: 203, color: '#2F241D', founded: 1969, pennants: 2, worldSeries: 0, homepage: 'https://www.mlb.com/padres' },
  137: { name: 'サンフランシスコ・ジャイアンツ', short: 'SF', league: 104, division: 203, color: '#FD5A1E', founded: 1883, pennants: 23, worldSeries: 8, homepage: 'https://www.mlb.com/giants' },
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
