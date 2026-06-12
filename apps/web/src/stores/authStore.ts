import { getToken, setToken } from "../lib/api";

const USER_KEY = "applyradar.web.user";

export interface User {
  id: string;
  email: string;
  nickname?: string;
}

export function getUser(): User | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setUser(user: User | null) {
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(USER_KEY);
  }
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export function login(user: User, token: string) {
  setUser(user);
  setToken(token);
}

export function logout() {
  setUser(null);
  setToken(null);
}
