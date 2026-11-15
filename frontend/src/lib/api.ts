import axios from 'axios';

let activeCompanyId: string | null = null;

export function setActiveCompany(companyId: string | null) {
  activeCompanyId = companyId;
}

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (activeCompanyId) {
    config.headers['x-company-id'] = activeCompanyId;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error?.response?.data?.message ??
      (error?.code === 'ERR_NETWORK'
        ? 'Não foi possível conectar ao servidor. Verifique se a API está em execução.'
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
