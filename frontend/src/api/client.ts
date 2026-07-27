import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "/api",
  timeout: 15_000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("scm_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !error.config?.url?.includes("/seguridad/login")) {
      localStorage.removeItem("scm_token");
      localStorage.removeItem("scm_user");
      window.dispatchEvent(new Event("scm:logout"));
    }
    return Promise.reject(error);
  },
);

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message ?? error.message;
  }
  return error instanceof Error ? error.message : "Ocurrió un error inesperado";
}
