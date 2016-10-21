import { camelizeKeys, decamelizeKeys } from 'humps';
import _ from 'lodash';
import fetch from 'node-fetch';

import logger from './logger';


const API_ROOT = 'http://pledge.keri.warr.ca';
const OPERATIONS_PATH = '/operations';
const WAGERS_PATH = '/wagers';

const ID_REGEX = /^\d+$/;
const MESSAGE_REGEX = /^(?:I )?(?:@?pledge|<@U1V3QU2BU>) (.+)$/i;
// The second option is a unicode double dash
const OPTION_REGEX = /^(--|—)/;
const ZERO_CENTS_REGEX = /\.0{1,2}$/;
const USER_ID_REGEX = /^<@(U[A-Z0-9]+)>$/;
const OFFER_REGEX_STRING = '(?:"([\\w ]+)"|(\\d+(?:\\.\\d{2})?))([A-Z]{3})?';
const PLEDGE_REGEX = new RegExp(
  `^${OFFER_REGEX_STRING}#${OFFER_REGEX_STRING}(?: that)? (.+)$`, 'i'
);
const STATUS_CODE_REGEX = /^\d{3}$/;

const USEFUL_USER_KEYS = ['name', 'real_name', 'id'];

const DEFAULT_CURRENCY = 'CAD';
const CURRENCY_EMOJI_MAP = {
  CAD: ':flag-ca:',
  USD: ':flag-us:',
  SZL: ':szl:',
  BYR: ':beer:',
};

const STATUSES = {
  UNACCEPTED: 'unaccepted',
  LISTED: 'listed',
  UNCONFIRMED: 'unconfirmed',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
  CLOSED: 'closed',
  COMPLETED: 'completed',
  APPEALED: 'appealed',
};
const STATUSES_ARRAY = _.values(STATUSES);
const KINDS = {
  TAKE: 'take',
  ACCEPT: 'accept',
  REJECT: 'reject',
  CANCEL: 'cancel',
  CLOSE: 'close',
  APPEAL: 'appeal',
  PROPOSE: 'propose',
};
const ERROR_STATUSES = [
  STATUSES.REJECTED,
  STATUSES.CANCELLED,
  STATUSES.EXPIRED,
  STATUSES.APPEALED,
];
const KIND_PRESENT_PERFECT_TENSES = {
  [KINDS.TAKE]: 'taken',
  [KINDS.CANCELLED]: 'cancelled',
};

const MESSAGES = {
  PROPOSE_SUCCESS: 'You\'ve created a wager!',
  SERVER_FAILURE: '/shrug Sorry, something went wrong.',
  MISSING_ID_ARGUMENT: 'You must specify an id.',
  MISSING_USER_ARGUMENT: 'You must specify a @user',
  NON_EXISTENT_USER: 'That user is not in this team.',
  MALFORMED_PLEDGE: 'Sorry, I couldn\'t understand that pledge.',
  PROPOSE_FAILURE: 'Sorry, the backend didn\'t like that wager',
  INVALID_COMMAND: 'That is not a valid command.',
};

const COMMAND_DETAILS = {
  ALL: {
    name: 'all',
    aliases: ['wagers'],
    flag: 'w',
  },
  SHOW: {
    name: 'show',
    aliases: ['get', 'wager'],
    flag: 's',
  },
  HELP: {
    name: 'help',
    aliases: ['how', 'why', 'what'],
    flag: 'h',
  },
  [KINDS.TAKE]: {
    name: KINDS.TAKE,
    aliases: [],
    flag: 't',
  },
  [KINDS.ACCEPT]: {
    name: KINDS.ACCEPT,
    aliases: ['affirm'],
    flag: 'a',
  },
  [KINDS.REJECT]: {
    name: KINDS.REJECT,
    aliases: ['remove'],
    flag: 'r',
  },
  [KINDS.CANCEL]: {
    name: KINDS.CANCEL,
    aliases: ['remove', 'destroy', 'delete'],
    flag: 'c',
  },
  [KINDS.CLOSE]: {
    name: KINDS.CLOSE,
    aliases: ['complete', 'finish'],
    flag: 'l',
  },
  [KINDS.APPEAL]: {
    name: KINDS.APPEAL,
    aliases: [],
    flag: 'p',
  },
};

