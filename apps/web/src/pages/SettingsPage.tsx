import { useState, useEffect } from "react";
import {
  Eye,
  EyeOff,
  LogOut,
  Save,
  RotateCcw,
  TestTube2,
  Check,
  AlertCircle,
  Download,
  Upload,
  Mail,
} from "lucide-react";
import {
  getSettings,
  saveSettings,
  type UserSettings,
} from "../services/settingsService";
import { testConnection } from "../services/aiService";
import { testEmail, sendDailyReport } from "../services/emailService";
import {
  exportData,
  importData,
  downloadBackup,
  readBackupFile,
} from "../services/backupService";
import Notice from "../components/Notice";
import ConfirmDialog from "../components/ConfirmDialog";
import { useNotice } from "../hooks/useNotice";
import { useConfirm } from "../hooks/useConfirm";

interface SettingsPageProps {
  onLogout: () => void;
}

export default function SettingsPage({ onLogout }: SettingsPageProps) {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const { notice, showSuccess, showError } = useNotice();
  const { isOpen, options, confirm, handleConfirm, handleCancel } = useConfirm();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);
  const [testingEmail, setTestingEmail] = useState(false);
  const [emailTestResult, setEmailTestResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);
  const [sendingReport, setSendingReport] = useState(false);
  const [reportResult, setReportResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await getSettings();
      setSettings(data);
    } catch (e) {
      console.error("Failed to load settings:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!settings) return;

    setSaving(true);
    try {
      await saveSettings({
        api_key: settings.api_key,
        api_base_url: settings.api_base_url,
        model: settings.model,
        check_frequency: settings.check_frequency,
        notifications_enabled: settings.notifications_enabled,
        auto_check_enabled: settings.auto_check_enabled,
        email_report_enabled: settings.email_report_enabled,
        smtp_host: settings.smtp_host,
        smtp_port: settings.smtp_port,
        smtp_username: settings.smtp_username,
        smtp_password: settings.smtp_password,
        smtp_recipient: settings.smtp_recipient,
        email_report_time: settings.email_report_time,
      });
      showSuccess("设置已保存");
    } catch (e) {
      showError(`保存失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await handleSaveSettings();
      const result = await testConnection();
      setTestResult({ ok: true, msg: result.message });
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
      await handleSaveSettings();
      const msg = await testEmail();
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
      await handleSaveSettings();
      const msg = await sendDailyReport();
      setReportResult({ ok: true, msg });
    } catch (e) {
      setReportResult({ ok: false, msg: String(e) });
    } finally {
      setSendingReport(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await exportData();
      downloadBackup(data);
      showSuccess("数据导出成功");
    } catch (e) {
      showError(`导出失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      setImporting(true);
      try {
        const data = await readBackupFile(file);
        const result = await importData(data);
        showSuccess(`导入完成: ${result.applications} 条记录, ${result.reminders} 条提醒`);
      } catch (e) {
        showError(`导入失败: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setImporting(false);
      }
    };
    input.click();
  };

  const handleReset = () => {
    if (!window.confirm("确定要恢复默认设置吗？")) return;
    setSettings({
      id: settings?.id || "",
      user_id: settings?.user_id || "",
      api_key: "",
      api_base_url: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      check_frequency: "daily",
      notifications_enabled: 1,
      auto_check_enabled: 0,
      email_report_enabled: 0,
      smtp_host: "",
      smtp_port: "465",
      smtp_username: "",
      smtp_password: "",
      smtp_recipient: "",
      email_report_time: "09:00",
      created_at: settings?.created_at || new Date().toISOString(),
      updated_at: settings?.updated_at || new Date().toISOString(),
    });
    showSuccess("已恢复默认设置，请点击保存");
  };

  const handleLogout = async () => {
    const confirmed = await confirm({
      title: "退出登录",
      message: "确定要退出登录吗？",
      confirmText: "退出",
      variant: "warning",
    });
    if (confirmed) {
      onLogout();
    }
  };

  return (
    <div className="max-w-3xl px-4 pb-6 pt-2">
      {notice && (
        <Notice
          success={notice.success}
          message={notice.message}
          onClose={() => {}}
        />
      )}

      <ConfirmDialog
        open={isOpen}
        title={options.title}
        message={options.message}
        confirmText={options.confirmText}
        variant={options.variant}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />

      {/* AI Configuration */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6 mb-5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">
            AI 配置
          </h2>
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            恢复默认
          </button>
        </div>
        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-10 bg-gray-200 rounded" />
            <div className="h-10 bg-gray-200 rounded" />
          </div>
        ) : settings ? (
          <div className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
                API Key
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={settings.api_key}
                  onChange={(e) =>
                    setSettings((prev) =>
                      prev ? { ...prev, api_key: e.target.value } : null
                    )
                  }
                  placeholder="sk-..."
                  className="w-full px-3.5 py-2.5 pr-10 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5">支持 OpenAI 兼容 API</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
                API Base URL
              </label>
              <input
                type="url"
                value={settings.api_base_url}
                onChange={(e) =>
                  setSettings((prev) =>
                    prev ? { ...prev, api_base_url: e.target.value } : null
                  )
                }
                placeholder="https://api.openai.com/v1"
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
                模型
              </label>
              <input
                type="text"
                value={settings.model}
                onChange={(e) =>
                  setSettings((prev) =>
                    prev ? { ...prev, model: e.target.value } : null
                  )
                }
                placeholder="gpt-4o-mini"
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 transition-all"
              />
            </div>

            {/* Test Connection */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleTestConnection}
                disabled={testing || !settings.api_key}
                className="flex items-center gap-2 px-4 py-2 text-sm text-stone-700 bg-stone-50 hover:bg-stone-100 rounded-2xl disabled:opacity-50 transition-colors"
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
        ) : null}
      </section>

      {/* Automation */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6 mb-5">
        <h2 className="text-base font-semibold text-gray-900 mb-5">自动化</h2>
        {settings && (
          <div className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
                默认检查频率
              </label>
              <select
                value={settings.check_frequency}
                onChange={(e) =>
                  setSettings((prev) =>
                    prev ? { ...prev, check_frequency: e.target.value } : null
                  )
                }
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 appearance-none cursor-pointer transition-all"
              >
                <option value="manual">手动</option>
                <option value="daily">每天</option>
                <option value="every_12h">每12小时</option>
                <option value="every_6h">每6小时</option>
              </select>
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
                aria-checked={!!settings.notifications_enabled}
                onClick={() =>
                  setSettings((prev) =>
                    prev
                      ? { ...prev, notifications_enabled: prev.notifications_enabled ? 0 : 1 }
                      : null
                  )
                }
                className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-stone-500/20 ${
                  settings.notifications_enabled ? "bg-stone-900" : "bg-gray-300"
                }`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    settings.notifications_enabled ? "translate-x-[22px]" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <div className="text-sm font-medium text-gray-900">自动检查</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  后台定时自动检查状态页
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={!!settings.auto_check_enabled}
                onClick={() =>
                  setSettings((prev) =>
                    prev
                      ? { ...prev, auto_check_enabled: prev.auto_check_enabled ? 0 : 1 }
                      : null
                  )
                }
                className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-stone-500/20 ${
                  settings.auto_check_enabled ? "bg-stone-900" : "bg-gray-300"
                }`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    settings.auto_check_enabled ? "translate-x-[22px]" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Email Report */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6 mb-5">
        <h2 className="text-base font-semibold text-gray-900 mb-5">邮件日报</h2>
        {settings && (
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
                aria-checked={!!settings.email_report_enabled}
                onClick={() =>
                  setSettings((prev) =>
                    prev
                      ? { ...prev, email_report_enabled: prev.email_report_enabled ? 0 : 1 }
                      : null
                  )
                }
                className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-stone-500/20 ${
                  settings.email_report_enabled ? "bg-stone-900" : "bg-gray-300"
                }`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    settings.email_report_enabled ? "translate-x-[22px]" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>

            {settings.email_report_enabled ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">SMTP 服务器</label>
                    <input
                      type="text"
                      value={settings.smtp_host}
                      onChange={(e) => setSettings((prev) => prev ? { ...prev, smtp_host: e.target.value } : null)}
                      placeholder="smtp.qq.com"
                      className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">端口</label>
                    <input
                      type="number"
                      value={settings.smtp_port}
                      onChange={(e) => setSettings((prev) => prev ? { ...prev, smtp_port: e.target.value } : null)}
                      placeholder="465"
                      className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">用户名</label>
                  <input
                    type="text"
                    value={settings.smtp_username}
                    onChange={(e) => setSettings((prev) => prev ? { ...prev, smtp_username: e.target.value } : null)}
                    placeholder="your-email@qq.com"
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">密码/授权码</label>
                  <div className="relative">
                    <input
                      type={showSmtpPassword ? "text" : "password"}
                      value={settings.smtp_password}
                      onChange={(e) => setSettings((prev) => prev ? { ...prev, smtp_password: e.target.value } : null)}
                      placeholder="SMTP 授权码"
                      className="w-full px-3.5 py-2.5 pr-10 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showSmtpPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">收件人邮箱</label>
                  <input
                    type="email"
                    value={settings.smtp_recipient}
                    onChange={(e) => setSettings((prev) => prev ? { ...prev, smtp_recipient: e.target.value } : null)}
                    placeholder="your-email@qq.com"
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">发送时间</label>
                  <input
                    type="time"
                    value={settings.email_report_time}
                    onChange={(e) => setSettings((prev) => prev ? { ...prev, email_report_time: e.target.value } : null)}
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 transition-all"
                  />
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={handleTestEmail}
                    disabled={testingEmail || !settings.smtp_host}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-stone-700 bg-stone-50 hover:bg-stone-100 rounded-2xl disabled:opacity-50 transition-colors"
                  >
                    <Mail className="w-4 h-4" />
                    {testingEmail ? "发送中..." : "测试邮件"}
                  </button>
                  <button
                    onClick={handleSendReport}
                    disabled={sendingReport || !settings.smtp_host}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-stone-900 hover:bg-stone-800 rounded-2xl disabled:opacity-50 transition-colors"
                  >
                    {sendingReport ? "发送中..." : "发送日报"}
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
            ) : null}
          </div>
        )}
      </section>

      {/* Save Button */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={handleSaveSettings}
          disabled={saving || !settings}
          className="px-6 py-2.5 bg-stone-900 text-white rounded-2xl text-sm font-medium hover:bg-stone-800 disabled:opacity-40 transition-all shadow-sm"
        >
          <Save className="w-4 h-4 inline mr-2" />
          {saving ? "保存中..." : "保存设置"}
        </button>
      </div>

      {/* Data Backup */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6 mb-5">
        <h2 className="text-base font-semibold text-gray-900 mb-4">数据备份</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-stone-700 bg-stone-50 hover:bg-stone-100 rounded-2xl disabled:opacity-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            {exporting ? "导出中..." : "导出数据"}
          </button>
          <button
            onClick={handleImport}
            disabled={importing}
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-stone-700 bg-stone-50 hover:bg-stone-100 rounded-2xl disabled:opacity-50 transition-colors"
          >
            <Upload className="w-4 h-4" />
            {importing ? "导入中..." : "导入数据"}
          </button>
        </div>
      </section>

      {/* Logout */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-4 py-2.5 text-red-600 hover:bg-red-50 rounded-2xl transition-colors text-sm"
        >
          <LogOut className="w-4 h-4" />
          退出登录
        </button>
      </section>
    </div>
  );
}
