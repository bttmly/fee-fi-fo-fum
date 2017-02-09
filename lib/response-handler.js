const yaml = require("js-yaml");

const RESPONSES_REQUIRING_BODY = {
  RESERVED: "passthrough",
  FOUND: "passthrough",
  OK: "yaml",
};

const CRLF = new Buffer([0x0d, 0x0a]);
const EMPTY_STRING = "";

class ResponseHandler {
  constructor (expected) {
    this._expected = expected;
    this.reset();
  }

  reset () {
    this.complete = false;
    this.success = false;
    this.args = null;
    this.header = null;
    this.body = null;
  }

  process (buf) {
    const idx = buf.indexOf(CRLF);
    if (idx > -1) {
      // Header is everything up to the windows line break;
      // body is everything after.
      this.header = buf.toString("utf8", 0, idx);
      this.body = buf.slice(idx + 2, buf.length);
      this.args = this.header.split(" ");
      const response = this.args[0];

      if (response === this._expected) {
        this.success = true;
        this.args.shift();
      }

      if (RESPONSES_REQUIRING_BODY[response]) {
        this.parseBody(RESPONSES_REQUIRING_BODY[response]);

        if (this.complete) {
          const sliceStart = idx + 2 + buf.length + 2;
          if (sliceStart >= buf.length) {
            return new Buffer(0);
          }
          return buf.slice(idx + 2 + buf.length + 2);
        }
      } else {
        this.complete = true;
        const sliceStart = idx + 2;
        if (sliceStart >= buf.length) {
          return new Buffer(0);
        }

        return buf.slice(idx + 2);
      }
    } else {
      // no response expected (quit)
      if (this._expected === EMPTY_STRING) {
        this.success = true;
        this.complete = true;
      }
    }

    return buf;
  }

  /*
  RESERVED <id> <bytes>\r\n
  <data>\r\n

  OK <bytes>\r\n
  <data>\r\n

  Beanstalkd commands like reserve() & stats() return a body.
  We must read <bytes> data in response.
  */
  parseBody (how) {
    if (this.body == null) {
      return;
    }

    const expectedLength = parseInt(this.args[this.args.length - 1], 10);

    if (this.body.length > (expectedLength + 2)) {
      // Body contains multiple responses. Split off the remaining bytes.
      this.remainder = this.body.slice(expectedLength + 2);
      this.body = this.body.slice(0, expectedLength + 2);
    }

    if (this.body.length === (expectedLength + 2)) {
      this.args.pop();
      const body = this.body.slice(0, expectedLength);
      this.complete = true;

      switch (how) {
        case "yaml":
          this.args.push(yaml.load(body.toString()));
          break;

        // case "passthrough":
        default:
          this.args.push(body);
          break;
      }
    }
  }
}

module.exports = ResponseHandler;