const FILTER_DETAILS = Object.assign({
  MINE: {
    name: 'mine',
    aliases: ['me', 'my'],
    flag: 'm',
  },
  USER: {
    name: 'user',
    aliases: [],
    flag: 'u',
  },
}, _.zipObject(STATUSES_ARRAY, STATUSES_ARRAY.map(status => ({
  name: status,
  aliases: [],
}))));

/**
 * Converts a kind verb into its present perfect tense.
 */
const presentPerfectify = kind =>
  KIND_PRESENT_PERFECT_TENSES[kind] || `${kind}ed`;

const MESSAGE_FUNCTIONS = {
  operationSuccess: kind => `You've ${presentPerfectify(kind)} the wager!`,
  noResults: kind => `I couldn't find any${kind ? ` ${kind}` : ''} wagers.`,
};

const STATUS_CODE_MESSAGE_FUNCTIONS = {
  404: () => 'That wager doesn\'t exist.',
  422: kind => `You can't ${kind} that wager.`,
};

/**
 * Removes a period followed by one or two zeroes from the end of str.
 */
const stripZeroCents = str => str && str.replace(ZERO_CENTS_REGEX, '');

/**
 * If str is a sequence of digits, return it, otherwise return null.
 */
const getIdFromStr = str => str && ((str.match(ID_REGEX) || [])[0] || null);

/**
 * If str is a user id string from slack, i.e. wrapped in angle brackets,
 * return the user id inside, else return null.
 */
const getUserIdFromStr = str =>
  str && ((str.match(USER_ID_REGEX) || [])[1] || null);

/**
 * Slack italicization markup
 */
const italic = str => str && `_${str}_`;

/**
 * Slack boldicization markup
 */
const bold = str => str && `*${str}*`;

/**
 * Slack codeicization markup
 */
const pre = str => str && `\`${str}\``;

/**
 * Accepts a currency code as per ISO 4217. If it is the default currency,
 * return the empty string, if it has a corresponding emoji, return the emoji
 * string, else return the original string.
 */
const formatCurrency = ({ currency }) => {
  const defaultedCurrency = currency === DEFAULT_CURRENCY ? '' : currency;
  return CURRENCY_EMOJI_MAP[defaultedCurrency] || defaultedCurrency;
};

/**
 * Formats data representation of an offer for slack.
 */
const getOfferDescription = ({ description, amount, currency }) => {
  const formattedCurrency = formatCurrency({ currency });
  const currencyDisplay = formattedCurrency ? ` ${formattedCurrency}` : '';
  return description
    ? `"${description}"`
    : `${bold(stripZeroCents(amount))}${currencyDisplay}`;
};

/**
 * Converts a string to use equivalet looking unicode characters so that
 * they dont' behave as tag words on slack.
 */
