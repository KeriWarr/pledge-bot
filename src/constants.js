

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
export const KINDS = {
  TAKE: 'take',
  ACCEPT: 'accept',
  REJECT: 'reject',
  CANCEL: 'cancel',
  CLOSE: 'close',
  APPEAL: 'appeal',
  PROPOSE: 'propose',
};
export const MESSAGES = {
  PROPOSE_SUCCESS: 'You\'ve created a wager!',
  SERVER_FAILURE: '/shrug Sorry, something went wrong.',
  MISSING_ID_ARGUMENT: 'You must specify an id.',
  MISSING_USER_ARGUMENT: 'You must specify a @user',
  NON_EXISTENT_USER: 'That user is not in this team.',
  MALFORMED_PLEDGE: 'Sorry, I couldn\'t understand that pledge.',
  PROPOSE_FAILURE: 'Sorry, the backend didn\'t like that wager',
  INVALID_COMMAND: 'That is not a valid command.',
};
