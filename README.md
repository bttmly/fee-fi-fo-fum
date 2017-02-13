# fee-fi-fo-fum

This is an ES6 port/rewrite of the [fivebeans client](https://github.com/ceejbot/fivebeans/blob/master/lib/client.js). Refer to the docs there, this module has parity with the client, with two major differences:

- Each method returns a promise rather than accepting a callback. Since promises can only have a single resolution value, commands that return two values (like `reserve` and `peek`) will resolve with a two-value array:

```js
client.reserve().then(([jobId, payload]) => /* ... */);
```

- Methods names are camel-cased versions of the snake-cased Beanstalk commands, since camel-casing is idiomatic in JavaScript.

You can also avoid using the connect event listener since `connect()` returns a promise:

```js
const Beanstalk = require("fee-fi-fo-fum");
const client = new Beanstalk();
client.connect().then(() => /* connected now ... */ );

// still may want to listen for `error` and `close` events on client
```

The only other difference is that errors that come from this module (usually from a `.catch()` handler) are error objects rather than strings, as is the case in fivebeans.

Why?
- Out-of-the-box promise support
- Prefer not to tie the basic client to a worker framework.
- Idiomatic ES6 makes it marginally easier to hack on.
