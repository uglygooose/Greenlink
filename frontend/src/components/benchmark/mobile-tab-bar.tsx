import { NavLink } from "react-router-dom";

import { MaterialSymbol } from "./material-symbol";

function joinClasses(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export interface MobileTabItem {
  label: string;
  icon: string;
  to?: string;
  isActive?: boolean;
}

interface MobileTabBarProps {
  items: MobileTabItem[];
  className: string;
  activeClassName: string;
  inactiveClassName: string;
  labelClassName: string;
}

export function MobileTabBar({
  items,
  className,
  activeClassName,
  inactiveClassName,
  labelClassName,
}: MobileTabBarProps): JSX.Element {
  return (
    <nav className={className}>
      {items.map((item) =>
        item.to ? (
          <NavLink
            key={`${item.label}-${item.icon}`}
            className={({ isActive }) =>
              joinClasses(
                "flex flex-col items-center justify-center px-3 py-1.5 transition-transform duration-150",
                isActive || item.isActive ? activeClassName : inactiveClassName,
              )
            }
            to={item.to}
          >
            {({ isActive }) => (
              <>
                <MaterialSymbol icon={item.icon} filled={isActive || item.isActive} />
                <span className={labelClassName}>{item.label}</span>
              </>
            )}
          </NavLink>
        ) : (
          <button
            key={`${item.label}-${item.icon}`}
            className={joinClasses(
              "flex flex-col items-center justify-center px-3 py-1.5 transition-transform duration-150",
              item.isActive ? activeClassName : inactiveClassName,
            )}
            type="button"
          >
            <MaterialSymbol icon={item.icon} filled={item.isActive} />
            <span className={labelClassName}>{item.label}</span>
          </button>
        ),
      )}
    </nav>
  );
}
