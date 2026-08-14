import React, { useState } from 'react';
import { Icon } from './DashboardKit';
import { navFor } from './roleNav';
import { useFacilitySession } from './facilitySession';
import useFacilityBranding from '../../hooks/useFacilityBranding';

/**
 * The frame every staff-facing dashboard sits in.
 *
 * Sidebar on the left, identity and clock along the top, work in the middle.
 * The four portals each had their own version of this, which meant a
 * receptionist who moved to the lab bench had to relearn where the logout
 * button lived. Now they differ only in the work they do.
 *
 * The facility's own name and colours come through `useFacilityBranding`, so
 * someone holding logins at two hospitals can tell at a glance which one they
 * are signed into before they discharge a patient or take a payment.
 */
export default function DashboardShell({
  role,
  user,
  activeKey,
  onNavigate,
  onLogout,
  subtitle,
  headerRight,
  children
}) {
  const nav = navFor(role);
  const branding = useFacilityBranding(user?.hospital);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Present whenever this dashboard is running inside the facility console,
  // absent on any standalone render. See dashboard/facilitySession.js.
  const session = useFacilitySession();

  const current = nav.items.find((i) => i.key === activeKey);
  const initial = (user?.name || '?')
    .replace(/^Dr\.?\s*/i, '')
    .charAt(0)
    .toUpperCase();

  const go = (key) => {
    setMobileNavOpen(false);
    if (onNavigate) onNavigate(key);
  };

  /**
   * The room switcher.
   *
   * One facility login opens every unit that facility runs, so moving from the
   * reception desk to the lab bench is a click here rather than a sign-out and
   * a second password. It sits above the room's own screens, and it renders
   * only the rooms this facility actually has — the same list the API enforces.
   *
   * A facility with exactly one room (a standalone pathology lab, say) gets no
   * switcher at all: a control with a single option is decoration.
   */
  const roomSwitcher =
    session && session.rooms.length > 1 ? (
      <div className="mb-4">
        <p className="px-3.5 pb-1.5 text-[11px] uppercase font-black tracking-wider text-[var(--text-secondary)]">
          Rooms
        </p>
        <div className="space-y-1">
          {session.rooms.map((room) => {
            const active = room.key === session.activeRoom;
            return (
              <button
                key={room.key}
                type="button"
                onClick={() => {
                  setMobileNavOpen(false);
                  session.onSwitchRoom(room.key);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-[13px] font-black transition-all ${
                  active
                    ? 'bg-[var(--primary-color)] text-white shadow-md shadow-[var(--primary-color)]/25'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--border-color)]/20 hover:text-[var(--text-color)]'
                }`}
              >
                <Icon name={room.icon} className="text-[20px] shrink-0" />
                <span className="truncate">{room.label}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 mx-3 border-t border-[var(--border-color)]/40" />
      </div>
    ) : null;

  const navList = (
    <nav className="space-y-1">
      {nav.items.map((item) => {
        const active = item.key === activeKey;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => go(item.key)}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[14px] font-bold transition-all ${
              active
                ? 'bg-[var(--primary-color)]/12 text-[var(--primary-color)] border border-[var(--primary-color)]/25'
                : 'border border-transparent text-[var(--text-secondary)] hover:bg-[var(--border-color)]/20 hover:text-[var(--text-color)]'
            }`}
          >
            <Icon name={item.icon} className="text-[21px] shrink-0" />
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );

  const brandBlock = (
    <div className="flex items-center gap-3 min-w-0">
      {branding.facility?.logoUrl ? (
        <img
          src={branding.facility.logoUrl}
          alt=""
          className="w-10 h-10 rounded-xl object-cover border border-[var(--border-color)]/40 shrink-0"
        />
      ) : (
        <span
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0"
          style={{
            background: `linear-gradient(135deg, ${branding.theme.primary}, ${branding.theme.accent})`
          }}
        >
          <Icon name={branding.theme.icon} className="text-[22px]" />
        </span>
      )}
      <span className="min-w-0">
        <span
          className="block text-[15px] font-black leading-tight truncate"
          style={{ color: branding.theme.primary }}
          title={branding.name}
        >
          {branding.name}
        </span>
        <span className="block text-[12px] font-bold text-[var(--text-secondary)] truncate">{nav.title}</span>
      </span>
    </div>
  );

  return (
    <div
      style={branding.vars}
      className="flex-1 flex overflow-hidden max-h-[calc(100vh-62px)] bg-[var(--bg-color)] text-[var(--text-color)]"
    >
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col justify-between bg-[var(--card-bg)] border-r border-[var(--border-color)]/40">
        <div className="min-w-0">
          <div className="p-5 border-b border-[var(--border-color)]/30">{brandBlock}</div>
          <div className="p-3">
            {roomSwitcher}
            {navList}
          </div>
        </div>

        <div className="p-3 border-t border-[var(--border-color)]/30 flex items-center gap-2.5">
          <span
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[14px] font-black shrink-0"
            style={{ background: branding.theme.primary }}
          >
            {initial}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-black text-[var(--text-color)] truncate">
              {user?.name || 'Signed in'}
            </span>
            <span className="block text-[12px] font-semibold text-[var(--text-secondary)] truncate">
              {subtitle || nav.title}
            </span>
          </span>
          {/* Leaving a cabin is not signing out. A doctor finishing their OPD
              hands the same console back to whoever is on next, so the way out
              of a cabin has to sit next to — and be distinct from — the way out
              of the facility. */}
          {/* `onLeaveCabin` is withheld for a doctor signed in as themselves:
              their cabin came from their own credential, so there is nothing to
              switch to and no token that could switch it. */}
          {session && session.activeRoom === 'doctor' && session.actingDoctor && session.onLeaveCabin && (
            <button
              type="button"
              onClick={session.onLeaveCabin}
              title="Switch to a different cabin"
              className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--primary-color)] hover:bg-[var(--primary-color)]/10 transition-colors shrink-0"
            >
              <Icon name="swap_horiz" className="text-[20px]" />
            </button>
          )}
          <button
            type="button"
            onClick={onLogout}
            title="Sign out"
            className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors shrink-0"
          >
            <Icon name="logout" className="text-[20px]" />
          </button>
        </div>
      </aside>

      {/* Work area */}
      <div className="flex-1 flex flex-col overflow-y-auto min-w-0">
        <header className="sticky top-0 z-30 px-5 md:px-7 py-3.5 bg-[var(--card-bg)] border-b border-[var(--border-color)]/40 flex items-center gap-3">
          {/* On a phone the sidebar collapses to this one button — a nurse on a
              ward round should not lose a third of the screen to navigation. */}
          <button
            type="button"
            onClick={() => setMobileNavOpen((v) => !v)}
            className="md:hidden p-2 -ml-2 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--border-color)]/20"
            aria-label="Menu"
            aria-expanded={mobileNavOpen}
          >
            <Icon name={mobileNavOpen ? 'close' : 'menu'} className="text-[22px]" />
          </button>

          <div className="min-w-0">
            <h2 className="text-[19px] md:text-[21px] font-black text-[var(--text-color)] leading-tight truncate">
              {current ? current.label : nav.title}
            </h2>
            {subtitle && (
              <p className="text-[13px] font-semibold text-[var(--text-secondary)] truncate">{subtitle}</p>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2 shrink-0">{headerRight}</div>
        </header>

        {mobileNavOpen && (
          <div className="md:hidden p-3 bg-[var(--card-bg)] border-b border-[var(--border-color)]/40">
            {roomSwitcher}
            {navList}
            <button
              type="button"
              onClick={onLogout}
              className="mt-2 w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[14px] font-bold text-rose-500 hover:bg-rose-500/10"
            >
              <Icon name="logout" className="text-[21px]" />
              Sign out
            </button>
          </div>
        )}

        <main className="flex-1 p-4 md:p-6 space-y-5 min-w-0">{children}</main>
      </div>
    </div>
  );
}
