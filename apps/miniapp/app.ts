import { wechatLogin, isLoggedIn } from 'miniprogram/services/common';

App({
  globalData: {
    isLoggedIn: false,
  },

  async onLaunch() {
    // Auto login on launch
    if (!isLoggedIn()) {
      try {
        await wechatLogin();
        this.globalData.isLoggedIn = true;
        console.log('Auto login success');
      } catch (e) {
        console.warn('Auto login failed:', e);
      }
    } else {
      this.globalData.isLoggedIn = true;
    }
  },
});
