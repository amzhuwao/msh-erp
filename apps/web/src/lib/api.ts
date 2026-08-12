const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "https://209.38.225.150/msh-erp";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  roleName: string;
  permissions: Record<string, string[]>;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("msh_token");
}

export function setToken(token: string) {
  localStorage.setItem("msh_token", token);
}

export function clearToken() {
  localStorage.removeItem("msh_token");
  localStorage.removeItem("msh_user");
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("msh_user");
  return raw ? (JSON.parse(raw) as AuthUser) : null;
}

export function setStoredUser(user: AuthUser) {
  localStorage.setItem("msh_user", JSON.stringify(user));
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.message ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export async function login(username: string, password: string) {
  const data = await apiFetch<{ token: string; user: AuthUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  setToken(data.token);
  setStoredUser(data.user);
  return data;
}
