function buildTimeText() {
  const date = new Date();
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

const ALL_ITEMS = {
  cup: [
    { id: "cup_leather", name: "经典皮革", priceText: "500", rarity: "common", rarityLabel: "Common", preview: "", previewTone: "preview-gold", owned: true },
    { id: "cup_velvet", name: "皇家天鹅绒", priceText: "1,500", rarity: "rare", rarityLabel: "Rare", preview: "⚜️", previewTone: "preview-purple", owned: false },
    { id: "cup_marble", name: "黑色大理石", priceText: "10,000", rarity: "legendary", rarityLabel: "Legendary", preview: "", previewTone: "preview-black", owned: false },
    { id: "cup_dragon", name: "金龙骰盅", priceText: "5,000", rarity: "epic", rarityLabel: "Epic", preview: "🐉", previewTone: "preview-dragon", owned: false },
    { id: "cup_hellfire", name: "地狱之火", priceText: "8,000", rarity: "legendary", rarityLabel: "Legendary", preview: "", previewTone: "preview-fire", owned: false },
    { id: "cup_silver", name: "银色装饰", priceText: "3,000", rarity: "rare", rarityLabel: "Epic", preview: "", previewTone: "preview-silver", owned: false }
  ],
  dice: [
    { id: "dice_gold", name: "鎏金骰", priceText: "600", rarity: "common", rarityLabel: "Common", preview: "⚄", previewTone: "preview-gold", owned: false },
    { id: "dice_frost", name: "冰晶骰", priceText: "1,800", rarity: "rare", rarityLabel: "Rare", preview: "❄", previewTone: "preview-silver", owned: false },
    { id: "dice_night", name: "夜幕骰", priceText: "6,600", rarity: "legendary", rarityLabel: "Legendary", preview: "✦", previewTone: "preview-black", owned: false },
    { id: "dice_void", name: "虚空骰", priceText: "8,800", rarity: "legendary", rarityLabel: "Legendary", preview: "◎", previewTone: "preview-purple", owned: false },
    { id: "dice_blaze", name: "熔火骰", priceText: "4,000", rarity: "epic", rarityLabel: "Epic", preview: "☄", previewTone: "preview-fire", owned: false },
    { id: "dice_moon", name: "月白骰", priceText: "2,200", rarity: "rare", rarityLabel: "Rare", preview: "◐", previewTone: "preview-silver", owned: false }
  ],
  fx: [
    { id: "fx_call", name: "叫牌闪光", priceText: "900", rarity: "common", rarityLabel: "Common", preview: "⚡", previewTone: "preview-gold", owned: false },
    { id: "fx_open", name: "开牌烟花", priceText: "2,600", rarity: "rare", rarityLabel: "Rare", preview: "✺", previewTone: "preview-purple", owned: false },
    { id: "fx_win", name: "胜利光环", priceText: "9,900", rarity: "legendary", rarityLabel: "Legendary", preview: "👑", previewTone: "preview-black", owned: false },
    { id: "fx_fail", name: "失败特效", priceText: "2,200", rarity: "epic", rarityLabel: "Epic", preview: "💥", previewTone: "preview-fire", owned: false },
    { id: "fx_voice", name: "语音波纹", priceText: "1,300", rarity: "rare", rarityLabel: "Rare", preview: "🎙", previewTone: "preview-silver", owned: false },
    { id: "fx_card", name: "卡牌入场", priceText: "4,600", rarity: "legendary", rarityLabel: "Legendary", preview: "🃏", previewTone: "preview-purple", owned: false }
  ]
};

Page({
  data: {
    timeText: "10:21",
    balanceCoins: "2,350",
    categories: [
      { key: "cup", text: "骰盅皮肤" },
      { key: "dice", text: "骰子皮肤" },
      { key: "fx", text: "特效" }
    ],
    activeCategory: "cup",
    displayItems: ALL_ITEMS.cup
  },

  onShow() {
    this.setData({ timeText: buildTimeText() });
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar && tabBar.setData) {
      tabBar.setData({ selected: 1 });
    }
  },

  onSwitchCategory(event) {
    const key = String(event.currentTarget.dataset.key || "");
    if (!key || !ALL_ITEMS[key]) return;
    this.setData({
      activeCategory: key,
      displayItems: ALL_ITEMS[key]
    });
  },

  onTapRecharge() {
    wx.showToast({ title: "下个版本开放", icon: "none" });
  },

  onTapBuyCoin(event) {
    const id = String(event.currentTarget.dataset.id || "");
    if (!id) return;
    wx.showToast({ title: "下个版本开放", icon: "none" });
  }
});
