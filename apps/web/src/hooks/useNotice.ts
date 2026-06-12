import { useState, useEffect, useCallback } from "react";

export interface Notice {
  success: boolean;
  message: string;
}

export function useNotice(autoHideMs = 3000) {
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (notice && autoHideMs > 0) {
      const timer = setTimeout(() => setNotice(null), autoHideMs);
      return () => clearTimeout(timer);
    }
  }, [notice, autoHideMs]);

  const showNotice = useCallback((success: boolean, message: string) => {
    setNotice({ success, message });
  }, []);

  const showSuccess = useCallback((message: string) => {
    setNotice({ success: true, message });
  }, []);

  const showError = useCallback((message: string) => {
    setNotice({ success: false, message });
  }, []);

  const clearNotice = useCallback(() => {
    setNotice(null);
  }, []);

  return {
    notice,
    setNotice,
    showNotice,
    showSuccess,
    showError,
    clearNotice,
  };
}
