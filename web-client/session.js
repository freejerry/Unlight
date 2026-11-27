import { createAuthExchange } from './srp.js';
import { applySessionKey, createFrameParser, encodeCommand, readReply } from './wire.js';
import {
  AVATAR_COMMAND, REGISTRATION_COMMAND, VERSION_COMMAND, readDataProfile, readVersions,
} from './data-bootstrap.js';

const AUTH_PORT = 12001;
const DATA_PORT = 12003;
const CHANNELS = [
  { port: 12002, pong: 35 },
  { port: DATA_PORT, pong: 3 },
  { port: 12020, pong: 3 },
];
const TIMEOUT = 8000;
const HEARTBEAT = 180_000;
const CLOSE_TIMEOUT = 1500;
const LOGIN_FIELD = /^[A-Za-z0-9_.-]{1,16}$/;

const messages = {
  credentials: '登入未通過，請確認帳號和密碼。',
  network: '無法連線至遊戲服務，請稍後再試。',
  protocol: '遊戲服務回傳的登入資料無法驗證。',
  timeout: '遊戲服務未及時回覆，請再試一次。',
  cancelled: '已取消連線。',
};

export class SessionError extends Error {
  constructor(kind) {
    super(messages[kind]);
    this.name = 'SessionError';
    this.kind = kind;
  }
}

function bounded(promise, signal, timeout = TIMEOUT) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => finish(reject, new SessionError('timeout')), timeout);
    const cancel = () => finish(reject, signal.reason);

    function finish(callback, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      callback(value);
    }

    promise.then((value) => finish(resolve, value), (error) => finish(reject, error));
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
  });
}

class SessionSocket {
  #socket;
  #key = null;
  #parser = createFrameParser();
  #waiting = null;
  #observer = null;
  #opened;
  #resolveOpen;
  #resolveClose;
  #reason = null;
  #fault = null;
  #expireCommand = null;
  #onStartupFailure;

