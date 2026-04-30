function _arrayLikeToArray(arr, len) {
  if (len == null || len > arr.length) {
    len = arr.length;
  }

  var arr2 = new Array(len);
  for (var i = 0; i < len; i += 1) {
    arr2[i] = arr[i];
  }
  return arr2;
}

module.exports = _arrayLikeToArray;
module.exports.__esModule = true;
module.exports.default = module.exports;
