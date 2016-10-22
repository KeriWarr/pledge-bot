import { camelizeKeys, decamelizeKeys } from 'humps';
import fetch from 'node-fetch';

import { KINDS, MESSAGES } from './constants';


const API_ROOT = 'http://pledge.keri.warr.ca';
const OPERATIONS_PATH = '/operations';
const WAGERS_PATH = '/wagers';

const STATUS_CODE_REGEX = /^\d{3}$/;
const STATUS_CODE_MESSAGE_FUNCTIONS = {
  404: () => 'That wager doesn\'t exist.',
  422: kind => `You can't ${kind} that wager.`,
};

const getInit = ({ data }) => (data
  ? {
    method: 'POST',
    body: JSON.stringify(decamelizeKeys(data)),
    headers: {
      'Content-Type': 'application/json',
    },
  } : {
    method: 'GET',
  });

const fetchWrapper = ({ url, data, logger }) => {
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


export default class Api {
  constructor({ logger }) {
    this.logger = logger;
    this.createOperation = this.createOperation.bind(this);
    this.getWagers = this.getWagers.bind(this);
    this.getWager = this.getWager.bind(this);
    this.handleReqestError = this.handleReqestError.bind(this);
  }

  createOperation = ({ operation, wager }) =>
    fetchWrapper({
      url: `${API_ROOT}${OPERATIONS_PATH}`,
      data: { operation, wager },
      logger: this.logger,
    })

  getWagers = ({ filters = [] } = {}) =>
    fetchWrapper({
      url: `${API_ROOT}${WAGERS_PATH}`
      logger: this.logger,
    })
      .then(data => filters.reduce(
          (wagers, filter) => wagers.filter(filter),
          data
        )
      )

  getWager = ({ id }) => fetchWrapper({
    url: `${API_ROOT}${WAGERS_PATH}/${id}`,
    logger: this.logger,
  });

  handleReqestError = ({ kind, sendReply }) => (error) => {
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
    this.logger.error(error.toString());
  }
}
