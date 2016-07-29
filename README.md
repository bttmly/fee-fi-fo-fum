# fee-fi-fo-fum

This is an ES6 port/rewrite of the [fivebeans client](https://github.com/ceejbot/fivebeans/blob/master/lib/client.js). Refer to the docs there, this module has parity with the client, with the caveat that each method returns a promise rather than taking a callback.

The only other difference is that errors that come from this module (usually from a `.catch()` handler) are error objects rather than strings, as is the case in fivebeans.

Why?
- Prefer not to tie the basic client to a worker framework.
- Idiomatic ES6 makes it marginally easier to hack on. Classes and Promises in particular are used here.