const untagWord = ({ word }) => {
  const homoglyphReplacements = [
    // basically identical replacements
    [',', '\u201A'], ['-', '\u2010'], [';', '\u037E'], ['A', '\u0391'],
    ['B', '\u0392'], ['C', '\u0421'], ['D', '\u216E'], ['E', '\u0395'],
    ['H', '\u0397'], ['I', '\u0399'], ['J', '\u0408'], ['K', '\u039A'],
    ['L', '\u216C'], ['M', '\u039C'], ['N', '\u039D'], ['O', '\u039F'],
    ['P', '\u03A1'], ['S', '\u0405'], ['T', '\u03A4'], ['V', '\u2164'],
    ['X', '\u03A7'], ['Y', '\u03A5'], ['Z', '\u0396'], ['a', '\u0430'],
    ['c', '\u03F2'], ['d', '\u217E'], ['e', '\u0435'], ['i', '\u0456'],
    ['j', '\u0458'], ['l', '\u217C'], ['m', '\u217F'], ['o', '\u03BF'],
    ['p', '\u0440'], ['s', '\u0455'], ['v', '\u03BD'], ['x', '\u0445'],
    ['y', '\u0443'], ['\u00DF', '\u03B2'], ['\u00E4', '\u04D3'],
    ['\u00F6', '\u04E7'], ['@', '\uFF20'], ['0', '\uFF10'],
    // // similar replacements
    // ['/', '\u2044'], ['F', '\u03DC'], ['G', '\u050C'], ['\u00C4', '\u04D2'],
    // ['\u00D6', '\u04E6'],
    // // fixed width replacements
    // ['*', '\uFF0A'], ['!', '\uFF01'], ['"', '\uFF02'], ['#', '\uFF03'],
    // ['$', '\uFF04'], ['%', '\uFF05'], ['&', '\uFF06'], ['\'', '\uFF07'],
    // ['(', '\uFF08'], [')', '\uFF09'], ['+', '\uFF0B'], ['.', '\uFF0E'],
    // ['0', '\uFF10'], ['1', '\uFF11'], ['2', '\uFF12'], ['3', '\uFF13'],
    // ['4', '\uFF14'], ['5', '\uFF15'], ['6', '\uFF16'], ['7', '\uFF17'],
    // ['8', '\uFF18'], ['9', '\uFF19'], [':', '\uFF1A'], ['<', '\uFF1C'],
    // ['=', '\uFF1D'], ['>', '\uFF1E'], ['?', '\uFF1F'],  ['Q', '\uFF31'],
    // ['R', '\uFF32'], ['U', '\uFF35'], ['W', '\uFF37'], ['[', '\uFF3B'],
    // ['\\', '\uFF3C'], [']', '\uFF3D'], ['^', '\uFF3E'], ['_', '\uFF3F'],
    // ['`', '\uFF40'], ['b', '\uFF42'], ['f', '\uFF46'], ['g', '\uFF47'],
    // ['h', '\uFF48'], ['k', '\uFF4B'], ['n', '\uFF4E'], ['q', '\uFF51'],
    // ['r', '\uFF52'], ['t', '\uFF54'], ['u', '\uFF55'], ['w', '\uFF57'],
    // ['z', '\uFF5A'], ['{', '\uFF5B'], ['|', '\uFF5C'], ['}', '\uFF5D'],
    // ['~', '\uFF5E'],
  ];
  let newWord = word;
  homoglyphReplacements.forEach((replacement) => {
    newWord = newWord.replace(replacement[0], replacement[1]);
  });
  return newWord;
};

const nameToTag = ({ name, userNameMap }) => {
  const tag = (_.find(userNameMap, user => user.realName === name) || {}).name;
  // logger.info(tag, untagWord(`@${tag}`));
  return tag ? untagWord({ word: `@${tag}` }) : null;
};

const userIdToName = ({ id, userNameMap }) => {
  const name = (_.find(userNameMap, user => user.id === id) || {}).realName;
  return name || null;
};

const baseWagerDescription = ({ showStatus = false } = {}, { userNameMap }) =>
(wager) => {
  const id = wager.id;
  if (!id) return null;
  const makerOffer = getOfferDescription({
    description: wager.makerOfferDescription,
    amount: wager.makerOfferAmount,
    currency: wager.makerOfferCurrency,
  });
  const takerOffer = getOfferDescription({
    description: wager.takerOfferDescription,
    amount: wager.takerOfferAmount,
    currency: wager.takerOfferCurrency,
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
    body: JSON.stringify(decamelizeKeys(data)),
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  } : {
    method: 'GET',
  });

const fetchWrapper = ({ url, data }) => {
  const init = getInit({ data });
  logger.info(`Making request: ${init.method} - ${url}`);
  return fetch(url, init)
    .then((response) => {
      const logMessage =
        `Server responded with: ${response.status} - ${response.statusText}`;
      if (response.ok) {
        logger.info(logMessage);
        return response.text();
      }
      logger.warn(logMessage);
      throw new Error(response.status);
    })
    .then(text => camelizeKeys(JSON.parse(text)))
    .catch((error) => {
      if (STATUS_CODE_REGEX.test(error.message)) {
        throw error;
      }
      logger.error(error.toString());
    });
};

const handleReqestError = ({ kind, sendReply }) => (error) => {
  if (STATUS_CODE_REGEX.test(error.message)) {
    if (kind === KINDS.PROPOSE) {
      sendReply(MESSAGES.PROPOSE_FAILURE);
      return;
    }
    const messageFunction = STATUS_CODE_MESSAGE_FUNCTIONS[error.message];
    sendReply(
      messageFunction ? messageFunction(kind) : MESSAGES.SERVER_FAILURE
    );
    return;
  }
  logger.error(error.toString());
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
    return options.sendReply(MESSAGES.MISSING_ID_ARGUMENT);
  }
  const id = getIdFromStr(args[0]);
  if (!id) return options.sendReply(MESSAGES.MISSING_ID_ARGUMENT);
  return handler({ id, ...options });
};

