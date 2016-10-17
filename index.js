var botstrap = require('botstrap');
var http = require('http');

var bot = botstrap({
  token: "",
});

var options = {
  host: 'pledge.keri.warr.ca',
  path: '/operations',
  port: '80',
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
};

function create_wager(params) {
  callback = function(response) {
    var str = ''
    response.on('data', function (chunk) {
      str += chunk;
    });

    response.on('end', function () {
      console.log(str);
    });
  }

  var req = http.request(options, callback);
  req.write(JSON.stringify(params));
  req.end();
}

bot.command('pledge', function pledge(argv, response) {
  if (!argv || argv.length < 5) {
    response.write('wtf u talking about');
    return;
  }
  var maker = argv[1].replace(/_/, ' ');
  var taker = argv[2].replace(/_/, ' ');
  var outcome = argv[3].replace(/_/, ' ');
  var wagers = argv[4].split('#');
  var wager1 = wagers && wagers[0] && wagers[0].match(/^(\d+(\.\d{2})?)([A-Z]{3})?$/);
  var makerOfferAmount = wager1[1];
  var makerOfferCurrency = wager1[3] || 'CAD';
  var wager2 = wagers && wagers[1] && wagers[1].match(/^(\d+(\.\d{2})?)([A-Z]{3})?$/);
  var takerOfferAmount = wager2[1];
  var takerOfferCurrency = wager2[3] || 'CAD';
  if (maker && taker && outcome && makerOfferAmount && makerOfferCurrency && takerOfferAmount && takerOfferCurrency) {
    var params = {
      operation: { kind: 'propose' },
      wager: {
        maker: maker,
        taker: taker,
        outcome: outcome,
        maker_offer_amount: makerOfferAmount,
        maker_offer_currency: makerOfferCurrency,
        taker_offer_amount: takerOfferAmount,
        taker_offer_currency: takerOfferCurrency,
      },
    };
    console.log(params);
    create_wager(params);
    response.write('I made you a wager dawg');
  } else {
    response.write('wtf u talking about');
  }
});

bot.start();
