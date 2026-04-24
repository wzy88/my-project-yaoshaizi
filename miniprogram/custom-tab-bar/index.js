const {
  ACCOUNT_SESSION_KEY,
  LOGIN_GATE_REDIRECT_KEY
} = require("../utils/constants");

Component({
  data: {
    selected: 0,
    hidden: false,
    tabs: [
      { pagePath: "/pages/lobby/lobby", text: "首页" },
      { pagePath: "/pages/me/me", text: "我的" }
    ]
  },

  lifetimes: {
    attached() {
      this.updateSelectedByRoute();
    }
  },

  pageLifetimes: {
    show() {
      this.updateSelectedByRoute();
    }
  },

  methods: {
    updateSelectedByRoute() {
      const pages = getCurrentPages();
      if (!pages.length) return;
      const currentRoute = `/${pages[pages.length - 1].route}`;
      const selected = this.data.tabs.findIndex((tab) => tab.pagePath === currentRoute);
      if (selected >= 0 && selected !== this.data.selected) {
        this.setData({ selected });
      }
    },

    onSwitchTab(event) {
      const nextIndex = Number(event.currentTarget.dataset.index);
      if (Number.isNaN(nextIndex) || nextIndex < 0) return;

      const fallback = this.data.tabs[nextIndex] ? this.data.tabs[nextIndex].pagePath : "";
      const url = String(event.currentTarget.dataset.path || fallback || "");
      if (!url) return;

      if (nextIndex !== this.data.selected) {
        this.setData({ selected: nextIndex });
      }
      wx.switchTab({ url });
    },

    onCenterTap() {
      const pages = getCurrentPages();
      const currentRoute = pages.length ? `/${pages[pages.length - 1].route}` : "";
      if (currentRoute === "/pages/create-room/create-room") {
        return;
      }

      const accountSession = wx.getStorageSync(ACCOUNT_SESSION_KEY);
      const accountReady = Boolean(
        accountSession &&
        accountSession.accountId &&
        accountSession.sessionToken
      );
      if (!accountReady) {
        if (currentRoute === "/pages/lobby/lobby") {
          const currentPage = pages[pages.length - 1];
          if (currentPage && typeof currentPage.requireLogin === "function") {
            currentPage.requireLogin("/pages/create-room/create-room");
            return;
          }
        }

        wx.setStorageSync(LOGIN_GATE_REDIRECT_KEY, "/pages/create-room/create-room");
        wx.switchTab({ url: "/pages/lobby/lobby" });
        return;
      }

      wx.navigateTo({
        url: "/pages/create-room/create-room"
      });
    }
  }
});
