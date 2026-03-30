const { LEGAL_ACCEPT_KEY, NICKNAME_KEY } = require("../utils/constants");

function safeDecodeComponent(raw) {
  const value = String(raw || "");
  if (!value) return "";
  if (!/%[0-9a-fA-F]{2}/.test(value)) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

Component({
  data: {
    selected: 0,
    tabs: [
      { pagePath: "/pages/lobby/lobby", text: "首页" },
      { pagePath: "/pages/store/store", text: "" },
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

      const legalConsent = wx.getStorageSync(LEGAL_ACCEPT_KEY);
      const legalAccepted = Boolean(legalConsent && legalConsent.accepted === true);
      if (!legalAccepted) {
        wx.switchTab({ url: "/pages/lobby/lobby" });
        wx.showToast({ title: "请先在首页同意协议", icon: "none" });
        return;
      }

      const nickname = safeDecodeComponent(wx.getStorageSync(NICKNAME_KEY)).trim();
      wx.navigateTo({
        url: `/pages/create-room/create-room?nickname=${encodeURIComponent(nickname || "")}`
      });
    }
  }
});
