import { publicApiFetch } from "./api";

export interface GuestProfile {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string | null;
  nationality: string | null;
  nationalId: string | null;
  passportNumber: string | null;
  idPassport: string;
  gender: string | null;
  companyName: string | null;
  address: string | null;
  carRegistration: string | null;
  nextOfKin: string | null;
}

const TOKEN_KEY = "msh_guest_token";
const USER_KEY = "msh_guest";

export function getGuestToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredGuest(): GuestProfile | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as GuestProfile) : null;
}

export function setGuestSession(token: string, guest: GuestProfile) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(guest));
}

export function clearGuestSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function guestApiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getGuestToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const base = process.env.NEXT_PUBLIC_API_URL ?? "https://209.38.225.150/msh-erp";
  const res = await fetch(`${base}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export async function guestSignup(fullName: string, email: string, password: string) {
  const data = await publicApiFetch<{ token: string; guest: GuestProfile }>("/api/guest/signup", {
    method: "POST",
    body: JSON.stringify({ fullName, email, password }),
  });
  setGuestSession(data.token, data.guest);
  return data;
}

export async function guestLogin(email: string, password: string) {
  const data = await publicApiFetch<{ token: string; guest: GuestProfile }>("/api/guest/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setGuestSession(data.token, data.guest);
  return data;
}
