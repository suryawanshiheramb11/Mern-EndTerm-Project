import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

const SESSION_ENDPOINTS = /\/auth\/(login|register|refresh|logout)$/;

const readCookie = (name) =>
  document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${name}=`))
    ?.split('=')[1];

// Double-submit CSRF: echo the server's readable cookie back as a header when it is present.
api.interceptors.request.use((config) => {
  const csrf = readCookie('csrfToken');
  if (csrf) config.headers['X-CSRF-Token'] = csrf;
  return config;
});

// Share one in-flight refresh between concurrent 401s.
let refreshing = null;
const refreshSession = () => {
  refreshing ??= api.post('/auth/refresh').finally(() => {
    refreshing = null;
  });
  return refreshing;
};

const normalize = (error) => {
  const data = error.response?.data;
  const normalized = new Error(data?.message || error.message || 'Something went wrong');
  normalized.status = error.response?.status;
  normalized.errors = data?.errors ?? [];
  return normalized;
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config } = error;
    const expired = error.response?.status === 401 && config && !config._retried && !SESSION_ENDPOINTS.test(config.url ?? '');

    if (expired) {
      config._retried = true;
      try {
        await refreshSession();
        return api(config);
      } catch {
        // Refresh failed: surface the original 401 below.
      }
    }
    return Promise.reject(normalize(error));
  },
);

export default api;
