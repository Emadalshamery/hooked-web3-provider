

"use strict";

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; desc = parent = getter = undefined; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; continue _function; } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var factory = function factory(web3) {
  var HookedWeb3Provider = (function (_web3$providers$HttpProvider) {
    _inherits(HookedWeb3Provider, _web3$providers$HttpProvider);

    function HookedWeb3Provider(_ref) {
      var host = _ref.host;
      var transaction_signer = _ref.transaction_signer;

      _classCallCheck(this, HookedWeb3Provider);

      _get(Object.getPrototypeOf(HookedWeb3Provider.prototype), "constructor", this).call(this, host);
      this.transaction_signer = transaction_signer;

      // Cache of the most up to date transaction counts (nonces) for each address
      // encountered by the web3 provider that's managed by the transaction signer.
      this.global_nonces = {};
    }

    // We can't support *all* synchronous methods because we have to call out to
    // a transaction signer. So removing the ability to serve any.

    _createClass(HookedWeb3Provider, [{
      key: "send",
      value: function send(payload) {
        throw new Error("HookedWeb3Provider does not support synchronous methods. Please provide a callback.");
      }

      // Catch the requests at the sendAsync level, rewriting all sendTransaction
      // methods to sendRawTransaction, calling out to the transaction_signer to
      // get the data for sendRawTransaction.
    }, {
      key: "sendAsync",
      value: function sendAsync(payload, callback) {
        var _this = this;

        var finishedWithRewrite = function finishedWithRewrite() {
          _get(Object.getPrototypeOf(HookedWeb3Provider.prototype), "sendAsync", _this).call(_this, payload, callback);
        };

        var requests = payload;

        if (!(payload instanceof Array)) {
          requests = [payload];
        }

        this.rewritePayloads(0, requests, {}, finishedWithRewrite);
      }

      // Rewrite all eth_sendTransaction payloads in the requests array.
      // This takes care of batch requests, and updates the nonces accordingly.
    }, {
      key: "rewritePayloads",
      value: function rewritePayloads(index, requests, session_nonces, finished) {
        var _this2 = this;

        if (index >= requests.length) {
          finished();
          return;
        }

        var payload = requests[index];

        // Function to remove code duplication for going to the next payload
        var next = function next(err) {
          if (err != null) {
            finished(err);
            return;
          }
          _this2.rewritePayloads(index + 1, requests, session_nonces, finished);
        };

        // If this isn't a transaction we can modify, ignore it.
        if (payload.method != "eth_sendTransaction") {
          next();
          return;
        }

        var tx_params = payload.params[0];
        var sender = tx_params.from;

        this.transaction_signer.hasAddress(sender, function (err, has_address) {
          if (err != null || has_address == false) {
            next(err);
            return;
          }

          // Get the nonce, requesting from web3 if we haven't already requested it in this session.
          // Remember: "session_nonces" is the nonces we know about for this batch of rewriting (this "session").
          //           Having this cache makes it so we only need to call getTransactionCount once per batch.
          //           "global_nonces" is nonces across the life of this provider.
          var getNonce = function getNonce(done) {
            // If a nonce is specified in our nonce list, use that nonce.
            var nonce = session_nonces[sender];
            if (nonce != null) {
              done(null, nonce);
            } else {
              // Include pending transactions, so the nonce is set accordingly.
              // Note: "pending" doesn't seem to take effect for some Ethereum clients (geth),
              // hence the need for global_nonces.
              web3.eth.getTransactionCount(sender, "pending", function (err, new_nonce) {
                if (err != null) {
                  done(err);
                } else {
                  done(null, new_nonce.valueOf());
                }
              });
            }
          };

          // Get the nonce, requesting from web3 if we need to.
          // We then store the nonce and update it so we don't have to
          // to request from web3 again.
          getNonce(function (err, nonce) {
            if (err != null) {
              finished(err);
              return;
            }

            // Set the expected nonce, and update our caches of nonces.
            // Note that if our session nonce is lower than what we have cached
            // across all transactions (and not just this batch) use our cached
            // version instead, even if
            var final_nonce = Math.max(nonce, _this2.global_nonces[sender] || 0);

            // Update the transaction parameters.
            tx_params.nonce = web3.toHex(final_nonce);

            // Update caches.
            session_nonces[sender] = final_nonce + 1;
            _this2.global_nonces[sender] = final_nonce + 1;

            // If our transaction signer does represent the address,
            // sign the transaction ourself and rewrite the payload.
            _this2.transaction_signer.signTransaction(tx_params, function (err, raw_tx) {
              if (err != null) {
                next(err);
                return;
              }

              payload.method = "eth_sendRawTransaction";
              payload.params = [raw_tx];
              next();
            });
          });
        });
      }
    }]);

    return HookedWeb3Provider;
  })(web3.providers.HttpProvider);

  return HookedWeb3Provider;
};

var _module = _module || undefined;
if (_module != null) {
  _module.exports = factory(require("web3"));
} else {
  window.HookedWeb3Provider = factory(web3);
}