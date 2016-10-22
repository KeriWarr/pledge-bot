import _ from 'lodash';

import { DEFAULT_CURRENCY } from './constants';


const ZERO_CENTS_REGEX = /\.0{1,2}$/;

const CURRENCY_EMOJI_MAP = {
  CAD: ':flag-ca:',
  USD: ':flag-us:',
  SZL: ':szl:',
  BYR: ':beer:',
};

/**
 * Removes a period followed by one or two zeroes from the end of str.
 */
const stripZeroCents = str => str && str.replace(ZERO_CENTS_REGEX, '');

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

export const userIdToName = ({ id, userNameMap }) => {
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

// TODO: parameterize these
export const getWagerDescription = baseWagerDescription.bind(null, {});

export const getWagerStatusDescription = baseWagerDescription.bind(null, {
  showStatus: true,
});
