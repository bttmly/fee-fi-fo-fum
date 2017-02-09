const EventEmitter = require("events");
const net = require("net");

const CRLF = new Buffer([0x0d, 0x0a]);
const ResponseHandler = require("./response-handler");

class BeanstalkdClient extends EventEmitter {
  constructor (host, port) {
    super();
    this.host = host || BeanstalkdClient.DEFAULT_HOST;
    this.port = port || BeanstalkdClient.DEFAULT_PORT;
    this._handlers = [];
    this._buffer = new Buffer(0);
  }

  connect () {
    this._stream = net.createConnection(this.port, this.host);
    this._stream.on("data", chunk => {
      this._buffer = Buffer.concat([this._buffer, chunk]);
      this._tryHandlingResponse();
    });

    this._stream.on("close", () => this.emit("close"));

    return new Promise((resolve, reject) => {
      this._stream.on("connect", () => {
        this.emit("connect");
        resolve();
      });

      this._stream.on("error", err => {
        this.emit("error", err);
        reject();
      });
    });
  }

  end () {
    if (this._stream == null) {
      throw new Error("Never connected!");
    }
    this._stream.end();
  }

  _tryHandlingResponse () {
    if (this._handlers.length === 0) {
      return;
    }

    const { handler, resolve, reject } = this._handlers[0];
    this._buffer = handler.process(this._buffer);

    if (!handler.complete) {
      handler.reset();
      return;
    }

    // handler is complete! try looping to see if
    // we can process the remainder
    this._handlers.shift();
    if (handler.success) {
      resolve(handler.args.length > 1 ? handler.args : handler.args[0]);
    } else {
      reject(new Error(handler.args[0]));
    }

    if (handler.remainder != null) {
      this._buffer = handler.remainder;
    }

    this._tryHandlingResponse();
  }
}

// Commands are called as client.COMMAND(arg1, arg2, ... data) and always return a promise;
// They"re sent to beanstalkd as: COMMAND arg1 arg2 ...
// followed by data.
// So we slice the callback & data from the passed-in arguments, prepend
// the command, then send the arglist otherwise intact.
// We then push a handler for the expected response onto our handler stack.
// Some commands have no args, just a callback (stats, stats-tube, etc);
// That"s the case handled when args < 2.

// TODO -- dangling boolean parameter is kind of silly. Should have a list of these methods
function makeCommand (cmd, expected, sendsData) {
  function command (..._args) {
    const args = [cmd, ..._args];
    const { promise, resolve, reject } = deferred();

    let data;
    if (sendsData) {
      data = args.pop();
      if (!Buffer.isBuffer(data)) {
        data = new Buffer(data);
      }
      args.push(data.length);
    }

    const handler = new ResponseHandler(expected);
    this._handlers.push({ handler, resolve, reject });

    const buffer = data ?
      Buffer.concat([new Buffer(args.join(" ")), CRLF, data, CRLF]) :
      Buffer.concat([new Buffer(args.join(" ")), CRLF]);

    this._stream.write(buffer);
    return promise;
  }

  // set a function name if environment supports it, for debugging
  try {
    Object.defineProperty(command, "name", {
      value: cmd,
      writable: true,
      configurable: true,
    });
  } catch (_) {}

  return command;
}

BeanstalkdClient.DEFAULT_HOST    = "127.0.0.1";
BeanstalkdClient.DEFAULT_PORT    = 11300;
BeanstalkdClient.LOWEST_PRIORITY = 1000;
BeanstalkdClient.ResponseHandler = ResponseHandler;

// beanstalkd commands

BeanstalkdClient.prototype.use                  = makeCommand("use", "USING");
BeanstalkdClient.prototype.put                  = makeCommand("put", "INSERTED", true);

BeanstalkdClient.prototype.watch                = makeCommand("watch", "WATCHING");
BeanstalkdClient.prototype.ignore               = makeCommand("ignore", "WATCHING");
BeanstalkdClient.prototype.reserve              = makeCommand("reserve", "RESERVED");
BeanstalkdClient.prototype.reserveWithTimeout   = makeCommand("reserve-with-timeout", "RESERVED");
BeanstalkdClient.prototype.destroy              = makeCommand("delete", "DELETED");
BeanstalkdClient.prototype.release              = makeCommand("release", "RELEASED");
BeanstalkdClient.prototype.bury                 = makeCommand("bury", "BURIED");
BeanstalkdClient.prototype.touch                = makeCommand("touch", "TOUCHED");
BeanstalkdClient.prototype.kick                 = makeCommand("kick", "KICKED");
BeanstalkdClient.prototype.kickJob              = makeCommand("kick-job", "KICKED");

BeanstalkdClient.prototype.peek                 = makeCommand("peek", "FOUND");
BeanstalkdClient.prototype.peekReady            = makeCommand("peek-ready", "FOUND");
BeanstalkdClient.prototype.peekDelayed          = makeCommand("peek-delayed", "FOUND");
BeanstalkdClient.prototype.peekBuried           = makeCommand("peek-buried", "FOUND");

BeanstalkdClient.prototype.listTubeUsed         = makeCommand("list-tube-used", "USING");
BeanstalkdClient.prototype.pauseTube            = makeCommand("pause-tube", "PAUSED");

// the server returns yaml files in response to these commands
BeanstalkdClient.prototype.listTubes            = makeCommand("list-tubes", "OK");
BeanstalkdClient.prototype.listTubesWatched     = makeCommand("list-tubes-watched", "OK");
BeanstalkdClient.prototype.statsJob             = makeCommand("stats-job", "OK");
BeanstalkdClient.prototype.statsTube            = makeCommand("stats-tube", "OK");
BeanstalkdClient.prototype.stats                = makeCommand("stats", "OK");

// closes the connection, no response
BeanstalkdClient.prototype.quit                 = makeCommand("quit", "");

module.exports = BeanstalkdClient;

function deferred () {
  let resolve, reject;
  const promise = new Promise((_resolve, _reject) => {
    resolve = _resolve; reject = _reject;
  });
  return { promise, resolve, reject };
}
