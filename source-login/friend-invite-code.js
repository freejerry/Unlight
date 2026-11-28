// Original Player.getInviteID and the invite tables in app/client/lib/Const.as.
const INVITE_IDX = 'TCAYWJPKNM3UBSZ57LIXQ8ERFD9V12';
const INVITE_SHF1 = [
  'SZJL98EHW5',
  'P2RIA8HX94',
  'K8MGJYUA7R',
  'FBPSJ18DZ9',
  'VPN2MQ8DEA',
  'XS6LRU7W4J',
  '3509476182',
  '3694SHENQD',
  'FXUA2JKT93',
  'EZPF1I7KSB',
];
const INVITE_SHF2 = [
  [8, 1, 2, 6, 5, 0, 7, 3, 4, 9],
  [5, 4, 6, 3, 7, 1, 0, 2, 9, 8],
  [8, 5, 1, 2, 6, 7, 0, 9, 3, 4],
];
const INVITE_REMAP = [
  [0, 5, 9, 1, 2, 6, 4, 8, 3, 7],
  [2, 6, 1, 9, 4, 3, 8, 7, 0, 5],
  [9, 3, 5, 6, 1, 4, 7, 2, 8, 0],
  [3, 4, 7, 8, 6, 5, 9, 1, 0, 2],
  [2, 5, 6, 9, 3, 1, 0, 7, 4, 8],
  [3, 7, 9, 6, 1, 4, 5, 2, 0, 8],
  [0, 3, 1, 6, 8, 2, 4, 5, 7, 9],
  [7, 8, 4, 9, 1, 6, 2, 0, 5, 3],
];

export function encodeFriendInviteCode(playerId) {
  if (!Number.isInteger(playerId) || playerId < 1 || playerId > 0xffffffff) return null;

  const lastDigit = playerId % 10;
  const remainder = playerId % 3;
  const prefix = INVITE_IDX[remainder * 10 + lastDigit];
  const digits = String(playerId).slice(-8).padStart(8, '0');
  const suffix = INVITE_REMAP.map((row, position) => {
    const remapped = row[Number(digits[position])];
    const shifted = INVITE_SHF2[remainder][remapped];
    return INVITE_SHF1[lastDigit][shifted];
  }).join('');
  return prefix + suffix;
}
