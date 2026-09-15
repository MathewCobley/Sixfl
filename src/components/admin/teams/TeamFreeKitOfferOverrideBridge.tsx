// Retired: TeamKitColourPicker renders FreeKitOfferControl natively. That
// component now owns grant, disable, restore, confirmation and audit history.
// Keep this inert export while older route-preparation code still imports it;
// never inject a second control or issue an unaudited expiry request.
export default function TeamFreeKitOfferOverrideBridge() {
  return null;
}
