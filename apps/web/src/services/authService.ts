import { api } from "../lib/api";
import { login, type User } from "../stores/authStore";

interface LoginResponse {
  user: User;
  token: string;
}

export async function loginUser(email: string, password: string) {
  const data = await api.post<LoginResponse>("/api/auth/login", {
    email,
    password,
  });
  login(data.user, data.token);
  return data;
}

export async function registerUser(
  email: string,
  password: string,
  nickname?: string,
) {
  const data = await api.post<LoginResponse>("/api/auth/register", {
    email,
    password,
    nickname,
  });
  login(data.user, data.token);
  return data;
}
