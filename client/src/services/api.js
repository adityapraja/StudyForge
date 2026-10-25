const API_BASE = import.meta.env.VITE_API_URL || '';

export const request = async (path, options = {}) => {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    credentials: 'include',
  });

  if (res.status === 204) return null;

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      (typeof data?.error === 'string' ? data.error : data?.error?.message) ||
      data?.message ||
      `Request failed (${res.status})`;
    const error = new Error(message);
    error.status = res.status;
    error.code = data?.error?.code || data?.code;
    error.details = data?.error?.fields || data?.details;
    throw error;
  }

  return data;
};

export default request;
