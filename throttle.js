
/**
 * Module dependencies.
 */

var assert = require('assert');
var Parser = require('stream-parser');
var inherits = require('util').inherits;
var Transform = require('stream').Transform;

// node v0.8.x compat
if (!Transform) Transform = require('readable-stream/transform');

/**
 * Module exports.
 */

module.exports = Throttle;

/**
 * The `Throttle` passthrough stream class is very similar to the node core
 * `stream.Passthrough` stream, except that you specify a `bps` "bytes per
 * second" option and data *will not* be passed through faster than the byte
 * value you specify.
 *
 * You can invoke with just a `bps` Number and get the rest of the default
 * options. This should be more common:
 *
 * ``` js
 * process.stdin.pipe(new Throttle(100 * 1024)).pipe(process.stdout);
 * ```
 *
 * Or you can pass an `options` Object in, with a `bps` value specified along with
 * other options:
 *
 * ``` js
 * var t = new Throttle({ bps: 100 * 1024, chunkSize: 100, highWaterMark: 500 });
 * ```
 *
 * @param {Number|Object} opts an options object or the "bps" Number value
 * @api public
 */

function Throttle (opts) {
  if (!(this instanceof Throttle)) return new Throttle(opts);

  if ('number' == typeof opts) opts = { bps: opts };
  if (!opts) opts = {};
  if (null == opts.lowWaterMark) opts.lowWaterMark = 0;
  if (null == opts.highWaterMark) opts.highWaterMark = 0;
  if (null == opts.bps) throw new Error('must pass a "bps" bytes-per-second option');
  if (null == opts.chunkSize) opts.chunkSize = opts.bps / 10 | 0; // 1/10th of "bps" by default
  if (null == opts.burst) opts.burst = 0; // Burst 0 by default
  if (null == opts.burstMax) opts.burstMax = opts.bps * 2 | 0;

  Transform.call(this, opts);

  this.bps = opts.bps;
  this.chunkSize = Math.max(1, opts.chunkSize);
  this.burst = opts.burst;
  this.burstMax = opts.burstMax;

  this.totalBytes = 0;
  this.startTime = Date.now();

  this._passthroughChunk();

  this.rate = this.bps;
  this.rateLast = 0;
  //console.log("Throttle configed");
}
inherits(Throttle, Transform);

/**
 * Mixin `Parser`.
 */

Parser(Throttle.prototype);

/**
 * Begins passing through the next "chunk" of bytes.
 *
 * @api private
 */

Throttle.prototype._passthroughChunk = function () {
  this._passthrough(this.chunkSize, this._onchunk);
  this.totalBytes += this.chunkSize;
};

/**
 * Called once a "chunk" of bytes has been passed through. Waits if necessary
 * before passing through the next chunk of bytes.
 *
 * @api private
 */

Throttle.prototype._onchunk = function (output, done) {
  var self = this;
  var totalSeconds = (Date.now() - this.startTime) / 1000;
  // Use this byte count to calculate how many seconds ahead we are.

  //if(this.rateLast == 0) console.log("Throttle Running!");

  if(this.totalBytes < this.burst){
      this.rate = this.burstMax;
  }else{
      this.rate = this.bps;
  }

  if(this.rate != this.rateLast){
      if(this.rate == this.burstMax) console.log("Bursting: ", this.burstMax);
      if(this.rate == this.bps) console.log("Streaming:", this.bps);
//      console.log("totalBytes: ", this.totalBytes);
//      console.log("newRate: ", this.rate);
      this.chunkSize = this.rate / 10;
      this.rateLast = this.rate;
  }

  var expected = totalSeconds * this.rate;

  function d () {
    self._passthroughChunk();
    done();
  }

  if (this.totalBytes > expected) {

    var remainder = this.totalBytes - expected;
    var sleepTime = remainder / this.rate * 1000;
    //console.error('sleep time: %d', sleepTime);
    if (sleepTime > 0) {
      setTimeout(d, sleepTime);
    } else {
      d();
    }
  } else {
    d();
  }
};
