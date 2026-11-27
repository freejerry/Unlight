const N_HEX = '115b8b692e0e045692cf280b436735c77a5a9e8a9e7ed56c965f87db5b2a2ece3';
const N = BigInt(`0x${N_HEX}`);
const G = 2n;
const G_HEX = G.toString(16);
const GROUP_BITS = N.toString(2).length;
const GROUP_BYTES = Math.ceil(GROUP_BITS / 8);
const GROUP_WIDTH = GROUP_BYTES * 2;
const PADDED_N_HEX = N_HEX.padStart(GROUP_WIDTH, '0');
const LEADING_MASK = 0xff >>> (GROUP_BYTES * 8 - GROUP_BITS);
const DIGEST_LENGTH = 20;
const text = new TextEncoder();

function isHex(value, minLength, maxLength) {
  return typeof value === 'string' && value.length >= minLength
    && value.length <= maxLength && !/[^0-9a-f]/i.test(value);
}

function fromHex(hex) {
  const bytes = new Uint8Array(Math.ceil(hex.length / 2));
  // Ruby's hex2array treats an odd final nibble as a byte with a zero high nibble.
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function toHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function modPow(base, exponent) {
  let result = 1n;
  while (exponent > 0n) {
    if (exponent & 1n) result = (result * base) % N;
    base = (base * base) % N;
    exponent >>= 1n;
  }
  return result;
}

function privateExponent(crypto) {
  const bytes = new Uint8Array(GROUP_BYTES);
  let exponent;
  do {
    crypto.getRandomValues(bytes);
    bytes[0] &= LEADING_MASK;
    exponent = BigInt(`0x${toHex(bytes)}`);
  } while (exponent === 0n || exponent >= N - 1n);
  bytes.fill(0);
  return exponent;
}

async function sha1(crypto, bytes) {
  return new Uint8Array(await crypto.subtle.digest('SHA-1', bytes));
}

function sameProof(expected, certificate) {
  if (!isHex(certificate, DIGEST_LENGTH * 2, DIGEST_LENGTH * 2)) return false;
  const actual = fromHex(certificate);
  let difference = 0;
  for (let index = 0; index < DIGEST_LENGTH; index += 1) {
    difference |= expected[index] ^ actual[index];
  }
  return difference === 0;
}

export function createAuthExchange() {
  const crypto = globalThis.crypto;
  if (!crypto?.subtle || typeof crypto.getRandomValues !== 'function') {
    throw new Error('這個連線環境無法使用瀏覽器加密功能。');
  }
  let secret = privateExponent(crypto);
  const publicKey = modPow(G, secret).toString(16);

  return {
    publicKey,
    async answer(user, password, salt, serverPublicKey) {
      if (typeof user !== 'string' || typeof password !== 'string' || !user || !password) {
        throw new Error('請輸入帳號與密碼。');
      }
      if (!isHex(salt, 8, 64) || salt.length % 2 !== 0) {
        throw new Error('伺服器提供的鹽值格式錯誤。');
      }
      if (!isHex(serverPublicKey, 1, GROUP_WIDTH)) {
        throw new Error('伺服器提供的公開金鑰格式錯誤。');
      }
      const serverPublic = BigInt(`0x${serverPublicKey}`);
      if (serverPublic === 0n || serverPublic >= N) {
        throw new Error('伺服器提供的公開金鑰超出範圍。');
      }
      if (secret === null) throw new Error('請重新開始登入驗證。');
      const exponent = secret;
      secret = null;

      const [multiplierHash, scrambleHash, credentialsHash, userHash, groupHash, generatorHash] =
        await Promise.all([
          sha1(crypto, fromHex(PADDED_N_HEX + G_HEX.padStart(N_HEX.length, '0'))),
          sha1(crypto, fromHex(publicKey.padStart(GROUP_WIDTH, '0')
            + serverPublicKey.padStart(GROUP_WIDTH, '0'))),
          sha1(crypto, text.encode(`${user}:${password}`)),
          sha1(crypto, text.encode(user)),
          sha1(crypto, fromHex(PADDED_N_HEX)),
          sha1(crypto, fromHex(G_HEX)),
        ]);
      const multiplier = BigInt(`0x${toHex(multiplierHash)}`);
      const scramble = BigInt(`0x${toHex(scrambleHash)}`);
      const passwordHash = await sha1(crypto, fromHex(salt + toHex(credentialsHash)));
      const passwordNumber = BigInt(`0x${toHex(passwordHash)}`);
      const difference = serverPublic - multiplier * modPow(G, passwordNumber);
      const base = ((difference % N) + N) % N;
      if (base === 0n || scramble === 0n) throw new Error('伺服器登入驗證資料無效。');

      const shared = modPow(base, exponent + scramble * passwordNumber);
      const sessionKey = toHex(await sha1(crypto, fromHex(shared.toString(16))));
      const groupProof = groupHash.map((byte, index) => byte ^ generatorHash[index]);
      const proofInput = toHex(groupProof) + toHex(userHash) + salt + publicKey
        + serverPublicKey + sessionKey;
      const proof = toHex(await sha1(crypto, fromHex(proofInput)));
      const expected = await sha1(crypto, fromHex(publicKey + proof + sessionKey));

      return { proof, sessionKey, async verify(certificate) { return sameProof(expected, certificate); } };
    },
  };
}