const requiresUser = handler => (options) => {
  const args = options.argString && options.argString.split(' ');
  if (!args || args.length === 0 || !args[0]) {
    return options.sendReply(MESSAGES.MISSING_USER_ARGUMENT);
  }
  const usersName = userIdToName({
    id: getUserIdFromStr(args[0]),
    userNameMap: options.userNameMap,
  });
  if (!usersName) return options.sendReply(MESSAGES.NON_EXISTENT_USER);
  return handler({ usersName, ...options });
};

const makeOperationHandler = ({ kind }) =>
  requiresId(({ sendReply, id, fullName }) =>
    createOperation({ operation: { kind, wagerId: id, user: fullName } })
      .then(() => sendReply(MESSAGE_FUNCTIONS.operationSuccess(kind)))
      .catch(handleReqestError({ sendReply, kind })));

const userInvoledInWager = ({ user }) => wager =>
  wager.maker === user || wager.taker === user || wager.arbiter === user;

const handleAll = ({ sendReply, userNameMap }) =>
  getWagers({ filters: [(wager => !ERROR_STATUSES.includes(wager.status))] })
    .then(wagers => sendReply(
      wagers.map(getWagerStatusDescription({ userNameMap })).join('\n')
        || MESSAGE_FUNCTIONS.noResults()
    )).catch(handleReqestError({ sendReply }));

const handleShow = requiresId(({ sendReply, userNameMap, id }) =>
  getWager({ id })
    .then(wager => sendReply(getWagerDescription({ userNameMap })(wager)))
    .catch(handleReqestError({ sendReply })));

const handleHelp = ({ sendReply }) => sendReply(
`${pre('all')} - get all wagers
${pre('show <id>')} - get one wager
${pre('me')} - get your wagers
${pre('user <tag>')} - get their wagers
${pre('accept/reject/cancel/close/appeal <id>')} - advance the state of the \
wager
${pre(`listed/accepted/closed/completed/unaccepted/rejected/appealed/\
cancelled${''}`)} - get wagers by status
${pre('<tag> <offer>#<offer> <outcome>')} - make a wager
An offer consists of a dollar value, and an optional currency, or a \
double-quote delimited description.
Note that your full name on slack must match your name on Splitwise in order \
for the Splitwise integration to work.
There are a bunch more features such as expiration and maturation dates that \
I've implemented only on the backend so far - coming soon.`
);

const handleDefault = requiresUser((
  { sendReply, fullName, argString, usersName }
) => {
  const args = argString && argString.split(' ').slice(1).join(' ');
  const pledgeMatches = args && args.match(PLEDGE_REGEX);
  if (!pledgeMatches || pledgeMatches.length < 8) {
    return sendReply(MESSAGES.MALFORMED_PLEDGE);
  }
  const kind = KINDS.PROPOSE;
  return createOperation({
    operation: { kind },
    wager: {
      maker: fullName,
      taker: usersName,
      makerOfferDescription: pledgeMatches[1],
      makerOfferAmount: parseFloat(pledgeMatches[2]),
      makerOfferCurrency: pledgeMatches[3]
        || (parseFloat(pledgeMatches[2]) && DEFAULT_CURRENCY),
      takerOfferDescription: pledgeMatches[4],
      takerOfferAmount: parseFloat(pledgeMatches[5]),
      takerOfferCurrency: pledgeMatches[6]
        || (parseFloat(pledgeMatches[5]) && DEFAULT_CURRENCY),
      outcome: pledgeMatches[7],
    },
  }).then(() => sendReply(MESSAGES.PROPOSE_SUCCESS))
    .catch(handleReqestError({ kind, sendReply }));
});

const handleCommand = (command) => {
  switch (command) {
    case COMMAND_DETAILS.ALL.name:
      return handleAll;
    case COMMAND_DETAILS.SHOW.name:
      return handleShow;
    case COMMAND_DETAILS.HELP.name:
      return handleHelp;
    default:
      return makeOperationHandler({ kind: command });
  }
};

