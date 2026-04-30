function _iterableToArrayLimit(r, l) {
  var iteratorKey = typeof Symbol !== "undefined" && (r && (r[Symbol.iterator] || r["@@iterator"]));
  if (iteratorKey == null) {
    return;
  }

  var arr = [];
  var iterator = iteratorKey.call(r);
  var step;
  var didError = false;
  var error;

  try {
    while ((l === undefined || l-- > 0) && !(step = iterator.next()).done) {
      arr.push(step.value);
    }
  } catch (err) {
    didError = true;
    error = err;
  } finally {
    try {
      if (step && !step.done && iterator.return != null) {
        iterator.return();
      }
    } finally {
      if (didError) {
        throw error;
      }
    }
  }

  return arr;
}

module.exports = _iterableToArrayLimit;
module.exports.__esModule = true;
module.exports.default = module.exports;