  constructor(port, onStartupFailure) {
    this.#onStartupFailure = onStartupFailure;
    const address = new URL(`/socket/${port}`, location.href);
    address.protocol = address.protocol === 'https:' ? 'wss:' : 'ws:';
    try {
      this.#socket = new WebSocket(address);
    } catch {
      throw new SessionError('network');
    }
    this.#socket.binaryType = 'arraybuffer';
    this.#opened = new Promise((resolve) => { this.#resolveOpen = resolve; });
    this.closed = new Promise((resolve) => { this.#resolveClose = resolve; });
    this.#socket.onopen = () => this.#resolveOpen(true);
    this.#socket.onmessage = ({ data }) => this.#receive(data);
    this.#socket.onerror = () => this.#fail(new SessionError('network'));
    this.#socket.onclose = () => this.#finishClose();
  }

  async open(signal) {
    if (!await bounded(this.#opened, signal)) {
      throw this.#fault ?? new SessionError('network');
    }
  }

  assertOpen() {
    if (this.#socket.readyState !== WebSocket.OPEN || this.#reason) {
      throw this.#fault ?? new SessionError('network');
    }
  }

  finishStartup() {
    this.#onStartupFailure = null;
  }

  async ask(command, fields, replies, { signal, skip, allowOther, nextKey } = {}) {
    signal?.throwIfAborted();
    this.assertOpen();
    if (this.#waiting) throw new SessionError('protocol');

    const response = new Promise((resolve, reject) => {
      this.#waiting = { replies, skip, allowOther, resolve, reject };
    });
    try {
      const frame = encodeCommand(command, fields, this.#key);
      try {
        this.#socket.send(frame);
      } catch {
        throw new SessionError('network');
      }
      // The first Lobby request is plain. Ruby keys all following packets.
      if (nextKey) this.#key = nextKey;
      return await bounded(response, signal);
    } finally {
      this.#waiting = null;
    }
  }

  expireOn(command) {
    this.#expireCommand = command;
  }

  observe(commands, receive) {
    this.#observer = { commands, receive };
    return () => { this.#observer = null; };
  }

  async close(logout) {
    if (!this.#reason) {
      this.#reason = 'closed';
      if (logout !== undefined && this.#socket.readyState === WebSocket.OPEN) {
        try {
          this.#socket.send(encodeCommand(logout, [], this.#key));
        } catch {
          // Closing the connection also detaches the session on the server.
        }
      }
      this.#closeTransport();
    }
    try {
      await bounded(this.closed, undefined, CLOSE_TIMEOUT);
    } catch {
      this.#finishClose();
    }
  }

  #receive(data) {
    if (this.#reason) return;
    try {
      this.#parser.push(data, (body) => {
        if (this.#reason) return;
        applySessionKey(body, this.#key);
        const reply = readReply(body);
        const waiter = this.#waiting;
        if (waiter?.replies.includes(reply.command)) {
          this.#waiting = null;
          waiter.resolve(reply);
        } else if (this.#observer?.commands.includes(reply.command)) {
          this.#observer.receive(reply);
        } else if (reply.command === this.#expireCommand) {
          this.#fail(new SessionError('network'), 'expired');
        } else if (waiter && !waiter.allowOther && !waiter.skip?.includes(reply.command)) {
          throw new SessionError('protocol');
        }
      });
    } catch {
      this.#fail(new SessionError('protocol'));
    }
  }

  #fail(error, reason = 'network') {
    this.#reason ??= reason;
    this.#fault ??= error;
    this.#resolveOpen(false);
    this.#waiting?.reject(this.#fault);
    if (this.#reason !== 'closed') this.#onStartupFailure?.(this.#fault);
    this.#closeTransport();
  }

  #closeTransport() {
    if (this.#socket.readyState < WebSocket.CLOSING) this.#socket.close(1000);
  }

  #finishClose() {
    this.#socket.onopen = this.#socket.onmessage = this.#socket.onerror = this.#socket.onclose = null;
    this.#key?.fill(0);
    this.#key = null;
    this.#observer = null;
    this.#parser.reset();
    this.#resolveOpen(false);
    const error = this.#fault ?? new SessionError('network');
    this.#waiting?.reject(error);
    if (this.#reason !== 'closed') this.#onStartupFailure?.(error);
    this.#resolveClose(this.#reason ?? 'network');
  }
}

function authReply(reply, expected) {
  if (reply.command === expected) return reply;
  if (reply.command === 4) throw new SessionError('network');
  throw new SessionError('credentials');
}

function observeInitialData(socket, signal) {
  const decoding = new AbortController();
  let versions;
  let profileStarted = false;
  let unsubscribe;
  const received = new Promise((resolve, reject) => {
    unsubscribe = socket.observe([VERSION_COMMAND, AVATAR_COMMAND, REGISTRATION_COMMAND], (reply) => {
      try {
        if (reply.command === VERSION_COMMAND) {
          if (versions) throw new SessionError('protocol');
          versions = readVersions(reply);
        } else {
          if (!versions || profileStarted) throw new SessionError('protocol');
          profileStarted = true;
          readDataProfile(reply, decoding.signal).then(
            (profile) => resolve({ versions, ...profile }),
            reject,
          );
        }
      } catch (error) {
        reject(error);
      }
    });
    socket.closed.then(() => reject(new SessionError('network')));
  });
  return {
    received: bounded(received, signal),
    dispose() {
      unsubscribe();
      decoding.abort();
    },
  };
}

async function confirmChannel(channel, playerId, sessionKey, signal) {
  const { socket } = channel;
  await socket.open(signal);
  const key = Uint8Array.from(sessionKey.match(/../g), (pair) => Number.parseInt(pair, 16));
  const negotiation = await socket.ask(0, [playerId], [0, 2], { signal, nextKey: key });
  if (negotiation.command !== 0) throw new SessionError('protocol');
  const sign = negotiation.string(4);
  if (!/^\d{1,4}$/.test(sign) || negotiation.string(10) !== 'are you ok') {
    throw new SessionError('protocol');
  }
  negotiation.done();

  // This service sends the bootstrap immediately after its certificate in the same TCP stream.
  const initial = channel.port === DATA_PORT ? observeInitialData(socket, signal) : null;
  try {
    const login = socket.ask(1, ['yes, ok.', sign], [1, 2], { signal }).then((certificate) => {
      if (certificate.command !== 1) throw new SessionError('protocol');
      channel.verified = true;
      certificate.discardString(4096);
      certificate.discardString(4096);
      certificate.done();
      socket.expireOn(2);
    });
    const [, initialData] = await Promise.all([login, initial?.received]);
    return initialData;
  } finally {
    initial?.dispose();
  }
}

async function closeSession(auth, channels) {
  await Promise.all(channels.map(({ socket, verified }) => socket.close(verified ? 2 : undefined)));
  // AuthServer handles logout in its disconnect callback.
  await auth?.close();
}

function activeSession(auth, channels, playerId, { questData, ...initialData }) {
  let closing;
  let resolveClosed;
  const closed = new Promise((resolve) => { resolveClosed = resolve; });

  function stop(reason) {
    if (!closing) {
      clearInterval(timer);
      initialData = null;
      questData = null;
      closing = (async () => {
        await closeSession(auth, channels);
        resolveClosed(reason);
      })();
    }
    return closing;
  }

  const timer = setInterval(async () => {
    try {
      const replies = await Promise.all([
        auth.ask(6, [], [7], { allowOther: true }),
        ...channels.map(({ socket, pong }) => socket.ask(3, [], [pong], { allowOther: true })),
      ]);
      for (const reply of replies) reply.done();
    } catch (error) {
      void stop(error.kind === 'timeout' ? 'expired' : 'network');
    }
  }, HEARTBEAT);

  Promise.race([auth.closed, ...channels.map(({ socket }) => socket.closed)])
    .then((reason) => stop(reason));
  return {
    playerId,
    lobbyVerified: true,
    dataVerified: true,
    chatVerified: true,
    get initialData() { return initialData; },
    async readQuestInventory({ signal } = {}) {
      if (signal?.aborted) throw new SessionError('cancelled');
      if (!initialData) throw new SessionError('network');
      if (!initialData.avatar) return null;
      if (!questData) throw new SessionError('protocol');
      return { ...questData, rows: questData.rows.map((row) => ({ ...row })) };
    },
    closed,
    close: () => stop('closed'),
  };
}

export async function startSession(username, password, { signal } = {}) {
  if (signal?.aborted) throw new SessionError('cancelled');
  if (typeof username !== 'string' || typeof password !== 'string'
    || !LOGIN_FIELD.test(username) || !LOGIN_FIELD.test(password)) {
    throw new SessionError('credentials');
  }

  let auth;
  const channels = [];
  const startup = new AbortController();
  const startupSignal = startup.signal;
  const rejectStartup = (error) => startup.abort(error);
  const cancelStartup = () => rejectStartup(new SessionError('cancelled'));
  signal?.addEventListener('abort', cancelStartup, { once: true });

  function finishStartup() {
    signal?.removeEventListener('abort', cancelStartup);
    auth?.finishStartup();
    for (const { socket } of channels) socket.finishStartup();
  }

  try {
    const exchange = createAuthExchange();
    auth = new SessionSocket(AUTH_PORT, rejectStartup);
    await auth.open(startupSignal);

    const challenge = authReply(await auth.ask(1, [username, exchange.publicKey], [1, 3, 4, 8, 9], {
      signal: startupSignal, skip: [7],
    }), 1);
    const salt = challenge.string(64);
    const serverPublicKey = challenge.string(66);
    challenge.done();
    const { proof, sessionKey, verify } = await bounded(
      exchange.answer(username, password, salt, serverPublicKey), startupSignal,
    );
    password = '';

    const certificate = authReply(await auth.ask(2, [proof], [2, 3, 4, 8, 9], {
      signal: startupSignal, skip: [7],
    }), 2);
    const cert = certificate.string(40);
    const playerId = certificate.uint();
    certificate.done();
    if (!playerId || !/^[0-9a-f]{40}$/.test(sessionKey)
      || !await bounded(Promise.resolve(verify(cert)), startupSignal)) {
      throw new SessionError('protocol');
    }
    auth.expireOn(8);

    let initialData;
    for (const { port, pong } of CHANNELS) {
      startupSignal.throwIfAborted();
      const channel = { socket: new SessionSocket(port, rejectStartup), port, pong, verified: false };
      channels.push(channel);
      const data = await confirmChannel(channel, playerId, sessionKey, startupSignal);
      if (data) initialData = data;
    }
    startupSignal.throwIfAborted();
    auth.assertOpen();
    for (const { socket } of channels) socket.assertOpen();
    finishStartup();
    return activeSession(auth, channels, playerId, initialData);
  } catch (error) {
    finishStartup();
    await closeSession(auth, channels);
    throw error instanceof SessionError ? error : new SessionError('protocol');
  }
}
