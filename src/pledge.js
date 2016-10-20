import fetch from 'node-fetch';
import _ from 'lodash';

import logger from './logger';


const API_ROOT = 'http://pledge.keri.warr.ca';
const OPERATIONS_PATH = '/operations';
const WAGERS_PATH = '/wagers';

const ID_REGEX = /^\d+$/;
const MESSAGE_REGEX = /^(?:I )?pledge (.+)$/i;
// The second option is actually a unicode double dash
const OPTION_REGEX = /^(--|—)/;
const CENTS_REGEX = /\.0+$/;
// const TAG_REGEX = /^@([a-zA-Z0-9.-_]{1,21})$/;
const USER_ID_REGEX = /^<@(U[A-Z0-9]+)>$/;
const PLEDGE_REGEX = /^(?:"([\w ]+)"|(\d+(?:\.\d{2})?))([A-Z]{3})?#(?:"([\w ]+)"|(\d+(?:\.\d{2})?))([A-Z]{3})?(?: that)? (.+)$/;

const DEFAULT_CURRENCY = 'CAD';
const CURRENCY_MAP = {
  CAD: ':flag-ca:',
  USD: ':flag-us:',
};

const pastTenseify = (verb) => {
  if (verb === 'take') return 'taken';
  else if (verb === 'cancel') return 'cancelled';
  return `${verb}ed`;
};

const ERRORS = {
  operationFailure: kind => `Sorry, you can't ${kind} that wager.`,
  wagerNotFound: 'I couldn\'t find that wager.',
  serverFailure: 'Sorry, the request failed.',
  missingIdArgument: 'You must specify an id.',
  missingUserArgument: 'You must specify a @user',
  nonExistentUser: 'That user is not in this team.',
  noResults: kind => `I couldn't find any${kind ? ` ${kind}` : ''} wagers.`,
  malformedPledge: 'Sorry, I couldn\'t understand that pledge.',
  proposeFailure: 'Sorry, the backend didn\'t like that wager',
  invalidCommand: 'That is not a valid command.',
};
const MESSAGES = {
  operationSuccess: kind => `You've ${pastTenseify(kind)} the wager!`,
  proposeSuccess: 'You\'ve created a wager!',
};

const stripZeroCents = str => str && str.replace(CENTS_REGEX, '');

const getIdFromStr = str => str && ((str.match(ID_REGEX) || [])[0] || null);

const getUserIdFromStr = str =>
  str && ((str.match(USER_ID_REGEX) || [])[1] || null);
//
// const getUserNameFromTag = str =>
//   str && ((str.match(TAG_REGEX) || [])[1] || null);

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

const nameToTag = ({ name, userNameMap }) => {
  const tag = (_.find(userNameMap, user => user.real_name === name) || {}).name;
  return tag ? `@${tag}` : null;
};

const userIdToName = ({ id, userNameMap }) => {
  const name = (_.find(userNameMap, user => user.id === id) || {}).real_name;
  return name || null;
};

// const tagToName = ({ tag, userNameMap }) => {
//   const userName = getUserNameFromTag(tag);
//   const name = (_.find(userNameMap, user => user.name === userName) || {}).real_name;
//   return name || null;
// }

const baseWagerDescription = ({ showStatus = false } = {}, { userNameMap }) =>
(wager) => {
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
  const makerName = wager.maker && wager.maker.split(' ')[0];
  const takerName = wager.taker && wager.taker.split(' ')[0];
  const maker = nameToTag({ name: wager.maker, userNameMap }) || makerName;
  const taker = nameToTag({ name: wager.taker, userNameMap }) || takerName;
  const status = showStatus ? `-${italic(wager.status)}` : '';

  return `${pre(id)}${status}: ${maker}'s ${makerOffer} to ${taker}'s \
${takerOffer}${outcome}`;
};

const getWagerDescription = baseWagerDescription.bind(null, {});

