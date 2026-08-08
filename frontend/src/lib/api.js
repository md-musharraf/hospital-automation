import { BACKEND_URL } from '../App';

/**
 * The one way this app talks to the backend.
 *
 * Every portal was hand-writing the same six lines — build the URL, set
 * Content-Type, set the Authorization header, JSON.stringify the body, parse the
 * response, decide what counts as an error. Around forty copies, each subtly
 * different: some checked `res.ok`, some didn't; some surfaced the server's
 * message, some showed "[object Object]"; a few silently ignored a 401 and left
 * the user staring at an empty screen.
 *
 *   const api = createApi(labToken);
 *   const stats = await api.get('/lab/stats');
 *   await api.post(`/lab/tests/${id}/complete`, { testName, resultValue });
 *
 * Errors always arrive as an `ApiError` carrying the status and the server's own
 * message, so a caller can show something truthful without unwrapping anything.
 */

const API_ROOT = `${BACKEND_URL}/api/v1`;

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    /** 401/403 — the caller should send the user back to the login screen. */
    this.isAuthError = status === 401 || status === 403;
  }
}

async function request(path, { method = 'GET', token, body, signal } = {}) {
  let response;
  try {
    response = await fetch(API_ROOT + path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      signal
    });
  } catch (err) {
    // An aborted request is a normal part of navigating away — not a failure
    // the user should ever see.
    if (err.name === 'AbortError') throw err;
    throw new ApiError(
      'Cannot reach the server. Check your connection and that the backend is running.',
      0,
      null
    );
  }

  // 204 and empty bodies are legitimate.
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (!response.ok) {
    const message = (payload && payload.message) || `Request failed (${response.status})`;
    throw new ApiError(message, response.status, payload);
  }
  return payload;
}

/** Bind an auth token once; every call below carries it. */
export function createApi(token) {
  return {
    get: (path, options) => request(path, { ...options, method: 'GET', token }),
    post: (path, body, options) => request(path, { ...options, method: 'POST', token, body }),
    put: (path, body, options) => request(path, { ...options, method: 'PUT', token, body }),
    patch: (path, body, options) => request(path, { ...options, method: 'PATCH', token, body }),
    del: (path, options) => request(path, { ...options, method: 'DELETE', token })
  };
}

/** For the unauthenticated endpoints (patient tracker, public queues, chatbot). */
export const publicApi = createApi(null);

export default createApi;
