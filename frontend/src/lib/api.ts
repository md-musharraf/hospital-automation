import { BACKEND_URL } from '../App';

const API_ROOT = `${BACKEND_URL}/api/v1`;

export class ApiError extends Error {
  status: number;
  body: any;
  isAuthError: boolean;

  constructor(message: string, status: number, body: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.isAuthError = status === 401 || status === 403;
  }
}

export interface RequestOptions {
  method?: string;
  token?: string | null;
  body?: any;
  signal?: AbortSignal;
}

async function request(
  path: string,
  { method = 'GET', token = null, body = null, signal = undefined }: RequestOptions = {}
): Promise<any> {
  let response: Response;
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
  } catch (err: any) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(
      'Cannot reach the server. Check your connection and that the backend is running.',
      0,
      null
    );
  }

  const text = await response.text();
  let payload: any = null;
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

export interface ApiClient {
  get: (path: string, options?: RequestOptions) => Promise<any>;
  post: (path: string, body?: any, options?: RequestOptions) => Promise<any>;
  put: (path: string, body?: any, options?: RequestOptions) => Promise<any>;
  patch: (path: string, body?: any, options?: RequestOptions) => Promise<any>;
  del: (path: string, options?: RequestOptions) => Promise<any>;
}

export function createApi(token: string | null = null): ApiClient {
  return {
    get: (path: string, options?: RequestOptions) => request(path, { ...options, method: 'GET', token }),
    post: (path: string, body?: any, options?: RequestOptions) =>
      request(path, { ...options, method: 'POST', token, body }),
    put: (path: string, body?: any, options?: RequestOptions) =>
      request(path, { ...options, method: 'PUT', token, body }),
    patch: (path: string, body?: any, options?: RequestOptions) =>
      request(path, { ...options, method: 'PATCH', token, body }),
    del: (path: string, options?: RequestOptions) => request(path, { ...options, method: 'DELETE', token })
  };
}

export const publicApi = createApi(null);

export default createApi;
