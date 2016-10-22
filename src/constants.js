

export const ID_REGEX = /^\d+$/;
export const ZERO_CENTS_REGEX = /\.0{1,2}$/;
export const USER_ID_REGEX = /^<@(U[A-Z0-9]+)>$/;

export const DEFAULT_CURRENCY = 'CAD';
export const STATUSES = {
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
export const ERROR_STATUSES = [
  STATUSES.REJECTED,
  STATUSES.CANCELLED,
  STATUSES.EXPIRED,
  STATUSES.APPEALED,
];
export const KINDS = {
  TAKE: 'take',
  ACCEPT: 'accept',
  REJECT: 'reject',
  CANCEL: 'cancel',
  CLOSE: 'close',
  APPEAL: 'appeal',
  PROPOSE: 'propose',
};
export const KIND_PRESENT_PERFECT_TENSES = {
  [KINDS.TAKE]: 'taken',
  [KINDS.CANCELLED]: 'cancelled',
};
export const MESSAGES = {
  PROPOSE_SUCCESS: 'You\'ve created a wager!',
  SERVER_FAILURE: '/shrug Sorry, something went wrong.',
  MISSING_ID_ARGUMENT: 'You must specify an id.',
  MISSING_USER_ARGUMENT: 'You must specify a @user',
  NON_EXISTENT_USER: 'That user is not in this team.',
  MALFORMED_PLEDGE: 'Sorry, I couldn\'t understand that pledge.',
  INVALID_COMMAND: 'That is not a valid command.',
};
