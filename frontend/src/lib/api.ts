import axios from 'axios';

let activeCompanyId: string | null = null;

export function setActiveCompany(companyId: string | null) {
  activeCompanyId = companyId;
}

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  // O plano free do Render hiberna a API: a primeira chamada pode levar ~50s.
  timeout: 75_000,
  headers: { 'Content-Type': 'application/json' },
});

const WAKE_MESSAGE =
  'O servidor está iniciando (hospedagem gratuita) e isso pode levar até 1 minuto. Tente novamente em instantes.';

api.interceptors.request.use((config) => {
  if (activeCompanyId) {
    config.headers['x-company-id'] = activeCompanyId;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const data = error?.response?.data;
    const status: number | undefined = error?.response?.status;
    // A API hibernada pode responder um desafio HTML do Cloudflare/Render
    // em vez de JSON — nesse caso avisamos que o servidor está acordando.
    const isHtml = typeof data === 'string' && data.trimStart().startsWith('<');
    const message =
      (!isHtml && data?.message) ||
      (isHtml ||
      status === 429 ||
      status === 502 ||
      status === 503 ||
      error?.code === 'ECONNABORTED' ||
      error?.code === 'ERR_NETWORK'
        ? WAKE_MESSAGE
        : 'Ocorreu um erro inesperado. Tente novamente.');
    return Promise.reject({ ...error, message });
  },
);

export function downloadUrl(path: string, params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();
  return `/api${path}${query ? `?${query}` : ''}`;
}

export async function downloadFile(path: string, params: Record<string, string | undefined>, fallbackName: string) {
  const response = await api.get(path, {
    params,
    responseType: 'blob',
  });
  const disposition = response.headers['content-disposition'] as string | undefined;
  const match = disposition?.match(/filename="?([^";]+)"?/);
  const filename = match?.[1] ?? fallbackName;
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
