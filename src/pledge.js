import fetch from 'node-fetch';
import logger from './logger';


const API_ROOT = 'http://pledge.keri.warr.ca';
const OPERATIONS_PATH = '/operations';
const WAGERS_PATH = '/wagers';

const ID_REGEX = /^\d+$/;
const MESSAGE_REGEX = /^(?:I )?pledge (.+)$/i;
// The second dash is actually a unicode double dash
const OPTION_REGEX = /^(--|—)/;
const CENTS_REGEX = /\.0+$/;

const DEFAULT_CURRENCY = 'CAD';
const CURRENCY_MAP = {
  CAD: ':flag-ca:',
  USD: ':flag-us:',
};

const ERRORS = {
  wagerNotFound: 'I couldn\'t find that wager.',
  acceptFailure: 'Sorry, you can\'t accept that wager.',
  serverFailure: 'Sorry, the request failed.',
  missingIdArgument: 'You must specify an id.',
};
const MESSAGES = {
  acceptSuccess: 'You\'ve accepted the wager!',
};

const stripZeroCents = str => str && str.replace(CENTS_REGEX, '');

const getIdFromStr = str => str && ((str.match(ID_REGEX) || [])[0] || null);

const italic = str => str && `_${str}_`;

const bold = str => str && `*${str}*`;

const pre = str => str && `\`${str}\``;

const formatCurrency = ({ currency }) => {
  const defaultedCurrency = currency === DEFAULT_CURRENCY ? '' : currency;
  return CURRENCY_MAP[defaultedCurrency] || defaultedCurrency;
};

const getOfferDescription = ({ description, amount, currency }) => {
  const formattedCurrency = formatCurrency(currency);
  const currencyDisplay = formattedCurrency ? ` ${formattedCurrency}` : '';
  return description
    ? `"${description}"`
    : `${bold(stripZeroCents(amount))}${currencyDisplay}`;
};

const getWagerDescription = (wager) => {
  const id = wager.id;
  if (!id) return null;
  const makerOffer = getOfferDescription({
    description: wager.maker_offer_description,
    amount: wager.maker_offer_amount,
    currency: wager.maker_offer_currency,
  });
  const takerOffer = getOfferDescription({
    description: wager.taker_offer_description,
    amount: wager.taker_offer_amount,
    currency: wager.taker_offer_currency,
  });
  const outcome = wager.outcome ? ` ~ ${wager.outcome}` : '';
  const maker = wager.maker && wager.maker.split(' ')[0];
  const taker = wager.taker && wager.taker.split(' ')[0];

  return `${pre(id)}: ${italic(maker)}'s ${makerOffer} to ${italic(taker)}'s \
${takerOffer}${outcome}\n`;
};

const getInit = ({ data }) =>
(data
  ? {
    body: JSON.stringify(data),
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  } : {
    method: 'GET',
  });

const fetchWrapper = ({ url, data }) => {
  const init = getInit({ data });
  logger.info(`${init.method}: ${url}`);
  return fetch(url, init)
    .then((response) => {
      if (response.ok) {
        return response.text();
      }
      throw new Error(response.statusText);
    })
    .then(text => JSON.parse(text))
    .catch((error) => {
      logger.error(`Server responded with: ${error.message}`);
      throw error;
    });
};

const getWager = ({ id }) => fetchWrapper({
  url: `${API_ROOT}${WAGERS_PATH}/${id}`,
});

const getWagers = ({ filters = [] } = {}) =>
  fetchWrapper({ url: `${API_ROOT}${WAGERS_PATH}` })
    .then(data => filters.reduce(
      (wagers, filter) => wagers.filter(filter),
      data)
    );

const createOperation = operation =>
  fetchWrapper({
    url: `${API_ROOT}${OPERATIONS_PATH}`,
    data: { operation },
  });

const requiresId = handler => (options) => {
  const args = options.argString && options.argString.split(' ');
  if (!args || args.length === 0 || !args[0]) {
    return options.sendReply(ERRORS.missingIdArgument);
  }
  const id = getIdFromStr(args[0]);
  if (!id) return options.sendReply(ERRORS.missingIdArgument);
  return handler({ id, ...options });
};

const handleAll = ({ sendReply }) =>
  getWagers()
    .then(wagers => sendReply(wagers.map(getWagerDescription).join('')))
    .catch(() => sendReply(ERRORS.serverFailure));

const handleShow = requiresId(({ sendReply, id }) =>
  getWager({ id })
    .then(wager => sendReply(getWagerDescription(wager)))
    .catch(() => sendReply(ERRORS.wagerNotFound)));

const handleAccept = requiresId(({ sendReply, id, fullName }) =>
  createOperation({ kind: 'accept', wager_id: id, user: fullName })
    .then(() => sendReply(MESSAGES.acceptSuccess))
    .catch(() => sendReply(ERRORS.acceptFailure)));

const makeSendReply = response => (reply) => {
  logger.info(`Sending response: ${reply}`);
  response.end(reply);
};

export default function pledge(message, users, response) {
  const messageMatches = message.text.match(MESSAGE_REGEX);
  if (!messageMatches || messageMatches.length < 2) return;
  logger.info(`Received message: ${message.text}`);

  const sendReply = makeSendReply(response);
  const messageCommandArgs = messageMatches[1].split(' ');
  const command = messageCommandArgs[0].replace(OPTION_REGEX, '');
  const argString = messageCommandArgs.slice(1).join(' ');
  const userId = message.user;
  // const text = message.text;
  const user = users[userId];
  const fullName = user.real_name;

  switch (command) {
    case '-w':
    case 'wagers':
    case 'all':
      handleAll({ sendReply });
      break;
    case '-l':
    case 'available':
    case 'lited':

      break;
    case '-s':
    case 'get':
    case 'show':
      handleShow({ sendReply, argString });
      break;
    case '-a':
    case 'accept':
      handleAccept({ sendReply, argString, fullName });
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
