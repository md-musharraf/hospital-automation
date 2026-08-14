import { useState, useEffect, useMemo } from 'react';
import { BACKEND_URL } from '../App';
import { getFacilityTheme, themeVars } from '../theme/facilityThemes';

/**
 * The signed-in user's own facility: its name, logo and colour identity.
 *
 * The staff and doctor dashboards used to hard-code "CareeAi Admin / General
 * Hospital" in the sidebar, so a receptionist at Sunrise Dental spent their
 * whole shift looking at another hospital's name. On a multi-tenant product
 * that is not cosmetic — it is the one place a user checks to confirm they are
 * in the right tenant before they discharge someone or take a payment.
 *
 * Returns the theme even before the fetch lands, so a dashboard never has to
 * render a branding-shaped hole while it waits.
 */
export default function useFacilityBranding(hospitalId) {
  const [facility, setFacility] = useState(null);

  useEffect(() => {
    if (!hospitalId) return undefined;
    let cancelled = false;
    fetch(`${BACKEND_URL}/api/v1/chat/hospital/${hospitalId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setFacility(data);
      })
      .catch(() => {
        /* Branding is decoration — a dashboard must still work offline. */
      });
    return () => {
      cancelled = true;
    };
  }, [hospitalId]);

  const theme = useMemo(
    () =>
      getFacilityTheme(facility?.type, {
        primaryColor: facility?.primaryColor,
        secondaryColor: facility?.secondaryColor
      }),
    [facility]
  );

  return {
    facility,
    theme,
    vars: themeVars(theme),
    // Falls back to the tenant id rather than another hospital's name — a
    // recognisable slug beats confidently showing the wrong facility.
    name: facility?.name || hospitalId || 'Facility',
    kind: facility?.type || 'Facility'
  };
}
