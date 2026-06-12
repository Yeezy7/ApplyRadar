import { useState } from "react";
import { Mail, Lock, Eye, EyeOff, Radar } from "lucide-react";
import { loginUser, registerUser } from "../services/authService";
import { getApiBase, setApiBase } from "../lib/api";

interface AuthPageProps {
  onLogin: () => void;
}

export default function AuthPage({ onLogin }: AuthPageProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [apiBase, setApiBaseState] = useState(getApiBase());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // 注册时验证密码
    if (mode === "register") {
      if (password !== confirmPassword) {
        setError("两次输入的密码不一致");
        return;
      }
      if (password.length < 6) {
        setError("密码长度至少 6 位");
        return;
      }
    }

    setLoading(true);

    try {
      setApiBase(apiBase);
      if (mode === "login") {
        await loginUser(email, password);
      } else {
        await registerUser(email, password, nickname);
      }
      onLogin();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setLoading(false);
    }
  };

  // 密码强度检查
  const getPasswordStrength = (pwd: string) => {
    if (pwd.length === 0) return null;
    if (pwd.length < 6) return { level: "weak", text: "弱", color: "text-red-500" };
    if (pwd.length < 10) return { level: "medium", text: "中", color: "text-yellow-500" };
    return { level: "strong", text: "强", color: "text-green-500" };
  };

  const passwordStrength = getPasswordStrength(password);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="flex flex-col md:flex-row">
          {/* Hero Section */}
          <div className="md:w-1/2 bg-gradient-to-br from-blue-600 to-indigo-700 p-8 text-white flex flex-col justify-center">
            <div className="flex items-center gap-3 mb-6">
              <Radar className="w-10 h-10" />
              <h1 className="text-3xl font-bold">投递雷达</h1>
            </div>
            <p className="text-blue-100 mb-6">
              求职状态自动跟踪，AI 解析页面内容，只在需要时通知你。
            </p>
            <ul className="space-y-3 text-blue-100">
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-300 rounded-full" />
                自动监控招聘官网状态
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-300 rounded-full" />
                AI 智能解析状态变化
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-300 rounded-full" />
                状态变化实时通知
              </li>
            </ul>
          </div>

          {/* Form Section */}
          <div className="md:w-1/2 p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                {mode === "login" ? "登录" : "注册"}
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                {mode === "login"
                  ? "欢迎回来，请登录你的账号"
                  : "创建新账号开始使用"}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "register" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    昵称
                  </label>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                    placeholder="选填"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  邮箱
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                    placeholder="your@email.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  密码
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full pl-10 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                    placeholder="至少 6 位"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {mode === "register" && passwordStrength && (
                  <p className={`text-xs mt-1 ${passwordStrength.color}`}>
                    密码强度: {passwordStrength.text}
                  </p>
                )}
              </div>

              {mode === "register" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    确认密码
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white ${
                        confirmPassword && password !== confirmPassword
                          ? "border-red-500"
                          : "border-gray-300 dark:border-gray-600"
                      }`}
                      placeholder="再次输入密码"
                    />
                  </div>
                  {confirmPassword && password !== confirmPassword && (
                    <p className="text-xs text-red-500 mt-1">密码不一致</p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  API 地址
                </label>
                <input
                  type="url"
                  value={apiBase}
                  onChange={(e) => setApiBaseState(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white text-sm"
                  placeholder="http://127.0.0.1:3000"
                />
              </div>

              {error && (
                <div className="text-red-500 text-sm bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors"
              >
                {loading ? "处理中..." : mode === "login" ? "登录" : "注册"}
              </button>
            </form>

            <div className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
              {mode === "login" ? (
                <>
                  还没有账号？{" "}
                  <button
                    onClick={() => setMode("register")}
                    className="text-blue-600 hover:underline"
                  >
                    立即注册
                  </button>
                </>
              ) : (
                <>
                  已有账号？{" "}
                  <button
                    onClick={() => setMode("login")}
                    className="text-blue-600 hover:underline"
                  >
                    立即登录
                  </button>
                </>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
