import type { MobileTabItem } from "../components/benchmark/mobile-tab-bar";
import type { SessionMenuItem } from "../types/session";

const PLAYER_FALLBACK_TAB_ITEMS: MobileTabItem[] = [
  { label: "Home", icon: "home", to: "/player/home" },
  { label: "Book", icon: "golf_course", to: "/player/book" },
  { label: "Order", icon: "local_cafe", to: "/player/order" },
  { label: "Profile", icon: "person", to: "/player/profile" },
];

const PLAYER_TAB_BY_KEY: Record<string, Omit<MobileTabItem, "isActive">> = {
  home: { label: "Home", icon: "home", to: "/player/home" },
  book: { label: "Book", icon: "golf_course", to: "/player/book" },
  order: { label: "Order", icon: "local_cafe", to: "/player/order" },
  profile: { label: "Profile", icon: "person", to: "/player/profile" },
};

export function buildPlayerTabItems(
  menuItems: SessionMenuItem[] | undefined,
  activeKey: "home" | "book" | "order" | "profile",
): MobileTabItem[] {
  const backendItems = (menuItems ?? []).filter((item) => item.shell === "player");
  const items = backendItems.length > 0
    ? backendItems.flatMap((item) => {
        const resolved = PLAYER_TAB_BY_KEY[item.key];
        return resolved ? [resolved] : [];
      })
    : PLAYER_FALLBACK_TAB_ITEMS;

  return items.map((item) => ({
    ...item,
    isActive: item.to === PLAYER_TAB_BY_KEY[activeKey].to,
  }));
}
