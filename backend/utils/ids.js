/**
 * Reference-id helpers.
 *
 * A Mongoose reference field holds an ObjectId — until something populates it,
 * at which point it holds a whole document. The codebase was littered with
 * hand-written `String(t.doctor && (t.doctor._id || t.doctor))` to cope, and the
 * places that FORGOT to do it produced a real bug: a populated document saved
 * back to the store broke every later `{ doctor: id }` lookup, including the
 * doctor's own "reports ready" list.
 *
 * One helper, used everywhere, so that class of bug cannot come back.
 */

/** The id of a reference, whether it is an id, a document, or already a string. */
function toId(reference) {
  if (reference === null || reference === undefined) return null;
  const raw = reference._id !== undefined ? reference._id : reference;
  return raw === null || raw === undefined ? null : String(raw);
}

/** Do two references point at the same document? Tolerates either shape. */
function sameId(a, b) {
  const left = toId(a);
  const right = toId(b);
  return left !== null && right !== null && left === right;
}

/** `true` when `reference` points at any of `candidates`. */
function idIn(reference, candidates = []) {
  const target = toId(reference);
  return target !== null && candidates.map(toId).includes(target);
}

module.exports = { toId, sameId, idIn };
