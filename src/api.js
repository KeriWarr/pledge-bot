import { camelizeKeys, decamelizeKeys } from 'humps';
import fetch from 'node-fetch';


const API_ROOT = 'http://pledge.keri.warr.ca';
const OPERATIONS_PATH = '/operations';
const WAGERS_PATH = '/wagers';
const STATUS_CODE_REGEX = /^\d{3}$/;
const STATUS_CODE_MESSAGE_FUNCTIONS = {
  404: () => 'That wager doesn\'t exist.',
  422: kind => `You can't ${kind} that wager.`,
};


/**
 * Generates the a config to be passed into `fetch`
 */
const makeInit = data => (data
  ? {
    method: 'POST',
    body: JSON.stringify(decamelizeKeys(data)),
    headers: {
      'Content-Type': 'application/json',
    },
  } : {
    method: 'GET',
  });

/**
 * Convenience method, mostly for the sake of logging and such.
 * return camelized JSON, or a server error.
 */
const fetchWrapper = ({ url, data, logger }) => {
  const init = makeInit(data);
  logger.log('info', `Making request: ${init.method} - ${url}`);

  return fetch(url, init)
    .then((response) => {
      const logMessage =
        `Server responded with: ${response.status} - ${response.statusText}`;
      if (response.ok) {
        logger.log('info', logMessage);
        return response.text();
      }
      logger.log('warn', logMessage);
      throw new Error(response.status);
    })
    .then(text => camelizeKeys(JSON.parse(text)))
    .catch((error) => {
      if (STATUS_CODE_REGEX.test(error.message)) {
        throw error;
      }
      logger.log('error', error.toString());
    });
};


export default class Api {
  constructor({ logger }) {
    this.logger = logger || console;
    this.createOperation = this.createOperation.bind(this);
    this.getWagers = this.getWagers.bind(this);
    this.getWager = this.getWager.bind(this);
    this.handleReqestError = this.handleReqestError.bind(this);
    // Wrap fetchWrapper to always pass in the logger;
    this.fetchWrapper = options => fetchWrapper(Object.assign({},
      options,
      { logger: this.logger },
    ));
  }

  createOperation = ({ operation, wager }) =>
    this.fetchWrapper({
      url: `${API_ROOT}${OPERATIONS_PATH}`,
      data: { operation, wager },
    })

  /**
   * Fetches all wagers and then repeatedly filters them using the supplied
   * array of predicates.
   */
  getWagers = ({ filters = [] } = {}) =>
    this.fetchWrapper({ url: `${API_ROOT}${WAGERS_PATH}` })
      .then(data => filters.reduce(
        (wagers, filter) => wagers.filter(filter),
        data
      ))

  getWager = id => this.fetchWrapper({
    url: `${API_ROOT}${WAGERS_PATH}/${id}`,
  });

  handleReqestError = ({ kind, sendReply }) => (error) => {
    if (STATUS_CODE_REGEX.test(error.message)) {
      const messageFunction = STATUS_CODE_MESSAGE_FUNCTIONS[error.message];
      sendReply(
        messageFunction
          ? messageFunction(kind)
          : '/shrug Sorry, something went wrong',
      );
      return;
    }
    // TODO disable stack trace on prod
    this.logger.log('error', `${error.toString()}\n${error.stack}`);
  }
}
