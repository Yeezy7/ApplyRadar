import { Check, AlertCircle, X } from "lucide-react";

interface NoticeProps {
  success: boolean;
  message: string;
  onClose?: () => void;
}

export default function Notice({ success, message, onClose }: NoticeProps) {
  return (
    <div
      className={`mb-4 rounded-lg border px-4 py-3 text-sm flex items-center gap-2 ${
        success
          ? "border-emerald-100 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"
          : "border-red-100 dark:border-red-900 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
      }`}
    >
      {success ? (
        <Check className="w-4 h-4 flex-shrink-0" />
      ) : (
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
      )}
      <span className="flex-1">{message}</span>
      {onClose && (
        <button
          onClick={onClose}
          className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
