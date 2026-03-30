function resolveSeatCupToneClass(player) {
  const status = player && player.diceCupStatus;
  return status === "open" ? "is-jade" : "is-slot";
}

module.exports = {
  resolveSeatCupToneClass
};
