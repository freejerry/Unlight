export class ProbeError extends Error {
  constructor(kind, message, response = new Uint8Array()) {
    super(message);
    this.kind = kind;
    this.response = response;
  }
}

export function toHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ');
}

function validateCommand(command) {
  if (!Number.isInteger(command) || command < 0 || command > 65535) {
    throw new ProbeError('protocol', '命令碼超出 16 位元範圍。');
  }
}

export function buildKeepAliveRequest(ping) {
  validateCommand(ping);
  const request = new Uint8Array(5);
  const view = new DataView(request.buffer);
  view.setUint16(0, 2, false);
  view.setUint16(2, ping, false);
  view.setUint8(4, 0x0a);
  return request;
}

export function buildKeepAliveResponse(pong) {
  validateCommand(pong);
  const response = new Uint8Array(7);
  const view = new DataView(response.buffer);
  view.setUint32(0, 2, false);
  view.setUint16(4, pong, false);
  view.setUint8(6, 0x0a);
  return response;
}

export function createResponseParser(pong) {
  const expected = buildKeepAliveResponse(pong);
  const received = new Uint8Array(expected.length);
  let length = 0;

  return {
    push(chunk) {
      if (!(chunk instanceof ArrayBuffer)) {
        throw new ProbeError('protocol', '收到文字訊息，預期為二進位封包。', received.slice(0, length));
      }

      const bytes = new Uint8Array(chunk);
      const end = length + bytes.length;
      received.set(bytes.subarray(0, received.length - length), length);
      if (end > received.length) {
        throw new ProbeError('protocol', '回覆封包超過 7 bytes。', received.slice());
      }

      for (let index = length; index < end; index += 1) {
        if (received[index] !== expected[index]) {
          throw new ProbeError('protocol', `第 ${index + 1} 個位元組與原版規格不符。`, received.slice(0, end));
        }
      }
      length = end;
      return length === expected.length ? received.slice() : null;
    },
    partial() {
      return received.slice(0, length);
    },
  };
}

function probeOnce(service, timeout) {
  const parser = createResponseParser(service.pong);
  const request = buildKeepAliveRequest(service.ping);
  const address = new URL(`/socket/${service.port}`, location.href);
  address.protocol = address.protocol === 'https:' ? 'wss:' : 'ws:';

  return new Promise((resolve, reject) => {
    let socket;
    let settled = false;

    function finish(error, response) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (socket) {
        socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
        if (socket.readyState < WebSocket.CLOSING) socket.close();
      }
      if (error) reject(error);
      else resolve(response);
    }

    const timer = setTimeout(() => {
      finish(new ProbeError('timeout', '等待 KeepAlive 回覆逾時。', parser.partial()));
    }, timeout);

    try {
      socket = new WebSocket(address);
      socket.binaryType = 'arraybuffer';
    } catch {
      finish(new ProbeError('network', '無法建立 WebSocket 連線。'));
      return;
    }
    socket.onopen = () => {
      try {
        socket.send(request);
      } catch {
        finish(new ProbeError('network', '無法送出 KeepAlive 封包。'));
      }
    };
    socket.onmessage = ({ data }) => {
      try {
        const response = parser.push(data);
        if (response) finish(null, response);
      } catch (error) {
        finish(error);
      }
    };
    socket.onerror = () => {
      finish(new ProbeError('network', 'WebSocket 連線失敗。', parser.partial()));
    };
    socket.onclose = () => {
      finish(new ProbeError('network', '連線在收到完整回覆前關閉。', parser.partial()));
    };
  });
}

export async function probeKeepAlive(service, onAttempt = () => {}) {
  const attempts = 2;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    onAttempt(attempt, attempts);
    try {
      return await probeOnce(service, 2500);
    } catch (error) {
      if (attempt === attempts || !(error instanceof ProbeError) || error.kind === 'protocol') throw error;
      await new Promise((resolve) => setTimeout(resolve, 180));
    }
  }
}
