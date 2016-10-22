import { camelizeKeys } from 'humps';
import _ from 'lodash';

import logger from './logger';
import { DEFAULT_CURRENCY, KINDS, STATUSES, MESSAGES } from './constants';
import {
  pre,
  userIdToName,
  getWagerStatusDescription,
  getWagerDescription,
} from './slackUtils';
import {
  createOperation,
  handleReqestError,
  getWagers,
  getWager,
} from './api';


const ID_REGEX = /^\d+$/;
const MESSAGE_REGEX = /^(?:I )?(?:@?pledge|<@U1V3QU2BU>) (.+)$/i;
// The second option is a unicode double dash
const OPTION_REGEX = /^(--|—)/;
const USER_ID_REGEX = /^<@(U[A-Z0-9]+)>$/;
const OFFER_REGEX_STRING = '(?:"([\\w ]+)"|(\\d+(?:\\.\\d{2})?))([A-Z]{3})?';
const PLEDGE_REGEX = new RegExp(
  `^${OFFER_REGEX_STRING}#${OFFER_REGEX_STRING}(?: that)? (.+)$`, 'i'
);

const USEFUL_USER_KEYS = ['name', 'real_name', 'id'];


export const STATUSES_ARRAY = _.values(STATUSES);

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
