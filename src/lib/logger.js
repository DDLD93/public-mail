function debugEnabled(scope) {
  const flag = process.env.WEBHOOK_DEBUG;
  if (flag === '1' || flag === 'true') return true;
  const debug = process.env.DEBUG || '';
  if (debug === '*' || debug.split(',').includes(scope) || debug.includes(`${scope}*`)) {
    return true;
  }
  return process.env.NODE_ENV !== 'production';
}

function write(level, tag, reqId, message, meta) {
  const prefix = reqId ? `${tag} [${reqId}] ${message}` : `${tag} ${message}`;
  if (meta instanceof Error) {
    console[level](prefix, { err: meta.message, stack: meta.stack });
    return;
  }
  if (meta !== undefined) console[level](prefix, meta);
  else console[level](prefix);
}

export function createLogger(scope) {
  const tag = `[public-mail:${scope}]`;
  const debugOn = debugEnabled(scope);

  return {
    isDebugEnabled: () => debugOn,
    debug(reqId, message, meta) {
      if (!debugOn) return;
      write('log', tag, reqId, message, meta);
    },
    info(reqId, message, meta) {
      write('log', tag, reqId, message, meta);
    },
    warn(reqId, message, meta) {
      write('warn', tag, reqId, message, meta);
    },
    error(reqId, message, meta) {
      write('error', tag, reqId, message, meta);
    },
  };
}