const getWagerStatusDescription = baseWagerDescription.bind(null, {
  showStatus: true,
});

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
        data
      )
    );

const createOperation = ({ operation, wager }) =>
  fetchWrapper({
    url: `${API_ROOT}${OPERATIONS_PATH}`,
    data: { operation, wager },
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

const requiresUser = handler => (options) => {
  const args = options.argString && options.argString.split(' ');
  if (!args || args.length === 0 || !args[0]) {
    return options.sendReply(ERRORS.missingUserArgument);
  }
  const usersName = userIdToName({
    id: getUserIdFromStr(args[0]),
    userNameMap: options.userNameMap,
  });
  if (!usersName) return options.sendReply(ERRORS.nonExistentUser);
  return handler({ usersName, ...options });
};

const makeOperationHandler = ({ kind }) =>
  requiresId(({ sendReply, id, fullName }) =>
    createOperation({ operation: { kind, wager_id: id, user: fullName } })
      .then(() => sendReply(MESSAGES.operationSuccess(kind)))
      .catch(() => sendReply(ERRORS.operationFailure(kind))));

const makeShowStatusHandler = ({ status }) => ({ sendReply, userNameMap }) =>
  getWagers({ filters: [(wager => wager.status === status)] })
    .then(wagers => sendReply(
      wagers
        .map(getWagerDescription({ userNameMap }))
        .join('\n')
        || ERRORS.noResults(status)
    )).catch(() => sendReply(ERRORS.serverFailure));

const userInvoledInWager = ({ user }) => wager =>
  wager.maker === user || wager.taker === user || wager.arbiter === user;

const handleAll = ({ sendReply, userNameMap }) =>
  getWagers({ filters: [(wager => wager.status !== 'cancelled')] })
    .then(wagers => sendReply(
      wagers.map(getWagerStatusDescription({ userNameMap })).join('\n')
        || ERRORS.noResults()
    )).catch(() => sendReply(ERRORS.serverFailure));

const handleShow = requiresId(({ sendReply, id }) =>
  getWager({ id })
    .then(wager => sendReply(getWagerDescription(wager)))
    .catch(() => sendReply(ERRORS.wagerNotFound)));

const handleAccept = makeOperationHandler({ kind: 'accept' });
const handleReject = makeOperationHandler({ kind: 'reject' });
const handleTake = makeOperationHandler({ kind: 'take' });
const handleCancel = makeOperationHandler({ kind: 'cancel' });
const handleClose = makeOperationHandler({ kind: 'close' });
const handleAppeal = makeOperationHandler({ kind: 'appeal' });

const handleListed = makeShowStatusHandler({ status: 'listed' });
const handleUnaccepted = makeShowStatusHandler({ status: 'unaccepted' });
const handleRejected = makeShowStatusHandler({ status: 'rejected' });
const handleAccepted = makeShowStatusHandler({ status: 'accepted' });
const handleClosed = makeShowStatusHandler({ status: 'closed' });
const handleCompleted = makeShowStatusHandler({ status: 'completed' });
const handleAppealed = makeShowStatusHandler({ status: 'appealed' });
const handleCancelled = makeShowStatusHandler({ status: 'cancelled' });

const handleMine = ({ sendReply, fullName, userNameMap }) =>
  getWagers({ filters: [userInvoledInWager({ user: fullName })] })
    .then(wagers => sendReply(
      wagers.map(getWagerStatusDescription({ userNameMap })).join('\n')
        || ERRORS.noResults('of your')
    )).catch(() => sendReply(ERRORS.serverFailure));

const handleUser = requiresUser(({ sendReply, usersName, userNameMap }) =>
  getWagers({ filters: [userInvoledInWager({ user: usersName })] })
    .then(wagers => sendReply(
      wagers.map(getWagerStatusDescription({ userNameMap })).join('\n')
        || ERRORS.noResults('of their')
    )).catch(() => sendReply(ERRORS.serverFailure)));

const handleDefault = requiresUser(({ sendReply, fullName, argString, usersName }) => {
  const args = argString && argString.split(' ').slice(1).join(' ');
  const pledgeMatches = args && args.match(PLEDGE_REGEX);
  if (!pledgeMatches || pledgeMatches.length < 8) {
    return sendReply(ERRORS.malformedPledge);
  }
  return createOperation({
    operation: { kind: 'propose' },
    wager: {
      maker: fullName,
      taker: usersName,
      maker_offer_description: pledgeMatches[1],
      maker_offer_amount: parseFloat(pledgeMatches[2]),
      maker_offer_currency: pledgeMatches[3] || DEFAULT_CURRENCY,
      taker_offer_description: pledgeMatches[4],
      taker_offer_amount: parseFloat(pledgeMatches[5]),
      taker_offer_currency: pledgeMatches[6] || DEFAULT_CURRENCY,
      outcome: pledgeMatches[7],
    },
  }).then(() => sendReply(MESSAGES.proposeSuccess))
    .catch(() => sendReply(ERRORS.proposeFailure));
});

const makeSendReply = response => (reply) => {
  logger.info(`Sending response: ${reply}`);
  response.end(reply);
};

export default function pledge(message, users, response) {
  const messageMatches = message.text && message.text.match(MESSAGE_REGEX);
  if (!messageMatches || messageMatches.length < 2) return;
  logger.info(`Received message: ${message.text}`);

  const sendReply = makeSendReply(response);
  const messageCommandArgs = messageMatches[1].split(' ');
  const command = messageCommandArgs[0].replace(OPTION_REGEX, '');
  const argString = messageCommandArgs.slice(1).join(' ');
  const userId = message.user;
  const user = users[userId];
  const fullName = user.real_name;
  // const tag = user.name;
  const userNameMap = _.values(users).map(
    u => _.pick(u, ['name', 'real_name', 'id'])
  );

  const commandParams = { sendReply, argString, fullName, userNameMap };

  switch (command) {
    case '-w':
    case 'wagers':
    case 'all':
      handleAll(commandParams);
      break;
    case '-s':
    case 'get':
    case 'show':
      handleShow(commandParams);
      break;
    case '-a':
    case 'accept':
      handleAccept(commandParams);
      break;
    case '-r':
    case 'reject':
      handleReject(commandParams);
      break;
    case '-t':
    case 'take':
      handleTake(commandParams);
      break;
    case 'cancel':
      handleCancel(commandParams);
      break;
    case '-c':
    case 'close':
      handleClose(commandParams);
      break;
    case 'appeal':
      handleAppeal(commandParams);
      break;
    case '-l':
    case 'available':
    case 'listed':
      handleListed(commandParams);
      break;
    case 'unaccepted':
      handleUnaccepted(commandParams);
      break;
    case 'rejected':
      handleRejected(commandParams);
      break;
    case 'accepted':
    case 'open':
      handleAccepted(commandParams);
      break;
    case 'closed':
      handleClosed(commandParams);
      break;
    case 'completed':
      handleCompleted(commandParams);
      break;
    case 'appealed':
      handleAppealed(commandParams);
      break;
    case 'cancelled':
      handleCancelled(commandParams);
      break;
    case '-m':
    case 'mine':
    case 'me':
      handleMine(commandParams);
      break;
    case '-u':
    case 'user':
      handleUser(commandParams);
      break;
    case '-h':
    case 'how':
    case 'help':
      sendReply('Hahaha. did you think I would document this shit?\nAsk me again tomorrow.');
      break;
    default:
      if (command[0] === '@') {
        sendReply(ERRORS.nonExistentUser);
        return;
      }
      if (!command.match(USER_ID_REGEX)) {
        sendReply(ERRORS.invalidCommand);
        return;
      }
      handleDefault({
        sendReply,
        fullName,
        userNameMap,
        argString: `${command} ${argString}`,
      });
  }
}
