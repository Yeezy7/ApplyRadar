Component({
  data: {
    current: 0,
    tabs: [
      { pagePath: '/pages/dashboard/index', text: '仪表盘', icon: '📊' },
      { pagePath: '/pages/applications/index', text: '投递', icon: '📋' },
      { pagePath: '/pages/kanban/index', text: '看板', icon: '📌' },
      { pagePath: '/pages/reminders/index', text: '提醒', icon: '🔔' },
      { pagePath: '/pages/settings/index', text: '设置', icon: '⚙️' },
    ],
  },

  methods: {
    switchTab(e: any) {
      const { path } = e.currentTarget.dataset;
      wx.switchTab({ url: path });
    },

    setCurrent(index: number) {
      this.setData({ current: index });
    },
  },
});
