import { useState, useEffect } from "react";
import { Eye, EyeOff, RotateCcw, TestTube2, Check, AlertCircle, FolderOpen } from "lucide-react";
import { getSettings, saveSettings, loadSettings, DEFAULT_SETTINGS, type AppSettings } from "../stores/settings";
import { aiService, sidecarService, emailService } from "../services";
import { requestPermission, isPermissionGranted } from "@tauri-apps/plugin-notification";
import DataBackupSection from "../components/DataBackupSection";

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(getSettings);
  const [saved, setSaved] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testingEmail, setTestingEmail] = useState(false);
  const [emailTestResult, setEmailTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [sendingReport, setSendingReport] = useState(false);
  const [reportResult, setReportResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [appDataDir, setAppDataDir] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    loadSettings().then(setSettings).catch(() => {});
    sidecarService.getAppDataDir().then(setAppDataDir).catch(() => {});
  }, []);

  const handleChange = (updates: Partial<AppSettings>) => {
    setSettings((s) => ({ ...s, ...updates }));
    setDirty(true);
    setTestResult(null);
    setSettingsMessage(null);
  };

  const handleSave = async () => {
    try {
      await saveSettings(settings);
      setSaved(true);
      setDirty(false);
      setSettingsMessage({ ok: true, msg: "设置已保存" });
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error("Failed to save settings:", e);
      setSettingsMessage({ ok: false, msg: `保存设置失败: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  const handleReset = () => {
    if (!confirm("确定要恢复默认设置吗？")) return;
    setSettings({ ...DEFAULT_SETTINGS });
    setDirty(true);
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // Save first so the backend can read the latest settings
      await saveSettings(settings);
      setDirty(false);
      const msg = await aiService.testConnection();
      setTestResult({ ok: true, msg });
    } catch (e) {
      setTestResult({ ok: false, msg: String(e) });
    } finally {
      setTesting(false);
    }
  };

  const handleTestEmail = async () => {
    setTestingEmail(true);
    setEmailTestResult(null);
    try {
      await saveSettings(settings);
      setDirty(false);
      const msg = await emailService.testEmailConfig();
      setEmailTestResult({ ok: true, msg });
    } catch (e) {
      setEmailTestResult({ ok: false, msg: String(e) });
    } finally {
      setTestingEmail(false);
    }
  };

  const handleSendReport = async () => {
    setSendingReport(true);
    setReportResult(null);
    try {
      await saveSettings(settings);
      setDirty(false);
      const msg = await emailService.sendDailyReportWithCheck();
      setReportResult({ ok: true, msg });
    } catch (e) {
      setReportResult({ ok: false, msg: String(e) });
    } finally {
      setSendingReport(false);
    }
  };


  const handleNotificationToggle = async () => {
    if (!settings.notificationsEnabled) {
      // Turning on - request permission first
      const granted = await isPermissionGranted();
      if (!granted) {
        const result = await requestPermission();
        if (result !== "granted") {
          setSettingsMessage({ ok: false, msg: "通知权限被拒绝，请在系统设置中允许通知" });
          return;
        }
      }
    }
    handleChange({ notificationsEnabled: !settings.notificationsEnabled });
  };

  return (
    <div className="max-w-3xl px-4 pb-6 pt-2">
      {/* Header */}
      <div className="mb-4 flex items-center justify-end">
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          恢复默认
        </button>
      </div>

      {/* AI Configuration */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6 mb-5">
        <h2 className="text-base font-semibold text-gray-900 mb-5">AI 配置</h2>
        <div className="space-y-5">
          <div>
            <label htmlFor="apiKey" className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
              API Key
            </label>
            <div className="relative">
              <input
                id="apiKey"
                type={showApiKey ? "text" : "password"}
                value={settings.apiKey}
                onChange={(e) => handleChange({ apiKey: e.target.value })}
                placeholder="sk-..."
                className="w-full px-3.5 py-2.5 pr-10 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 focus:bg-white transition-all"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5">支持 OpenAI 兼容 API（OpenAI、Deepseek、本地 Ollama 等）</p>
          </div>

          <div>
            <label htmlFor="apiBaseUrl" className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
              API Base URL
            </label>
            <input
              id="apiBaseUrl"
              type="url"
              value={settings.apiBaseUrl}
              onChange={(e) => handleChange({ apiBaseUrl: e.target.value })}
              placeholder="https://api.openai.com/v1"
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 focus:bg-white transition-all"
            />
            <p className="text-[11px] text-gray-400 mt-1.5">不需要填写 /chat/completions，只需填写基础 URL</p>
          </div>

          <div>
            <label htmlFor="model" className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
              模型
            </label>
            <input
              id="model"
              type="text"
              value={settings.model}
              onChange={(e) => handleChange({ model: e.target.value })}
              placeholder="gpt-4o-mini"
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 focus:bg-white transition-all"
            />
          </div>

          {/* Test Connection */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleTestConnection}
              disabled={testing || !settings.apiKey}
              className="flex items-center gap-2 px-4 py-2 text-sm text-stone-700 bg-stone-50 hover:bg-stone-100 rounded-xl disabled:opacity-50 transition-colors"
            >
              <TestTube2 className="w-4 h-4" />
              {testing ? "测试中..." : "测试连接"}
            </button>
            {testResult && (
              <div className={`flex items-center gap-1.5 text-sm ${testResult.ok ? "text-green-600" : "text-red-500"}`}>
                {testResult.ok ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                {testResult.msg}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Automation */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6 mb-5">
        <h2 className="text-base font-semibold text-gray-900 mb-5">自动化</h2>
        <div className="space-y-5">
          <div>
            <label htmlFor="checkFrequency" className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
              默认检查频率
            </label>
            <select
              id="checkFrequency"
              value={settings.checkFrequency}
              onChange={(e) => handleChange({ checkFrequency: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 focus:bg-white transition-all appearance-none cursor-pointer"
            >
              <option value="manual">手动</option>
              <option value="daily">每天</option>
              <option value="every_12h">每12小时</option>
              <option value="every_6h">每6小时</option>
            </select>
            <p className="text-[11px] text-gray-400 mt-1.5">新建监控目标时的默认检查频率</p>
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <div className="text-sm font-medium text-gray-900">系统通知</div>
              <div className="text-xs text-gray-400 mt-0.5">
                状态变化、登录过期、检查完成/失败时发送通知
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.notificationsEnabled}
              onClick={handleNotificationToggle}
              className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-stone-500/20 ${
                settings.notificationsEnabled ? "bg-stone-900" : "bg-gray-300"
              }`}
            >
              <div
                className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  settings.notificationsEnabled ? "translate-x-[22px]" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <div className="text-sm font-medium text-gray-900">自动检查</div>
              <div className="text-xs text-gray-400 mt-0.5">
                后台定时自动检查状态页，按配置频率执行
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.autoCheckEnabled}
              onClick={() => handleChange({ autoCheckEnabled: !settings.autoCheckEnabled })}
              className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-stone-500/20 ${
                settings.autoCheckEnabled ? "bg-stone-900" : "bg-gray-300"
              }`}
            >
              <div
                className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  settings.autoCheckEnabled ? "translate-x-[22px]" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* Email Report */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6 mb-5">
        <h2 className="text-base font-semibold text-gray-900 mb-5">邮件日报</h2>
        <div className="space-y-5">
          <div className="flex items-center justify-between py-2">
            <div>
              <div className="text-sm font-medium text-gray-900">启用邮件日报</div>
              <div className="text-xs text-gray-400 mt-0.5">
                每天定时发送求职状态报告到邮箱
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.emailReportEnabled}
              onClick={() => handleChange({ emailReportEnabled: !settings.emailReportEnabled })}
              className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-stone-500/20 ${
                settings.emailReportEnabled ? "bg-stone-900" : "bg-gray-300"
              }`}
            >
              <div
                className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  settings.emailReportEnabled ? "translate-x-[22px]" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          {settings.emailReportEnabled && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">SMTP 服务器</label>
                  <input
                    type="text"
                    value={settings.smtpHost}
                    onChange={(e) => handleChange({ smtpHost: e.target.value })}
                    placeholder="smtp.qq.com"
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 focus:bg-white transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">端口</label>
                  <input
                    type="number"
                    min="1"
                    max="65535"
                    value={settings.smtpPort}
                    onChange={(e) => handleChange({ smtpPort: e.target.value })}
                    placeholder="465"
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 focus:bg-white transition-all"
                  />
                  <p className="text-[11px] text-gray-400 mt-1.5">465 (SSL) 或 587 (STARTTLS)</p>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">用户名</label>
                <input
                  type="text"
                  value={settings.smtpUsername}
                  onChange={(e) => handleChange({ smtpUsername: e.target.value })}
                  placeholder="your-email@qq.com"
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 focus:bg-white transition-all"
                />
                <p className="text-[11px] text-gray-400 mt-1.5">QQ邮箱填完整邮箱，163邮箱填用户名（不含@163.com）</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">密码/授权码</label>
                <div className="relative">
                  <input
                    type={showSmtpPassword ? "text" : "password"}
                    value={settings.smtpPassword}
                    onChange={(e) => handleChange({ smtpPassword: e.target.value })}
                    placeholder="SMTP 授权码"
                    className="w-full px-3.5 py-2.5 pr-10 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 focus:bg-white transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showSmtpPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 mt-1.5">QQ邮箱在「设置→账户→POP3/SMTP服务」开启后获取授权码</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">收件人邮箱</label>
                <input
                  type="email"
                  value={settings.smtpRecipient}
                  onChange={(e) => handleChange({ smtpRecipient: e.target.value })}
                  placeholder="your-email@qq.com"
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 focus:bg-white transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">发送时间</label>
                <input
                  type="time"
                  value={settings.emailReportTime}
                  onChange={(e) => handleChange({ emailReportTime: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 focus:bg-white transition-all"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleTestEmail}
                  disabled={testingEmail || !settings.smtpHost || !settings.smtpUsername || !settings.smtpRecipient}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-stone-700 bg-stone-50 hover:bg-stone-100 rounded-xl disabled:opacity-50 transition-colors"
                >
                  <TestTube2 className="w-4 h-4" />
                  {testingEmail ? "发送中..." : "发送测试邮件"}
                </button>
                <button
                  onClick={handleSendReport}
                  disabled={sendingReport || !settings.smtpHost || !settings.smtpUsername || !settings.smtpRecipient}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-stone-900 hover:bg-stone-800 rounded-xl disabled:opacity-50 transition-colors"
                >
                  {sendingReport ? "检查并发送中..." : "检查并发送报告"}
                </button>
              </div>
              {emailTestResult && (
                <div className={`flex items-center gap-1.5 text-sm ${emailTestResult.ok ? "text-green-600" : "text-red-500"}`}>
                  {emailTestResult.ok ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  {emailTestResult.msg}
                </div>
              )}
              {reportResult && (
                <div className={`flex items-center gap-1.5 text-sm ${reportResult.ok ? "text-green-600" : "text-red-500"}`}>
                  {reportResult.ok ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  {reportResult.msg}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Data */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6 mb-5">
        <h2 className="text-base font-semibold text-gray-900 mb-5">数据存储</h2>
        {appDataDir && (
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
            <FolderOpen className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-500 mb-0.5">数据目录</p>
              <p className="text-sm text-gray-700 truncate">{appDataDir}</p>
            </div>
          </div>
        )}
        <p className="text-[11px] text-gray-400 mt-3">
          数据库、浏览器 Profile 和配置文件存储在此目录
        </p>
      </section>

      {/* Data Backup */}
      <DataBackupSection />

      {/* Save Button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={!dirty}
          className="px-6 py-2.5 bg-stone-900 text-white rounded-xl text-sm font-medium hover:bg-stone-800 disabled:opacity-40 transition-all shadow-sm"
        >
          保存设置
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-green-600">
            <Check className="w-4 h-4" />
            已保存
          </span>
        )}
        {dirty && !saved && (
          <span className="text-sm text-gray-400">有未保存的更改</span>
        )}
        {settingsMessage && (
          <span className={`text-sm ${settingsMessage.ok ? "text-green-600" : "text-red-500"}`}>
            {settingsMessage.msg}
          </span>
        )}
      </div>
    </div>
  );
}
