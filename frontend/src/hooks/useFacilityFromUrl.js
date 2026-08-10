import { useSearchParams } from 'react-router-dom';

/**
 * The facility a login screen was opened for, via `?facility=<id>`.
 *
 * A facility's landing page links its own staff straight to their portal, so a
 * receptionist at a three-room clinic never has to find their employer in a
 * dropdown listing every partner on the platform.
 *
 * The value is a HINT, not an instruction: it comes from the URL, which anyone
 * can type. Callers must keep the existing "does this id exist in the fetched
 * hospital list?" check — that check is what turns an arbitrary query string
 * into a real tenant id, and it is the only thing that should ever reach a
 * login request.
 */
export default function useFacilityFromUrl() {
  const [params] = useSearchParams();
  return params.get('facility') || '';
}
