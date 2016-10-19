import fetch from 'node-fetch';
import winston from 'winston';
const logger = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)({
      timestamp: true,
      colorize: true,
    }),
    new (winston.transports.File)({
      level: 'debug',
      filename: 'server.log',
      json: false,
    }),
  ],
});


const BOT_NAME = 'pledge';
const API_ROOT = 'http://pledge.keri.warr.ca';
const OPERATIONS_PATH = '/operations';
const WAGERS_PATH = '/wagers';

const ID_REGEX = /^\d+$/;
const MESSAGE_REGEX = /^(?:I )?pledge (.+)$/i;
// The second dash is actually a unicode concatenated double dash
const OPTION_REGEX = /^(--|—)/;

const DEFAULT_CURRENCY = 'CAD';
const CURRENCY_MAP = {
  // default currency
  CAD: ':flag-ca:',
  USD: ':flag-us:',
};

export default function pledge(message, users, response) {
  const messageMatches = message.text.match(MESSAGE_REGEX);
  // TODO: This check is ineffective I think, <2 !=> <2 matches
  if (!messageMatches || messageMatches.length < 2) return;

  const messageCommandArgs = messageMatches[1].split(' ');
  const command = messageCommandArgs[0].replace(OPTION_REGEX, '');
  const argString = messageCommandArgs.slice(1).join(' ');

  const userId = message.user;
  const text = message.text;
  const user = users[userId];
  const fullName = user.real_name;

  if (fullName === 'Shiro Neko') {
    return response.end("fuck off");
  }

  switch (command) {
    case '-w':
    case 'wagers':
    case 'all':
      handleList(response);
      break;
    case '-l':
    case 'available':
    case 'lited':

      break;
    case '-s':
    case 'get':
    case 'show':
      handleShow(response, argString);
      break;
    case '-a':
    case 'accept':
      handleAccept(response, argString, fullName);
      break;
    case '-r':
    case 'reject':

      break;
    case '-t':
    case 'take':

      break;
    case 'cancel':

      break;
    case '-c':
    case 'close':

      break;
    case 'appeal':

      break;
    case 'unaccepted':

      break;
    case 'rejected':

      break;
    case 'accepted':
    case 'open':

      break;
    case 'closed':

      break;
    case 'completed':

      break;
    case 'appealed':

      break;
    case '-m':
    case 'mine':
    case 'me':

      break;
    case '-u':
    case 'user':

      break;
    case '-h':
    case 'how':
    case 'help':

      break;
    default:

  }
}

function handleList(res) {
  return fetch(API_ROOT + WAGERS_PATH).then(fetchResponse => fetchResponse.text()).then(body => {
    let text = JSON.parse(body).reduce(
      (p, n) => (p + getWagerDescription(n)),
      ''
    );
    res.end(text);
  });
}

function handleShow(res, argList) {
  const args = argList.split(' ');
  const id = getIdFromArg(args[0]);
  fetch(API_ROOT + WAGERS_PATH + `/${id}`).then(fetchResponse => fetchResponse.text()).then(body => {
    const desciption = getWagerDescription(JSON.parse(body));
    if (desciption) {
      res.end(desciption);
    } else {
      res.end('Sorry, couldn\'t find that wager :(');
    }
  });
}

function getWagerDescription(wager) {
  const id = wager.id;
  if (!id) return false;
  const makerOffer = getOffer({
    description: wager.maker_offer_description,
    amount: wager.maker_offer_amount,
    currency: wager.maker_offer_currency,
  });
  const takerOffer = getOffer({
    description: wager.taker_offer_description,
    amount: wager.taker_offer_amount,
    currency: wager.taker_offer_currency,
  });
  const outcome = wager.outcome ? ` ~ ${wager.outcome}` : '';

  const maker = wager.maker && wager.maker.split(' ')[0];
  const taker = wager.taker && wager.taker.split(' ')[0];

  return `\`${id}\`: _${maker}'s_ ${makerOffer} to _${taker}'s_ ${takerOffer}${outcome}\n`;
}

function getOffer({description, amount, currency = ''}) {
  const defaultedCurrency = currency === DEFAULT_CURRENCY ? '' : currency
  const shortenedCurrency = CURRENCY_MAP[defaultedCurrency] || defaultedCurrency;
  let offer;
  if (description) {
    offer = `"${description}"`;
  } else {
    offer = `*${stripCentsFromString(amount)}* ${shortenedCurrency}`;
  }
  return offer;
}

function stripCentsFromString(str = '') {
  const withoutZeroes = str.replace(/(\.[0-9]*?)0+$/, '$1');
  const withoutPeriod = withoutZeroes.replace(/\.$/, '');
  return withoutPeriod;
}

function handleAccept(res, args, fullName) {
  const id = getIdFromArg(args[0]);

  const body = { operation: {
    kind: 'accept',
    wager_id: id,
    user: fullName,
  } };

  fetch(API_ROOT + OPERATIONS_PATH, {
    body: JSON.stringify(body),
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    }
  }).then(response => {
    res.end('You\'ve accepted the wager!');
  }, error => {
    res.end('The backed didn\'t like that request. You should apologize');
  });
}

function getIdFromArg(arg) {
  const matches = arg && arg.match(ID_REGEX);
  return matches && matches[0] ? matches[0] : false;
}