// TODO: move this into constants
const getErrorQualifierText = (filters) => {
  if (filters.length > 1) return 'such';
  else if (filters[0] === FILTER_DETAILS.MINE.name) return 'of your';
  else if (filters[0] === FILTER_DETAILS.USER.name) return 'of their';
  return filters[0];
};

// assume filetrs.length >= 1
const handleFilter = (filters) => {
  let showStatus = true;
  const filterMakers = filters.map((name) => {
    switch (name) {
      case FILTER_DETAILS.MINE.name:
        return ({ fullName }) => userInvoledInWager({ user: fullName });
      case FILTER_DETAILS.USER.name:
        return ({ usersName }) => userInvoledInWager({ user: usersName });
      default:
        showStatus = false;
        return () => wager => wager.status === name;
    }
  });
  const errorQualifierText = getErrorQualifierText(filters);
  const descriptionFunction = showStatus
    ? getWagerStatusDescription
    : getWagerDescription;
  const filterHandler = ({ sendReply, userNameMap, fullName, usersName }) =>
    getWagers({ filters:
      filterMakers.map(filterMaker => filterMaker({ fullName, usersName })),
    }).then(wagers => sendReply(
        wagers.map(descriptionFunction({ userNameMap })).join('\n')
          || MESSAGE_FUNCTIONS.noResults(errorQualifierText)
      )).catch(handleReqestError({ sendReply }));
  if (filters.includes(FILTER_DETAILS.USER.name)) {
    return requiresUser(filterHandler);
  }
  return filterHandler;
};

const makeSendReply = response => (reply) => {
  logger.info(`Sending message: ${reply.split('\n')[0]} ...`);
  response.end(reply);
};

export default function pledge(message, users, response) {
  const messageMatches = message.text && message.text.match(MESSAGE_REGEX);
  if (!messageMatches || messageMatches.length < 2) return;
  logger.info(`Received message: ${message.text}`);

  const sendReply = makeSendReply(response);
  const argString = messageMatches[1];
  const args = argString.split(' ');
  const firstArg = args[0];

  const userId = message.user;
  const user = camelizeKeys(_.pick(users[userId], USEFUL_USER_KEYS));
  const fullName = user.realName;
  // const tag = user.name;
  const userNameMap = _.values(users).map(
    u => camelizeKeys(_.pick(u, USEFUL_USER_KEYS))
  );

  const commandNames = _.keys(COMMAND_DETAILS);
  for (let i = 0; i < commandNames.length; i += 1) {
    const command = COMMAND_DETAILS[commandNames[i]];
    const names = command.aliases.concat(command.name);
    const argIsCommand = names.includes(firstArg.replace(OPTION_REGEX, ''));
    const argIsFlag = command.flag && firstArg === `-${command.flag}`;
    if (argIsCommand || argIsFlag) {
      handleCommand(command.name)({
        sendReply,
        fullName,
        userNameMap,
        argString: args.slice(1).join(' '),
      });
      return;
    }
  }

  const filters = [];

  const filterNames = _.keys(FILTER_DETAILS);
  args.some((arg) => {
    for (let i = 0; i < filterNames.length; i += 1) {
      const filter = FILTER_DETAILS[filterNames[i]];
      const names = filter.aliases.concat(filter.name);
      const argIsFilter = names.includes(arg.replace(OPTION_REGEX, ''));
      const argIsFlag = filter.flag && arg === `-${filter.flag}`;
      if (argIsFilter || argIsFlag) {
        filters.push(filter.name);
        break;
      }
      if (i === filterNames.length - 1) {
        return true;
      }
    }
    return false;
  });

  if (filters.length) {
    handleFilter(filters)({
      sendReply,
      fullName,
      userNameMap,
      argString: args.slice(filters.length).join(' '),
    });
    return;
  }

  if (firstArg[0] === '@') {
    sendReply(MESSAGES.NON_EXISTENT_USER);
    return;
  }
  if (!USER_ID_REGEX.test(firstArg)) {
    sendReply(MESSAGES.INVALID_COMMAND);
    return;
  }
  handleDefault({
    sendReply,
    fullName,
    userNameMap,
    argString,
  });
}
