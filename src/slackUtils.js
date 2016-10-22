import { camelizeKeys } from 'humps';
import _ from 'lodash';

import {
  DEFAULT_CURRENCY,
  ZERO_CENTS_REGEX,
  USER_ID_REGEX,
} from './constants';


const CURRENCY_EMOJI_MAP = {
  CAD: ':flag-ca:',
  USD: ':flag-us:',
  SZL: ':szl:',
  BYR: ':beer:',
};
const homoglyphReplacements = [
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
];
const USEFUL_USER_KEYS = ['name', 'real_name', 'id'];

/**
 * Removes a period followed by one or two zeroes from the end of str.
 */
export const stripZeroCents = str => str && str.replace(ZERO_CENTS_REGEX, '');

/**
 * Slack italicization markup.
 */
export const italic = str => str && `_${str}_`;

/**
 * Slack boldicization markup.
 */
export const bold = str => str && `*${str}*`;

/**
 * Slack codeicization markup.
 */
export const pre = str => str && `\`${str}\``;

/**
 * Accepts a currency code string as per ISO 4217. If it is the default
 * currency, return the empty string, if it has a corresponding emoji, return
 * the emoji string, else return the original string.
 */
export const formatCurrency = currency => (currency === DEFAULT_CURRENCY ? ''
  : CURRENCY_EMOJI_MAP[currency] || currency);

/**
 * Formats data representation of an offer for slack.
 */
export const getOfferDescription = ({ description, amount, currency }) => {
  const formattedCurrency = formatCurrency(currency);
  const currencyDisplay = formattedCurrency ? ` ${formattedCurrency}` : '';
  return description
    ? `${description}`
    : `${bold(stripZeroCents(amount))}${currencyDisplay}`;
};

/**
 * Converts a string to use equivalet looking unicode characters so that
 * they dont' behave as tag words on slack.
 * TODO replace this with a better implementation using those invisible
 * space characters
 */
export const untagWord = (word = '') => homoglyphReplacements.reduce(
  (newWord, replacement) => newWord.replace(replacement[0], replacement[1]),
  word
);

/**
 * Converts a name to the corresponding slack users tag, modified so that it
 * won't cause a notification.
 */
const nameToTag = ({ name, userNameMap }) => untagWord(
  (_.find(userNameMap, user => user.realName === name) || {}).name
) || null;

/**
 * Converts a slack user id to the name belonging to that user.
 */
export const userIdToName = ({ id, userNameMap }) =>
  (_.find(userNameMap, user => user.id === id) || {}).realName || null;

/**
 * If str is a user id string from slack, i.e. wrapped in angle brackets,
 * return the user id inside, else return null.
 */
export const getUserIdFromStr = str =>
  str && ((str.match(USER_ID_REGEX) || [])[1] || null);

/**
 * Generates a functions that consumes a wager and returns a formatted
 * description of that wager.
 */
export const getWagerDescription = ({ userNameMap, showStatus }) => (wager) => {
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

  return `${pre(id)}${status}: ${maker}'s ${makerOffer} to ${taker}'s ` +
         `${takerOffer}${outcome}`;
};

/**
 * Consumes a dictionary of all slack users and one user id and returns an
 * object which contains only the useful keys.
 */
export const getUser = ({ users, id }) =>
  camelizeKeys(_.pick(users[id], USEFUL_USER_KEYS));

/**
 * Consumes a dictionary of all slack users and return an array of user objects
 * which contain only the useful keys.
 */
export const getUsers = users => _.values(users).map(
  user => camelizeKeys(_.pick(user, USEFUL_USER_KEYS))
);
