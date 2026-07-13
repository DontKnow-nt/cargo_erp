import util from 'util';

if (util) {
  if (!util.inspect) {
    // @ts-ignore
    util.inspect = function(x) { return String(x); };
  }
  if (util.inspect && !util.inspect.custom) {
    // @ts-ignore
    util.inspect.custom = Symbol.for('nodejs.util.inspect.custom');
  }
}
