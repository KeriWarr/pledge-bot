import _ from 'lodash';

import logger from './logger';
import {
  DEFAULT_CURRENCY,
  KINDS,
  STATUSES,
  MESSAGES,
  USER_ID_REGEX,
  ID_REGEX,
  ERROR_STATUSES,
  KIND_PRESENT_PERFECT_TENSES,
} from './constants';
import {
  pre,
  userIdToName,
  getWagerDescription,
  getUserIdFromStr,
  getUser,
  getUsers,
} from './slackUtils';
import Api from './api';

const {
  createOperation,
  getWager,
  getWagers,
  handleReqestError,
} = new Api({ logger });


const MESSAGE_REGEX = /^(?:I )?(?:@?pledge|<@U1V3QU2BU>) (.+)$/i;
// The second option is a unicode double dash
const OPTION_REGEX = /^(--|—)/;
const OFFER_REGEX_STRING = '(?:"([\\w ]+)"|(\\d+(?:\\.\\d{2})?))([A-Z]{3})?';
const PLEDGE_REGEX = new RegExp(
  `^${OFFER_REGEX_STRING}#${OFFER_REGEX_STRING}(?: that)? (.+)$`, 'i'
);
const STATUSES_ARRAY = _.values(STATUSES);
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
    followUp: ({ wagerId }) =>
      `The wager can be confirmed by saying: ${pre(`pledge accept ${wagerId}`)}`,
  },
  [KINDS.ACCEPT]: {
    name: KINDS.ACCEPT,
    aliases: ['affirm'],
    flag: 'a',
    followUp: ({ wagerId }) =>
      `The wager can be closed by saying: ${pre(`pledge close ${wagerId}`)}`,
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
    followUp: ({ wagerId }) =>
      `The wager can be appaeled by saying: ${pre(`pledge appeal ${wagerId}`)}`,
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
 * If str is a sequence of digits, return it, otherwise return null.
 */
const getIdFromStr = str => str && ((str.match(ID_REGEX) || [])[0] || null);

/**
 * wrapper on a handler which grabs an id from the passed in argString,
 * replys with an error if it doesn't exist, and passes it down into the
 * handler if it does.
 */
const requiresId = handler => (options) => {
  const { argString, sendReply } = options;
  const args = argString && argString.split(' ');
  if (!args || args.length === 0 || !args[0]) {
    return sendReply(MESSAGES.MISSING_ID_ARGUMENT);
  }
  const id = getIdFromStr(args[0]);
  if (!id) return sendReply(MESSAGES.MISSING_ID_ARGUMENT);
  return handler({ id, ...options });
};

/**
 * does the same thing as `requiresId` except with a user tag
 */
const requiresUser = handler => (options) => {
  const { argString, sendReply, userNameMap } = options;
  const args = argString && argString.split(' ');
  if (!args || args.length === 0 || !args[0]) {
    return sendReply(MESSAGES.MISSING_USER_ARGUMENT);
  }
  const usersName = userIdToName({
    userNameMap,
    id: getUserIdFromStr(args[0]),
  });
  if (!usersName) return sendReply(MESSAGES.NON_EXISTENT_USER);
  return handler({ usersName, ...options });
};

/**
 * Makes a function that send a reply based on a newly created operation.
 */
const makeCreatedOperationHandler = ({ sendReply, kind }) => operation =>
  sendReply(`You've ${KIND_PRESENT_PERFECT_TENSES[kind] || `${kind}ed`} ` +
            `the wager!\n${(COMMAND_DETAILS[kind].followUp
              ? COMMAND_DETAILS[kind].followUp(operation)
              : '')}`);

/**
 * Handles a command to perform an operation.
 */
const makeOperationHandler = kind =>
  requiresId(({ sendReply, id, fullName }) =>
    createOperation({ operation: { kind, wagerId: id, user: fullName } })
      .then(makeCreatedOperationHandler({ sendReply, kind }))
      .catch(handleReqestError({ sendReply, kind })));

/**
 * Generates a predicate to determine if a user should be considered to be
 * involved in a given wager.
 */
const userInvoledInWager = user => wager =>
  wager.maker === user || wager.taker === user || wager.arbiter === user;

/**
 * Handles the command to show all wagers. Only shows wagers that aren't
 * currently in an error status.
 */
const handleAll = ({ sendReply, userNameMap }) =>
  getWagers({ filters: [(wager => !ERROR_STATUSES.includes(wager.status))] })
    .then(wagers => sendReply(
      wagers.map(getWagerDescription({
        userNameMap,
        showStatus: true,
      })).join('\n')
        || 'I couldn\'t find any wagers'
    )).catch(handleReqestError({ sendReply }));

/**
 * Handles the command to shw a single wager.
 */
const handleShow = requiresId(({ sendReply, userNameMap, id }) =>
  getWager(id)
    .then(wager => sendReply(getWagerDescription({ userNameMap })(wager)))
    .catch(handleReqestError({ sendReply })));

/**
 * Displays the help dialog.
 */
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

/**
 * Handles all commands that don't fit into one of the previous buckets.
 * The only remaining functionality is to allow the creation of wagers.
 */
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

/**
 * Calls the correct command handler.
 */
const handleCommand = (command) => {
  switch (command) {
    case COMMAND_DETAILS.ALL.name:
      return handleAll;
    case COMMAND_DETAILS.SHOW.name:
      return handleShow;
    case COMMAND_DETAILS.HELP.name:
      return handleHelp;
    default:
      return makeOperationHandler(command);
  }
};

/**
 * Provides the language for the case where no wagers were found that match
 * the given filters.
 */
const getErrorQualifierText = (filters) => {
  if (filters.length > 1) return 'such';
  else if (filters[0] === FILTER_DETAILS.MINE.name) return 'of your';
  else if (filters[0] === FILTER_DETAILS.USER.name) return 'of their';
  return filters[0];
};

/**
 * Filters and shows wagers based on the supplied argumets.
 * Note: assumes that filters.length >= 1
 */
const handleFilter = (filters) => {
  let showStatus = true;
  const filterMakers = filters.map((name) => {
    switch (name) {
      case FILTER_DETAILS.MINE.name:
        return ({ fullName }) => userInvoledInWager(fullName);
      case FILTER_DETAILS.USER.name:
        return ({ usersName }) => userInvoledInWager(usersName);
      default:
        showStatus = false;
        return () => wager => wager.status === name;
    }
  });
  const errorQualifierText = getErrorQualifierText(filters);
  const filterHandler = ({ sendReply, userNameMap, fullName, usersName }) =>
    getWagers({ filters:
      filterMakers.map(filterMaker => filterMaker({ fullName, usersName })),
    }).then(wagers => sendReply(
        wagers.map(getWagerDescription({ userNameMap, showStatus })).join('\n')
          || `I couldn't find any ${errorQualifierText} wagers.`
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
  const user = getUser({ users, id: userId });
  const fullName = user.realName;
  // const tag = user.name;
  const userNameMap = getUsers(users);

  // Look for a command and call the command handler.
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

  // Look for filters and call the filter handler.
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

  /**
   * If the first letter is an @, that suggests that the user tried to tag
   * someone but the input was not replaced with a used id by slack, which
   * happens when the tag does not belong to an existant user.
   */
  if (firstArg[0] === '@') {
    sendReply(MESSAGES.NON_EXISTENT_USER);
    return;
  }

  /**
   * For now, commands to make a wager always begin with a user tag.
   */
  if (!USER_ID_REGEX.test(firstArg)) {
    sendReply(MESSAGES.INVALID_COMMAND);
    return;
  }

  /**
   * If we get this far, the message is probably trying to create a wager.
   */
  handleDefault({
    sendReply,
    fullName,
    userNameMap,
    argString,
  });
}
