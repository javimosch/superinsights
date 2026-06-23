// Escape characters that are special in a RegExp so user-supplied search input
// is matched literally — prevents ReDoS (catastrophic backtracking) and
// accidental query-semantic changes when the value is used in a Mongo $regex.
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { escapeRegExp };
